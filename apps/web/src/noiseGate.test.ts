// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AudioProcessorOptions } from 'livekit-client';
import { NoiseGateProcessor } from './noiseGate';

const worklet = vi.hoisted(() => ({ nodes: [] as any[], fail: false }));
vi.mock('@sapphi-red/web-noise-suppressor', () => ({
  loadRnnoise: vi.fn(async () => new ArrayBuffer(8)),
}));
function audioParam(value: number) {
  return { value, cancelScheduledValues: vi.fn(), setTargetAtTime: vi.fn(function (this: { value: number }, next: number) { this.value = next; }) };
}
function node() {
  return {
    connect: vi.fn(), disconnect: vi.fn(),
    gain: audioParam(1),
  };
}
function compressor() {
  return {
    connect: vi.fn(), disconnect: vi.fn(),
    threshold: audioParam(-24), knee: audioParam(30), ratio: audioParam(12), attack: audioParam(0.003), release: audioParam(0.25),
  };
}
function context(sampleRate = 48_000) {
  const source = node();
  const output = { stop: vi.fn() };
  const gains: ReturnType<typeof node>[] = [];
  const compressors: ReturnType<typeof compressor>[] = [];
  const ctx = {
    sampleRate, currentTime: 0, audioWorklet: { addModule: vi.fn(async () => {}) },
    createMediaStreamSource: vi.fn(() => source),
    createAnalyser: () => ({ ...node(), fftSize: 1024, smoothingTimeConstant: 0, getFloatTimeDomainData: (samples: Float32Array) => samples.fill(0) }),
    createDelay: () => ({ ...node(), delayTime: { value: 0 } }),
    createGain: () => { const gain = node(); gains.push(gain); return gain; },
    createDynamicsCompressor: () => { const value = compressor(); compressors.push(value); return value; },
    createMediaStreamDestination: () => ({ ...node(), stream: { getAudioTracks: () => [output] } }),
  };
  return { ctx, source, gains, compressors, output };
}
const processors: NoiseGateProcessor[] = [];
async function setup(gate: boolean, suppression: boolean, sampleRate = 48_000, autoGain = false) {
  const graph = context(sampleRate);
  const processor = new NoiseGateProcessor(gate, -48, suppression, autoGain);
  processors.push(processor);
  await processor.init({ audioContext: graph.ctx, track: {} } as unknown as AudioProcessorOptions);
  // Creation order: gate, gate bypass, input mix, raw branch, RNNoise branch, speech AGC.
  const [gateGain, bypass, mix, raw, denoised, agc] = graph.gains;
  return { ...graph, processor, gateGain, bypass, mix, raw, denoised, agc };
}
beforeEach(() => {
  vi.useFakeTimers(); worklet.nodes.length = 0; worklet.fail = false;
  vi.stubGlobal('AudioWorkletNode', class {
    connect = vi.fn();
    disconnect = vi.fn();
    port = {
      addEventListener: vi.fn(),
      start: vi.fn(),
      postMessage: vi.fn(),
    };
    constructor() {
      if (worklet.fail) throw new Error('worklet unavailable');
      worklet.nodes.push(this);
    }
  });
  vi.stubGlobal('MediaStream', class { constructor(public tracks: unknown[]) {} });
});
afterEach(async () => {
  for (const processor of processors.splice(0)) await processor.destroy();
  vi.useRealTimers(); vi.unstubAllGlobals();
});
it.each([true, false])('keeps RNNoise selected with gate enabled=%s', async gate => {
  const g = await setup(gate, true);
  expect(g.raw.gain.value).toBe(0);
  expect(g.denoised.gain.value).toBe(1);
  expect(g.bypass.gain.value).toBe(gate ? 0 : 1);
  expect(g.mix.connect).not.toHaveBeenCalledWith(g.bypass);
  expect(g.source.connect).not.toHaveBeenCalledWith(g.bypass);
  expect(worklet.nodes[0].connect).toHaveBeenCalledWith(g.denoised);
  expect(worklet.nodes[0].port.addEventListener).toHaveBeenCalledWith('message', expect.any(Function));
});
it('switches suppression and gate without replacing the published track', async () => {
  const g = await setup(true, true);
  const track = g.processor.processedTrack;
  for (const gate of [false, true]) for (const suppression of [false, true]) {
    g.processor.setSettings(gate, -48, suppression, false);
    vi.advanceTimersByTime(30);
    expect(g.raw.gain.value).toBe(suppression ? 0 : 1);
    expect(g.denoised.gain.value).toBe(suppression ? 1 : 0);
    expect(g.bypass.gain.value).toBe(gate ? 0 : 1);
    expect(g.processor.processedTrack).toBe(track);
  }
  expect(g.ctx.createMediaStreamSource).toHaveBeenCalledTimes(1);
  expect(g.output.stop).not.toHaveBeenCalled();
});
it('uses ShakeChat speech AGC compressor and limiter only when enabled', async () => {
  const g = await setup(true, true, 48_000, true);
  expect(g.compressors).toHaveLength(2);
  expect(g.compressors[0].ratio.value).toBe(3);
  expect(g.compressors[1].ratio.value).toBe(20);
  expect(g.processor.getDiagnostics().autoGainEnabled).toBe(true);
  g.processor.setSettings(true, -48, true, false);
  expect(g.compressors[0].ratio.value).toBe(1);
  expect(g.compressors[1].ratio.value).toBe(1);
  expect(g.agc.gain.value).toBe(1);
  expect(g.processor.getDiagnostics().autoGainEnabled).toBe(false);
});
it.each(['sample-rate', 'worklet-failure'])('keeps an audible bypass if RNNoise is unavailable: %s', async reason => {
  worklet.fail = reason === 'worklet-failure';
  const g = await setup(false, true, reason === 'sample-rate' ? 44_100 : 48_000);
  expect(g.raw.gain.value).toBe(1);
  expect(g.denoised.gain.value).toBe(0);
  expect(g.bypass.gain.value).toBe(1);
  await g.processor.destroy();
  expect(g.output.stop).toHaveBeenCalled();
  for (const gain of g.gains) expect(gain.disconnect).toHaveBeenCalled();
  for (const item of g.compressors) expect(item.disconnect).toHaveBeenCalled();
});
