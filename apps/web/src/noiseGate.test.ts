// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AudioProcessorOptions } from 'livekit-client';
import { NoiseGateProcessor } from './noiseGate';

const worklet = vi.hoisted(() => ({ nodes: [] as any[], fail: false }));
vi.mock('@sapphi-red/web-noise-suppressor', () => ({
  loadRnnoise: vi.fn(async () => new ArrayBuffer(8)),
  RnnoiseWorkletNode: class {
    connect = vi.fn(); disconnect = vi.fn(); destroy = vi.fn();
    constructor() { if (worklet.fail) throw new Error('worklet unavailable'); worklet.nodes.push(this); }
  },
}));
function node() {
  return {
    connect: vi.fn(), disconnect: vi.fn(),
    gain: { value: 1, cancelScheduledValues: vi.fn(), setTargetAtTime: vi.fn(function (this: { value: number }, value: number) { this.value = value; }) },
  };
}
function context(sampleRate = 48_000) {
  const source = node();
  const output = { stop: vi.fn() };
  const gains: ReturnType<typeof node>[] = [];
  const ctx = {
    sampleRate, currentTime: 0, audioWorklet: { addModule: vi.fn(async () => {}) },
    createMediaStreamSource: vi.fn(() => source),
    createAnalyser: () => ({ ...node(), fftSize: 1024, smoothingTimeConstant: 0, getFloatTimeDomainData: (samples: Float32Array) => samples.fill(0) }),
    createDelay: () => ({ ...node(), delayTime: { value: 0 } }),
    createGain: () => { const gain = node(); gains.push(gain); return gain; },
    createMediaStreamDestination: () => ({ ...node(), stream: { getAudioTracks: () => [output] } }),
  };
  return { ctx, source, gains, output };
}
const processors: NoiseGateProcessor[] = [];
async function setup(gate: boolean, suppression: boolean, sampleRate = 48_000) {
  const graph = context(sampleRate);
  const processor = new NoiseGateProcessor(gate, -48, suppression);
  processors.push(processor);
  await processor.init({ audioContext: graph.ctx, track: {} } as unknown as AudioProcessorOptions);
  // Creation order: gate, gate bypass, input mix, raw branch, RNNoise branch.
  const [gateGain, bypass, mix, raw, denoised] = graph.gains;
  return { ...graph, processor, gateGain, bypass, mix, raw, denoised };
}
beforeEach(() => {
  vi.useFakeTimers(); worklet.nodes.length = 0; worklet.fail = false;
  vi.stubGlobal('AudioWorkletNode', class {});
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
  expect(g.mix.connect).toHaveBeenCalledWith(g.bypass);
  expect(g.source.connect).not.toHaveBeenCalledWith(g.bypass);
  expect(worklet.nodes[0].connect).toHaveBeenCalledWith(g.denoised);
});
it('switches all four settings combinations without replacing the published track', async () => {
  const g = await setup(true, true);
  const track = g.processor.processedTrack;
  for (const gate of [false, true]) for (const suppression of [false, true]) {
    g.processor.setSettings(gate, -48, suppression);
    vi.advanceTimersByTime(30);
    expect(g.raw.gain.value).toBe(suppression ? 0 : 1);
    expect(g.denoised.gain.value).toBe(suppression ? 1 : 0);
    expect(g.bypass.gain.value).toBe(gate ? 0 : 1);
    expect(g.processor.processedTrack).toBe(track);
  }
  expect(g.ctx.createMediaStreamSource).toHaveBeenCalledTimes(1);
  expect(g.output.stop).not.toHaveBeenCalled();
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
});
