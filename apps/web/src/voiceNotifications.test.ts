import { expect, it } from 'vitest';
import { createVoiceSoundGate } from './voiceNotifications';

it('does not let a join sound swallow a stream-start sound', () => {
  const gate = createVoiceSoundGate(180);
  expect(gate('join', 1000)).toBe(true);
  expect(gate('stream-start', 1000)).toBe(true);
});

it('still suppresses duplicate copies of the same notification event', () => {
  const gate = createVoiceSoundGate(180);
  expect(gate('stream-start', 1000)).toBe(true);
  expect(gate('stream-start', 1100)).toBe(false);
  expect(gate('stream-start', 1181)).toBe(true);
});
