import { expect, it } from 'vitest';
import { StreamStats } from './streamStats';
const report = (values: Record<string, unknown>) => new Map([['video', { id: 'video', type: 'inbound-rtp', kind: 'video', frameWidth: 1920, frameHeight: 1080, ...values }]]) as unknown as RTCStatsReport;

it('measures real frame deltas when the browser omits framesPerSecond, including zero', () => {
  const stats = new StreamStats();
  expect(stats.sample(report({ timestamp: 1000, framesDecoded: 100, bytesReceived: 1000 }), false).fps).toBeUndefined();
  expect(stats.sample(report({ timestamp: 2000, framesDecoded: 160, bytesReceived: 251000 }), false)).toMatchObject({ fps: 60, kbps: 2000, width: 1920 });
  expect(stats.sample(report({ timestamp: 3000, framesDecoded: 160, bytesReceived: 251000 }), false).fps).toBe(0);
});

it('does not fabricate capture FPS after a counter reset or from a target setting', () => {
  const stats = new StreamStats();
  stats.sample(report({ timestamp: 1000, framesDecoded: 1000 }), false);
  expect(stats.sample(report({ timestamp: 2000, framesDecoded: 1, frameRate: 144 }), false).fps).toBeUndefined();
  expect(stats.sample(report({ timestamp: 3000, framesPerSecond: 0 }), false).fps).toBe(0);
});
