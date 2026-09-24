import { Track } from 'livekit-client';
import type { AudioProcessorOptions, TrackProcessor } from 'livekit-client';
import rnnoiseVadWorkletPath from './rnnoiseVadWorklet.js?worker&url';
import rnnoiseWasmPath from '@sapphi-red/web-noise-suppressor/rnnoise.wasm?url';
import rnnoiseWasmSimdPath from '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url';
import { loadPreferences } from './preferences';
import { RnnoiseVadState } from './rnnoiseVadState';

type RnnoiseModule = typeof import('@sapphi-red/web-noise-suppressor');

export type VoiceProcessorDiagnostics = {
  rnnoiseReady: boolean;
  vadProbability: number;
  vadSpeech: boolean;
  autoGainEnabled: boolean;
  autoGainDb: number;
};

let rnnoiseModulePromise: Promise<RnnoiseModule> | undefined;
let rnnoiseBinaryPromise: Promise<ArrayBuffer> | undefined;
const rnnoiseReadyContexts = new WeakSet<AudioContext>();

async function loadRnnoiseModule() {
  if (!rnnoiseModulePromise) {
    rnnoiseModulePromise = import('@sapphi-red/web-noise-suppressor').catch(error => {
      rnnoiseModulePromise = undefined;
      throw error;
    });
  }
  return rnnoiseModulePromise;
}

async function prepareRnnoise(context: AudioContext) {
  const rnnoiseModule = await loadRnnoiseModule();

  if (!rnnoiseBinaryPromise) {
    rnnoiseBinaryPromise = rnnoiseModule.loadRnnoise({
      url: rnnoiseWasmPath,
      simdUrl: rnnoiseWasmSimdPath,
    }).catch(error => {
      rnnoiseBinaryPromise = undefined;
      throw error;
    });
  }

  if (!rnnoiseReadyContexts.has(context)) {
    await context.audioWorklet.addModule(rnnoiseVadWorkletPath);
    rnnoiseReadyContexts.add(context);
  }

  return { wasmBinary: await rnnoiseBinaryPromise };
}

function defaultAutoGainEnabled() {
  try { return loadPreferences().autoGainControl; } catch { return false; }
}

