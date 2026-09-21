import { Track } from 'livekit-client';
import type { AudioProcessorOptions, TrackProcessor } from 'livekit-client';

export class NoiseGateProcessor implements TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> {
  readonly name = 'shakechat-noise-gate';
  processedTrack?: MediaStreamTrack;

  private context?: AudioContext;
  private source?: MediaStreamAudioSourceNode;
  private analyser?: AnalyserNode;
  private gain?: GainNode;
  private destination?: MediaStreamAudioDestinationNode;
  private meterTimer?: number;
  private samples?: Float32Array<ArrayBuffer>;
  private enabled = true;
  private thresholdDb = -48;
  private openUntil = 0;

  constructor(enabled = true, thresholdDb = -48) {
    this.setSettings(enabled, thresholdDb);
  }

  setSettings(enabled: boolean, thresholdDb: number) {
    this.enabled = enabled;
    this.thresholdDb = Math.max(-70, Math.min(-25, thresholdDb));
    const gain = this.gain;
    const context = this.context;
    if (!gain || !context) return;
    gain.gain.cancelScheduledValues(context.currentTime);
    if (!enabled) gain.gain.setTargetAtTime(1, context.currentTime, 0.01);
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
    analyser.smoothingTimeConstant = 0.18;
    const gain = context.createGain();
    gain.gain.value = this.enabled ? 0.03 : 1;
    const destination = context.createMediaStreamDestination();

    source.connect(analyser);
    source.connect(gain);
    gain.connect(destination);

    this.source = source;
    this.analyser = analyser;
    this.gain = gain;
    this.destination = destination;
    this.processedTrack = destination.stream.getAudioTracks()[0];
    this.samples = new Float32Array(analyser.fftSize);
    this.openUntil = 0;

    this.meterTimer = window.setInterval(() => this.updateGate(), 20);
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

    if (db >= this.thresholdDb) {
      this.openUntil = now + 180;
      gain.gain.setTargetAtTime(1, context.currentTime, 0.008);
      return;
    }

    if (now > this.openUntil) {
      gain.gain.setTargetAtTime(0.025, context.currentTime, 0.18);
    }
  }

  private disconnect(stopOutput: boolean) {
    if (this.meterTimer !== undefined) window.clearInterval(this.meterTimer);
    this.meterTimer = undefined;
    try { this.source?.disconnect(); } catch {}
    try { this.analyser?.disconnect(); } catch {}
    try { this.gain?.disconnect(); } catch {}
    if (stopOutput) {
      try { this.processedTrack?.stop(); } catch {}
    }
    this.source = undefined;
    this.analyser = undefined;
    this.gain = undefined;
    this.destination = undefined;
    this.samples = undefined;
    if (stopOutput) this.processedTrack = undefined;
  }
}
