import { Track } from 'livekit-client';
import type { AudioProcessorOptions, TrackProcessor } from 'livekit-client';
import { loadRnnoise, RnnoiseWorkletNode } from '@sapphi-red/web-noise-suppressor';
import rnnoiseWorkletPath from '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url';
import rnnoiseWasmPath from '@sapphi-red/web-noise-suppressor/rnnoise.wasm?url';
import rnnoiseWasmSimdPath from '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url';

let rnnoiseBinaryPromise: Promise<ArrayBuffer> | undefined;
const rnnoiseReadyContexts = new WeakSet<AudioContext>();

async function prepareRnnoise(context: AudioContext) {
  if (!rnnoiseBinaryPromise) {
    rnnoiseBinaryPromise = loadRnnoise({
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

  return rnnoiseBinaryPromise;
}

export class NoiseGateProcessor implements TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> {
  readonly name = 'shakechat-rnnoise-gate';
  processedTrack?: MediaStreamTrack;

  private context?: AudioContext;
  private source?: MediaStreamAudioSourceNode;
  private rnnoise?: RnnoiseWorkletNode;
  private analyser?: AnalyserNode;
  private delay?: DelayNode;
  private gain?: GainNode;
  private bypassGain?: GainNode;
  private destination?: MediaStreamAudioDestinationNode;
  private meterTimer?: number;
  private samples?: Float32Array<ArrayBuffer>;
  private enabled = true;
  private thresholdDb = -48;
  private openUntil = 0;
  private aboveSince = 0;
  private noiseFloorDb = -70;
  private rnnoiseReady = false;

  private readonly lookAheadSeconds = 0.045;
  private readonly minimumVoiceMs = 28;
  private readonly holdMs = 220;
  private readonly closedGain = 0.001;

  constructor(enabled = true, thresholdDb = -48) {
    this.setSettings(enabled, thresholdDb);
  }

  setSettings(enabled: boolean, thresholdDb: number) {
    this.enabled = enabled;
    this.thresholdDb = Math.max(-70, Math.min(-25, thresholdDb));
    this.aboveSince = 0;
    this.applyMixState();
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

    const delay = context.createDelay(0.1);
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

    let processedInput: AudioNode = source;
    this.rnnoiseReady = false;

    if (context.sampleRate === 48_000 && typeof AudioWorkletNode !== 'undefined') {
      try {
        const wasmBinary = await prepareRnnoise(context);
        const rnnoise = new RnnoiseWorkletNode(context, {
          wasmBinary,
          maxChannels: 2,
        });
        source.connect(rnnoise);
        this.rnnoise = rnnoise;
        processedInput = rnnoise;
        this.rnnoiseReady = true;
        console.info('[voice] RNNoise suppression ready', { sampleRate: context.sampleRate, maxChannels: 2 });
      } catch (error) {
        console.warn('[voice] RNNoise unavailable, falling back to smart gate only', error);
      }
    } else {
      console.warn('[voice] RNNoise skipped because a 48 kHz AudioWorklet context is unavailable', {
        sampleRate: context.sampleRate,
        audioWorklet: typeof AudioWorkletNode !== 'undefined',
      });
    }

    processedInput.connect(analyser);
    processedInput.connect(delay);
    delay.connect(gain);
    gain.connect(destination);

    // Keep a clean bypass path so disabling the advanced filter restores the
    // original microphone track instead of merely opening the gate.
    source.connect(bypassGain);
    bypassGain.connect(destination);

    this.processedTrack = destination.stream.getAudioTracks()[0];
    this.samples = new Float32Array(new ArrayBuffer(analyser.fftSize * Float32Array.BYTES_PER_ELEMENT));
    this.openUntil = 0;
    this.aboveSince = 0;
    this.noiseFloorDb = -70;
    this.applyMixState();

    this.meterTimer = window.setInterval(() => this.updateGate(), 10);
  }

  private applyMixState() {
    const context = this.context;
    const gain = this.gain;
    const bypassGain = this.bypassGain;
    if (!context || !gain || !bypassGain) return;

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

  private updateGate() {
    const context = this.context;
    const analyser = this.analyser;
    const gain = this.gain;
    const bypassGain = this.bypassGain;
    const samples = this.samples;
    if (!context || !analyser || !gain || !bypassGain || !samples) return;

    if (!this.enabled) {
      gain.gain.setTargetAtTime(0, context.currentTime, 0.008);
      bypassGain.gain.setTargetAtTime(1, context.currentTime, 0.008);
      return;
    }

    bypassGain.gain.setTargetAtTime(0, context.currentTime, 0.008);
    analyser.getFloatTimeDomainData(samples);

    let sum = 0;
    for (let i = 0; i < samples.length; i += 1) sum += samples[i] * samples[i];
    const rms = Math.sqrt(sum / samples.length);
    const db = 20 * Math.log10(Math.max(rms, 1e-7));
    const now = performance.now();

    // The detector now sees RNNoise output rather than the raw microphone.
    // That makes sharp keyboard transients much less likely to open the gate.
    if (now > this.openUntil && db < this.thresholdDb + 6) {
      this.noiseFloorDb = (this.noiseFloorDb * 0.97) + (db * 0.03);
    }

    const adaptiveMargin = this.rnnoiseReady ? 8 : 10;
    const effectiveThreshold = Math.max(this.thresholdDb, this.noiseFloorDb + adaptiveMargin);
    const above = db >= effectiveThreshold;

    if (above) {
      if (!this.aboveSince) this.aboveSince = now;
      if (now - this.aboveSince >= this.minimumVoiceMs) {
        this.openUntil = now + this.holdMs;
        gain.gain.setTargetAtTime(1, context.currentTime, 0.004);
      }
    } else {
      this.aboveSince = 0;
    }

    if (now > this.openUntil && !above) {
      gain.gain.setTargetAtTime(this.closedGain, context.currentTime, 0.11);
    }
  }

  private disconnect(stopOutput: boolean) {
    if (this.meterTimer !== undefined) window.clearInterval(this.meterTimer);
    this.meterTimer = undefined;

    try { this.source?.disconnect(); } catch {}
    try { this.rnnoise?.destroy(); } catch {}
    try { this.rnnoise?.disconnect(); } catch {}
    try { this.analyser?.disconnect(); } catch {}
    try { this.delay?.disconnect(); } catch {}
    try { this.gain?.disconnect(); } catch {}
    try { this.bypassGain?.disconnect(); } catch {}

    if (stopOutput) {
      try { this.processedTrack?.stop(); } catch {}
    }

    this.source = undefined;
    this.rnnoise = undefined;
    this.analyser = undefined;
    this.delay = undefined;
    this.gain = undefined;
    this.bypassGain = undefined;
    this.destination = undefined;
    this.samples = undefined;
    this.rnnoiseReady = false;
    if (stopOutput) this.processedTrack = undefined;
  }
}
