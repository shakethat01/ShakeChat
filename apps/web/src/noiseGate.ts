import { Track } from 'livekit-client';
import type { AudioProcessorOptions, TrackProcessor } from 'livekit-client';

export class NoiseGateProcessor implements TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> {
  readonly name = 'shakechat-noise-gate';
  processedTrack?: MediaStreamTrack;

  private context?: AudioContext;
  private source?: MediaStreamAudioSourceNode;
  private analyser?: AnalyserNode;
  private delay?: DelayNode;
  private gain?: GainNode;
  private destination?: MediaStreamAudioDestinationNode;
  private meterTimer?: number;
  private samples?: Float32Array<ArrayBuffer>;
  private enabled = true;
  private thresholdDb = -48;
  private openUntil = 0;
  private aboveSince = 0;
  private noiseFloorDb = -70;

  private readonly lookAheadSeconds = 0.05;
  private readonly minimumVoiceMs = 32;
  private readonly holdMs = 220;
  private readonly closedGain = 0.001;

  constructor(enabled = true, thresholdDb = -48) {
    this.setSettings(enabled, thresholdDb);
  }

  setSettings(enabled: boolean, thresholdDb: number) {
    this.enabled = enabled;
    this.thresholdDb = Math.max(-70, Math.min(-25, thresholdDb));
    this.aboveSince = 0;
    const gain = this.gain;
    const context = this.context;
    if (!gain || !context) return;
    gain.gain.cancelScheduledValues(context.currentTime);
    gain.gain.setTargetAtTime(enabled ? this.closedGain : 1, context.currentTime, 0.01);
  }

  async init(options: AudioProcessorOptions) {
    this.build(options);
  }

  async restart(options: AudioProcessorOptions) {
    this.disconnect(false);
    this.build(options);
  }

  async destroy() {
    this.disconnect(true);
  }

  private build(options: AudioProcessorOptions) {
    this.context = options.audioContext;
    const context = options.audioContext;
    const source = context.createMediaStreamSource(new MediaStream([options.track]));
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.12;

    // A short look-ahead lets the detector reject keyboard clicks before the
    // delayed audio reaches the gate, while still opening in time for speech.
    const delay = context.createDelay(0.1);
    delay.delayTime.value = this.lookAheadSeconds;

    const gain = context.createGain();
    gain.gain.value = this.enabled ? this.closedGain : 1;
    const destination = context.createMediaStreamDestination();

    source.connect(analyser);
    source.connect(delay);
    delay.connect(gain);
    gain.connect(destination);

    this.source = source;
    this.analyser = analyser;
    this.delay = delay;
    this.gain = gain;
    this.destination = destination;
    this.processedTrack = destination.stream.getAudioTracks()[0];
    this.samples = new Float32Array(analyser.fftSize);
    this.openUntil = 0;
    this.aboveSince = 0;
    this.noiseFloorDb = -70;

    this.meterTimer = window.setInterval(() => this.updateGate(), 10);
  }

  private updateGate() {
    const context = this.context;
    const analyser = this.analyser;
    const gain = this.gain;
    const samples = this.samples;
    if (!context || !analyser || !gain || !samples) return;

    if (!this.enabled) {
      gain.gain.setTargetAtTime(1, context.currentTime, 0.01);
      return;
    }

    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (let i = 0; i < samples.length; i += 1) sum += samples[i] * samples[i];
    const rms = Math.sqrt(sum / samples.length);
    const db = 20 * Math.log10(Math.max(rms, 1e-7));
    const now = performance.now();

    // Learn the idle room/noise floor only while the gate is closed. This keeps
    // the detector from opening just because AGC lifts a quiet room a little.
    if (now > this.openUntil && db < this.thresholdDb + 6) {
      this.noiseFloorDb = (this.noiseFloorDb * 0.97) + (db * 0.03);
    }

    const effectiveThreshold = Math.max(this.thresholdDb, this.noiseFloorDb + 10);
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
      gain.gain.setTargetAtTime(this.closedGain, context.currentTime, 0.12);
    }
  }

  private disconnect(stopOutput: boolean) {
    if (this.meterTimer !== undefined) window.clearInterval(this.meterTimer);
    this.meterTimer = undefined;
    try { this.source?.disconnect(); } catch {}
    try { this.analyser?.disconnect(); } catch {}
    try { this.delay?.disconnect(); } catch {}
    try { this.gain?.disconnect(); } catch {}
    if (stopOutput) {
      try { this.processedTrack?.stop(); } catch {}
    }
    this.source = undefined;
    this.analyser = undefined;
    this.delay = undefined;
    this.gain = undefined;
    this.destination = undefined;
    this.samples = undefined;
    if (stopOutput) this.processedTrack = undefined;
  }
}