function dbToGain(db: number) {
  return Math.pow(10, db / 20);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export class NoiseGateProcessor implements TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> {
  readonly name = 'shakechat-rnnoise-vad-gate';
  processedTrack?: MediaStreamTrack;

  private context?: AudioContext;
  private source?: MediaStreamAudioSourceNode;
  private rnnoise?: AudioWorkletNode;
  private denoisedGain?: GainNode;
  private rawGain?: GainNode;
  private inputMix?: GainNode;
  private suppressionEnabled = true;
  private analyser?: AnalyserNode;
  private agcGain?: GainNode;
  private compressor?: DynamicsCompressorNode;
  private limiter?: DynamicsCompressorNode;
  private delay?: DelayNode;
  private gain?: GainNode;
  private bypassGain?: GainNode;
  private destination?: MediaStreamAudioDestinationNode;
  private meterTimer?: number;
  private samples?: Float32Array<ArrayBuffer>;
  private enabled = true;
  private autoGainEnabled = false;
  private thresholdDb = -48;
  private openUntil = 0;
  private aboveSince = 0;
  private noiseFloorDb = -70;
  private rnnoiseReady = false;
  private lastAgcTargetDb = 0;
  private agcHoldUntil = 0;
  private readonly vad = new RnnoiseVadState();

  // Give VAD enough time to distinguish a real syllable from a desk/keyboard
  // impulse before the corresponding audio reaches the output gate.
  private readonly lookAheadSeconds = 0.075;
  private readonly minimumFallbackVoiceMs = 45;
  private readonly holdMs = 150;
  private readonly closedGain = 0;
  private readonly agcTargetDb = -20;
  private readonly agcMaxBoostDb = 12;
  private readonly agcMaxCutDb = -6;
  private readonly agcSpeechHoldMs = 360;

  constructor(enabled = true, thresholdDb = -48, suppressionEnabled = true, autoGainEnabled = defaultAutoGainEnabled()) {
    this.setSettings(enabled, thresholdDb, suppressionEnabled, autoGainEnabled);
  }

  setSettings(enabled: boolean, thresholdDb: number, suppressionEnabled = true, autoGainEnabled = defaultAutoGainEnabled()) {
    this.enabled = enabled;
    this.suppressionEnabled = suppressionEnabled;
    this.autoGainEnabled = autoGainEnabled;
    this.thresholdDb = Math.max(-70, Math.min(-25, thresholdDb));
    this.aboveSince = 0;
    this.applyMixState();
    this.applyAgcStaticState();
  }

  getDiagnostics(now = typeof performance !== 'undefined' ? performance.now() : 0): VoiceProcessorDiagnostics {
    return {
      rnnoiseReady: this.rnnoiseReady,
      vadProbability: this.vad.probability,
      vadSpeech: this.rnnoiseReady && this.vad.isFresh(now) && this.vad.isSpeechStable(now),
      autoGainEnabled: this.autoGainEnabled,
      autoGainDb: this.autoGainEnabled ? this.lastAgcTargetDb : 0,
    };
  }

  async init(options: AudioProcessorOptions) {
    await this.build(options);
  }

  async restart(options: AudioProcessorOptions) {
    this.disconnect(false);
    await this.build(options);
  }

  async destroy() {
    this.disconnect(true);
  }

  private async build(options: AudioProcessorOptions) {
    const context = options.audioContext;
    this.context = context;

    const source = context.createMediaStreamSource(new MediaStream([options.track]));
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.1;

    const delay = context.createDelay(0.12);
    delay.delayTime.value = this.lookAheadSeconds;

    const gain = context.createGain();
    const bypassGain = context.createGain();
    const destination = context.createMediaStreamDestination();

    this.source = source;
    this.analyser = analyser;
    this.delay = delay;
    this.gain = gain;
    this.bypassGain = bypassGain;
    this.destination = destination;

    const inputMix = context.createGain();
    const rawGain = context.createGain();
    const denoisedGain = context.createGain();
    this.inputMix = inputMix;
    this.rawGain = rawGain;
    this.denoisedGain = denoisedGain;
    // Start silent: never leak raw capture while the worklet is loading.
    rawGain.gain.value = 0;
    denoisedGain.gain.value = 0;
    source.connect(rawGain);
    rawGain.connect(inputMix);
    denoisedGain.connect(inputMix);
    const processedInput: AudioNode = inputMix;
    this.rnnoiseReady = false;
    this.vad.reset();

    if (context.sampleRate === 48_000 && typeof AudioWorkletNode !== 'undefined') {
      try {
        const { wasmBinary } = await prepareRnnoise(context);
        const rnnoise = new AudioWorkletNode(context, 'shakechat-rnnoise-vad', {
          processorOptions: {
            wasmBinary,
            maxChannels: 2,
          },
        });
        rnnoise.port.addEventListener('message', event => {
          if (event.data?.type !== 'vad') return;
          this.vad.push(Number(event.data.probability), performance.now());
        });
        rnnoise.port.start();
        source.connect(rnnoise);
        this.rnnoise = rnnoise;
        rnnoise.connect(denoisedGain);
        this.rnnoiseReady = true;
        console.info('[voice] RNNoise suppression + VAD ready', { sampleRate: context.sampleRate, maxChannels: 2 });
      } catch (error) {
        console.warn('[voice] RNNoise VAD unavailable, falling back to level gate', error);
      }
    } else {
      console.warn('[voice] RNNoise VAD skipped because a 48 kHz AudioWorklet context is unavailable', {
        sampleRate: context.sampleRate,
        audioWorklet: typeof AudioWorkletNode !== 'undefined',
      });
    }

    const agcGain = context.createGain();
    const compressor = context.createDynamicsCompressor();
    const limiter = context.createDynamicsCompressor();
    this.agcGain = agcGain;
    this.compressor = compressor;
    this.limiter = limiter;
    agcGain.gain.value = 1;
    this.applyAgcStaticState();

    processedInput.connect(analyser);
    processedInput.connect(agcGain);
    agcGain.connect(compressor);
    compressor.connect(limiter);
    limiter.connect(delay);
    delay.connect(gain);
    gain.connect(destination);

    // Bypass only the gate. RNNoise and ShakeChat AGC/compression remain in the path.
    limiter.connect(bypassGain);
    bypassGain.connect(destination);

    this.processedTrack = destination.stream.getAudioTracks()[0];
    this.samples = new Float32Array(new ArrayBuffer(analyser.fftSize * Float32Array.BYTES_PER_ELEMENT));
    this.openUntil = 0;
    this.aboveSince = 0;
    this.noiseFloorDb = -70;
    this.lastAgcTargetDb = 0;
    this.agcHoldUntil = 0;
    this.applyMixState();
    this.applyAgcStaticState();

    this.meterTimer = window.setInterval(() => this.updateGate(), 10);
  }

  private applyMixState() {
    const context = this.context;
    const gain = this.gain;
    const bypassGain = this.bypassGain;
    if (!context || !gain || !bypassGain) return;

    const useRnnoise = this.suppressionEnabled && this.rnnoiseReady;
    for (const [node, value] of [[this.rawGain, useRnnoise ? 0 : 1], [this.denoisedGain, useRnnoise ? 1 : 0]] as const) {
      node?.gain.cancelScheduledValues(context.currentTime);
      node?.gain.setTargetAtTime(value, context.currentTime, 0.008);
    }

    gain.gain.cancelScheduledValues(context.currentTime);
    bypassGain.gain.cancelScheduledValues(context.currentTime);

    if (this.enabled) {
      bypassGain.gain.setTargetAtTime(0, context.currentTime, 0.008);
      gain.gain.setTargetAtTime(this.closedGain, context.currentTime, 0.008);
    } else {
      gain.gain.setTargetAtTime(0, context.currentTime, 0.008);
      bypassGain.gain.setTargetAtTime(1, context.currentTime, 0.008);
    }
  }

  private applyAgcStaticState() {
    const context = this.context;
    const agcGain = this.agcGain;
    const compressor = this.compressor;
    const limiter = this.limiter;
    if (!context || !agcGain || !compressor || !limiter) return;

    if (this.autoGainEnabled) {
      compressor.threshold.value = -18;
      compressor.knee.value = 10;
      compressor.ratio.value = 3;
      compressor.attack.value = 0.006;
      compressor.release.value = 0.18;

      limiter.threshold.value = -2;
      limiter.knee.value = 0;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.001;
      limiter.release.value = 0.06;
    } else {
      compressor.ratio.value = 1;
      limiter.ratio.value = 1;
      this.lastAgcTargetDb = 0;
      this.agcHoldUntil = 0;
      agcGain.gain.cancelScheduledValues(context.currentTime);
      agcGain.gain.setTargetAtTime(1, context.currentTime, 0.03);
    }
  }

  private setAgcTargetDb(targetDb: number) {
    const context = this.context;
    const agcGain = this.agcGain;
    if (!context || !agcGain) return;
    const next = clamp(targetDb, this.agcMaxCutDb, this.agcMaxBoostDb);
    if (Math.abs(next - this.lastAgcTargetDb) < 0.35) return;
    const timeConstant = next > this.lastAgcTargetDb ? 0.12 : 0.035;
    this.lastAgcTargetDb = next;
    agcGain.gain.setTargetAtTime(dbToGain(next), context.currentTime, timeConstant);
  }

  private updateGate() {
    const context = this.context;
    const analyser = this.analyser;
    const gain = this.gain;
    const bypassGain = this.bypassGain;
    const samples = this.samples;
    if (!context || !analyser || !gain || !bypassGain || !samples) return;

    analyser.getFloatTimeDomainData(samples);

    let sum = 0;
    for (let i = 0; i < samples.length; i += 1) sum += samples[i] * samples[i];
    const rms = Math.sqrt(sum / samples.length);
    const db = 20 * Math.log10(Math.max(rms, 1e-7));
    const now = performance.now();

    if (now > this.openUntil && db < this.thresholdDb + 6) {
      this.noiseFloorDb = (this.noiseFloorDb * 0.97) + (db * 0.03);
    }

    const adaptiveMargin = this.rnnoiseReady && this.suppressionEnabled ? 8 : 10;
    const effectiveThreshold = Math.max(this.thresholdDb, this.noiseFloorDb + adaptiveMargin);
    const above = db >= effectiveThreshold;
    const vadFresh = this.rnnoiseReady && this.vad.isFresh(now);
    const stableSpeech = vadFresh && this.vad.isSpeechStable(now);
    const cleanSpeechAboveFloor = db >= this.noiseFloorDb + 6;

    // ShakeChat AGC is speech-aware: never chase keyboard, desk impacts or room noise.
    // Gain rises only after RNNoise VAD has declared stable speech. Between words we
    // hold the last speech gain briefly, then return smoothly to unity.
    if (this.autoGainEnabled && this.rnnoiseReady) {
      if (stableSpeech && cleanSpeechAboveFloor) {
        this.agcHoldUntil = now + this.agcSpeechHoldMs;
        this.setAgcTargetDb(this.agcTargetDb - db);
      } else if (now > this.agcHoldUntil) {
        this.setAgcTargetDb(0);
      }
    } else if (this.autoGainEnabled) {
      // No VAD = no automatic boost. This protects against amplifying non-speech
      // when the RNNoise worklet cannot be created.
      this.setAgcTargetDb(0);
    }

    if (!this.enabled) {
      gain.gain.setTargetAtTime(0, context.currentTime, 0.008);
      bypassGain.gain.setTargetAtTime(1, context.currentTime, 0.008);
      return;
    }

    bypassGain.gain.setTargetAtTime(0, context.currentTime, 0.008);

    if (this.rnnoiseReady) {
      // With AGC enabled, stable speech may open slightly below the manual dB gate.
      // The VAD requirement still rejects transient keyboard/desk impacts.
      const speechAboveGate = above || (this.autoGainEnabled && db >= effectiveThreshold - 10);
      if (stableSpeech && speechAboveGate) {
        this.openUntil = now + this.holdMs;
        gain.gain.setTargetAtTime(1, context.currentTime, 0.004);
      } else if (vadFresh && now <= this.openUntil && this.vad.shouldKeepOpen(now) && db >= effectiveThreshold - 8) {
        this.openUntil = now + this.holdMs;
      }
      this.aboveSince = 0;
    } else {
      // Only use the old level-gate fallback when RNNoise/VAD could not be created at all.
      if (above) {
        if (!this.aboveSince) this.aboveSince = now;
        if (now - this.aboveSince >= this.minimumFallbackVoiceMs) {
          this.openUntil = now + this.holdMs;
          gain.gain.setTargetAtTime(1, context.currentTime, 0.004);
        }
      } else {
        this.aboveSince = 0;
      }
    }

    const speechHoldingGate = this.rnnoiseReady
      ? (vadFresh && this.vad.shouldKeepOpen(now))
      : above;
    if (now > this.openUntil && !speechHoldingGate) {
      gain.gain.setTargetAtTime(this.closedGain, context.currentTime, 0.045);
    }
  }

  private disconnect(stopOutput: boolean) {
    if (this.meterTimer !== undefined) window.clearInterval(this.meterTimer);
    this.meterTimer = undefined;

    try { this.source?.disconnect(); } catch {}
    try { this.rnnoise?.port.postMessage('destroy'); } catch {}
    try { this.rnnoise?.disconnect(); } catch {}
    try { this.rawGain?.disconnect(); } catch {}
    try { this.denoisedGain?.disconnect(); } catch {}
    try { this.inputMix?.disconnect(); } catch {}
    try { this.analyser?.disconnect(); } catch {}
    try { this.agcGain?.disconnect(); } catch {}
    try { this.compressor?.disconnect(); } catch {}
    try { this.limiter?.disconnect(); } catch {}
    try { this.delay?.disconnect(); } catch {}
    try { this.gain?.disconnect(); } catch {}
    try { this.bypassGain?.disconnect(); } catch {}

    if (stopOutput) {
      try { this.processedTrack?.stop(); } catch {}
    }

    this.source = undefined;
    this.rnnoise = undefined;
    this.rawGain = undefined;
    this.denoisedGain = undefined;
    this.inputMix = undefined;
    this.analyser = undefined;
    this.agcGain = undefined;
    this.compressor = undefined;
    this.limiter = undefined;
    this.delay = undefined;
    this.gain = undefined;
    this.bypassGain = undefined;
    this.destination = undefined;
    this.samples = undefined;
    this.rnnoiseReady = false;
    this.lastAgcTargetDb = 0;
    this.agcHoldUntil = 0;
    this.vad.reset();
    if (stopOutput) this.processedTrack = undefined;
  }
}
