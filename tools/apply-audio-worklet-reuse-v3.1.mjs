import fs from 'node:fs';
import path from 'node:path';

const file = path.join(process.cwd(), 'apps/web/src/noiseGate.ts');
if (!fs.existsSync(file)) throw new Error(`Dosya bulunamadi: ${file}`);

const source = String.raw`import { Track } from 'livekit-client';
import type { AudioProcessorOptions, TrackProcessor } from 'livekit-client';
import gtcrnWorkletPath from '@sapphi-red/web-noise-suppressor/gtcrnWorklet.js?url';
import gtcrnWasmPath from '@sapphi-red/web-noise-suppressor/gtcrn.wasm?url';
import rnnoiseWorkletPath from '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url';
import rnnoiseWasmPath from '@sapphi-red/web-noise-suppressor/rnnoise.wasm?url';
import rnnoiseWasmSimdPath from '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url';

type SuppressorNode = AudioWorkletNode & { destroy: () => void };
type SuppressorKind = 'gtcrn' | 'rnnoise' | 'raw';
type SuppressorModule = typeof import('@sapphi-red/web-noise-suppressor');

const PRIMARY_ENGINE: 'gtcrn' | 'rnnoise' = 'gtcrn';

let suppressorModulePromise: Promise<SuppressorModule> | undefined;
let gtcrnBinaryPromise: Promise<ArrayBuffer> | undefined;
let rnnoiseBinaryPromise: Promise<ArrayBuffer> | undefined;
const gtcrnReadyContexts = new WeakSet<AudioContext>();
const rnnoiseReadyContexts = new WeakSet<AudioContext>();

function loadSuppressorModule() {
  if (!suppressorModulePromise) {
    suppressorModulePromise = import('@sapphi-red/web-noise-suppressor').catch(error => {
      suppressorModulePromise = undefined;
      throw error;
    });
  }
  return suppressorModulePromise;
}

async function makeGtcrn(context: AudioContext, module: SuppressorModule): Promise<SuppressorNode> {
  if (!gtcrnBinaryPromise) {
    gtcrnBinaryPromise = module.loadGtcrn({ url: gtcrnWasmPath }).catch(error => {
      gtcrnBinaryPromise = undefined;
      throw error;
    });
  }
  if (!gtcrnReadyContexts.has(context)) {
    await context.audioWorklet.addModule(gtcrnWorkletPath);
    gtcrnReadyContexts.add(context);
  }
  return new module.GtcrnWorkletNode(context, {
    wasmBinary: await gtcrnBinaryPromise,
    maxChannels: 1,
  }) as SuppressorNode;
}

async function makeRnnoise(context: AudioContext, module: SuppressorModule): Promise<SuppressorNode> {
  if (!rnnoiseBinaryPromise) {
    rnnoiseBinaryPromise = module.loadRnnoise({
      url: rnnoiseWasmPath,
      simdUrl: rnnoiseWasmSimdPath,
    }).catch(error => {
      rnnoiseBinaryPromise = undefined;
      throw error;
    });
  }
  if (!rnnoiseReadyContexts.has(context)) {
    await context.audioWorklet.addModule(rnnoiseWorkletPath);
    rnnoiseReadyContexts.add(context);
  }
  return new module.RnnoiseWorkletNode(context, {
    wasmBinary: await rnnoiseBinaryPromise,
    maxChannels: 1,
  }) as SuppressorNode;
}

async function createSuppressor(context: AudioContext): Promise<{ node: SuppressorNode; kind: Exclude<SuppressorKind, 'raw'> } | null> {
  if (context.sampleRate !== 48_000 || typeof AudioWorkletNode === 'undefined') {
    console.warn('[voice:v3.1] AI unavailable; raw + gate fallback', {
      sampleRate: context.sampleRate,
      audioWorklet: typeof AudioWorkletNode !== 'undefined',
    });
    return null;
  }

  const module = await loadSuppressorModule();
  const attempts: Array<'gtcrn' | 'rnnoise'> = PRIMARY_ENGINE === 'gtcrn'
    ? ['gtcrn', 'rnnoise']
    : ['rnnoise', 'gtcrn'];

  for (const engine of attempts) {
    try {
      const node = engine === 'gtcrn'
        ? await makeGtcrn(context, module)
        : await makeRnnoise(context, module);
      console.info('[voice:v3.1] AI worklet created', {
        engine: engine.toUpperCase(),
        primary: PRIMARY_ENGINE,
        sampleRate: context.sampleRate,
        channels: 1,
      });
      return { node, kind: engine };
    } catch (error) {
      console.warn(`[voice:v3.1] ${engine.toUpperCase()} init failed`, error);
    }
  }

  console.warn('[voice:v3.1] AI init failed; raw + gate fallback');
  return null;
}

export class NoiseGateProcessor implements TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> {
  readonly name = 'shakechat-stable-ai-gate-v3.1';
  processedTrack?: MediaStreamTrack;

  private context?: AudioContext;
  private source?: MediaStreamAudioSourceNode;
  private suppressor?: SuppressorNode;
  private suppressorKind: SuppressorKind = 'raw';
  private suppressorAttempted = false;
  private inputBus?: GainNode;
  private analyser?: AnalyserNode;
  private delay?: DelayNode;
  private gateGain?: GainNode;
  private destination?: MediaStreamAudioDestinationNode;
  private meterTimer?: number;
  private samples?: Float32Array<ArrayBuffer>;

  private aiEnabled = true;
  private gateEnabled = true;
  private thresholdDb = -60;
  private openUntil = 0;
  private aboveSince = 0;
  private noiseFloorDb = -72;

  private readonly lookAheadSeconds = 0.035;
  private readonly holdMs = 240;
  private readonly closedGain = 0.00025;

  constructor(aiEnabled = true, gateEnabled = true, thresholdDb = -60) {
    this.setSettings(aiEnabled, gateEnabled, thresholdDb);
  }

  setSettings(aiEnabled: boolean, gateEnabled: boolean, thresholdDb: number) {
    this.aiEnabled = aiEnabled;
    this.gateEnabled = gateEnabled;
    this.thresholdDb = Math.max(-70, Math.min(-25, thresholdDb));
    this.aboveSince = 0;

    const context = this.context;
    const gate = this.gateGain;
    if (context && gate) {
      gate.gain.cancelScheduledValues(context.currentTime);
      if (!gateEnabled) gate.gain.setTargetAtTime(1, context.currentTime, 0.006);
    }
  }

  getEngine() {
    return this.aiEnabled ? this.suppressorKind : 'raw';
  }

  getDebugState() {
    return {
      engine: this.getEngine(),
      aiEnabled: this.aiEnabled,
      gateEnabled: this.gateEnabled,
      thresholdDb: this.thresholdDb,
      sampleRate: this.context?.sampleRate,
      workletReused: Boolean(this.suppressor),
    };
  }

  async init(options: AudioProcessorOptions) {
    const context = options.audioContext;
    if (!context) throw new Error('ShakeChat audio processor requires an AudioContext during init.');
    this.context = context;
    this.buildOutputGraph(context);
    await this.connectInput(options.track);
    console.info('[voice:v3.1] processor initialized', this.getDebugState());
  }

  async restart(options: AudioProcessorOptions) {
    // LiveKit 2.22.x intentionally does not pass audioContext again on restart.
    // More importantly, do NOT destroy/recreate the AI worklet here. v0.4.0 of
    // web-noise-suppressor keeps a destroyed AudioWorkletProcessor alive; reusing
    // one worklet avoids accumulating processors after device/profile restarts.
    const context = options.audioContext || this.context;
    if (!context) throw new Error('ShakeChat audio processor context is unavailable during restart.');

    if (this.context !== context || !this.inputBus || !this.destination) {
      this.destroyGraph(false);
      this.context = context;
      this.buildOutputGraph(context);
    }

    await this.connectInput(options.track);
    console.info('[voice:v3.1] input track swapped; worklet/output reused', this.getDebugState());
  }

  async destroy() {
    this.destroyGraph(true);
  }

  private buildOutputGraph(context: AudioContext) {
    const inputBus = context.createGain();
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.08;
    const delay = context.createDelay(0.08);
    delay.delayTime.value = this.lookAheadSeconds;
    const gateGain = context.createGain();
    gateGain.gain.value = this.gateEnabled ? this.closedGain : 1;
    const destination = context.createMediaStreamDestination();

    inputBus.connect(analyser);
    inputBus.connect(delay);
    delay.connect(gateGain);
    gateGain.connect(destination);

    this.inputBus = inputBus;
    this.analyser = analyser;
    this.delay = delay;
    this.gateGain = gateGain;
    this.destination = destination;
    this.processedTrack = destination.stream.getAudioTracks()[0];
    this.samples = new Float32Array(new ArrayBuffer(analyser.fftSize * Float32Array.BYTES_PER_ELEMENT));
    this.openUntil = 0;
    this.aboveSince = 0;
    this.noiseFloorDb = -72;

    if (this.meterTimer !== undefined) window.clearInterval(this.meterTimer);
    this.meterTimer = window.setInterval(() => this.updateGate(), 10);
  }

  private async ensureSuppressor() {
    const context = this.context;
    const inputBus = this.inputBus;
    if (!context || !inputBus) return false;
    if (this.suppressor) return true;
    if (this.suppressorAttempted) return false;

    this.suppressorAttempted = true;
    const result = await createSuppressor(context);
    if (!result) {
      this.suppressorKind = 'raw';
      return false;
    }

    this.suppressor = result.node;
    this.suppressorKind = result.kind;
    result.node.connect(inputBus);
    return true;
  }

  private async connectInput(track: MediaStreamTrack) {
    const context = this.context;
    const inputBus = this.inputBus;
    if (!context || !inputBus) throw new Error('ShakeChat output graph is not initialized.');

    try { this.source?.disconnect(); } catch {}
    this.source = undefined;

    const source = context.createMediaStreamSource(new MediaStream([track]));
    this.source = source;

    if (this.aiEnabled && await this.ensureSuppressor()) {
      source.connect(this.suppressor!);
    } else {
      source.connect(inputBus);
    }

    // A profile/device restart always starts gate state from a known point.
    this.openUntil = 0;
    this.aboveSince = 0;
    this.noiseFloorDb = -72;
    const gate = this.gateGain;
    if (gate) {
      gate.gain.cancelScheduledValues(context.currentTime);
      gate.gain.setValueAtTime(this.gateEnabled ? this.closedGain : 1, context.currentTime);
    }
  }

  private updateGate() {
    const context = this.context;
    const analyser = this.analyser;
    const gateGain = this.gateGain;
    const samples = this.samples;
    if (!context || !analyser || !gateGain || !samples) return;

    if (!this.gateEnabled) {
      gateGain.gain.setTargetAtTime(1, context.currentTime, 0.006);
      return;
    }

    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (let i = 0; i < samples.length; i += 1) sum += samples[i] * samples[i];
    const rms = Math.sqrt(sum / samples.length);
    const db = 20 * Math.log10(Math.max(rms, 1e-7));
    const now = performance.now();

    if (now > this.openUntil && db < this.thresholdDb + 8) {
      this.noiseFloorDb = (this.noiseFloorDb * 0.98) + (db * 0.02);
    }

    const adaptiveMargin = this.getEngine() === 'raw' ? 10 : 7;
    const effectiveOpen = Math.max(this.thresholdDb, this.noiseFloorDb + adaptiveMargin);
    const effectiveClose = effectiveOpen - 3;
    const aboveOpen = db >= effectiveOpen;
    const belowClose = db < effectiveClose;
    const minimumVoiceMs = this.thresholdDb >= -56 ? 28 : 22;

    if (aboveOpen) {
      if (!this.aboveSince) this.aboveSince = now;
      if (now - this.aboveSince >= minimumVoiceMs) {
        this.openUntil = now + this.holdMs;
        gateGain.gain.setTargetAtTime(1, context.currentTime, 0.003);
      }
    } else if (belowClose) {
      this.aboveSince = 0;
    }

    if (now > this.openUntil && belowClose) {
      gateGain.gain.setTargetAtTime(this.closedGain, context.currentTime, 0.09);
    }
  }

  private destroyGraph(stopOutput: boolean) {
    if (this.meterTimer !== undefined) window.clearInterval(this.meterTimer);
    this.meterTimer = undefined;

    try { this.source?.disconnect(); } catch {}
    try { this.suppressor?.destroy(); } catch {}
    try { this.suppressor?.disconnect(); } catch {}
    // v0.4.0 worklets do not terminate their processor loop on destroy. Closing
    // the port plus reusing the node during normal restarts limits lifetime/leaks
    // to at most one worklet per joined local microphone processor.
    try { this.suppressor?.port.close(); } catch {}
    try { this.inputBus?.disconnect(); } catch {}
    try { this.analyser?.disconnect(); } catch {}
    try { this.delay?.disconnect(); } catch {}
    try { this.gateGain?.disconnect(); } catch {}

    if (stopOutput) {
      try { this.processedTrack?.stop(); } catch {}
    }

    this.source = undefined;
    this.suppressor = undefined;
    this.suppressorKind = 'raw';
    this.suppressorAttempted = false;
    this.inputBus = undefined;
    this.analyser = undefined;
    this.delay = undefined;
    this.gateGain = undefined;
    this.destination = undefined;
    this.samples = undefined;
    if (stopOutput) this.processedTrack = undefined;
  }
}
`;

fs.writeFileSync(file, source);
console.log('\n=== ShakeChat Audio Worklet Reuse v3.1 uygulandi ===');
console.log('- LiveKit mic restart: sadece input source degisir');
console.log('- AI worklet ayni AudioContext icinde yeniden kullanilir');
console.log('- Processed output track yeniden yaratilmadan korunur');
console.log('- web-noise-suppressor 0.4.0 worklet birikmesi sinirlandirilir');
console.log('- GTCRN primary / RNNoise fallback korunur');
