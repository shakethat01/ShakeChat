import { describe, expect, it } from 'vitest';
import {
  RNNOISE_VAD_FRESH_MS,
  RNNOISE_VAD_MIN_SPEECH_MS,
  RnnoiseVadState,
} from './rnnoiseVadState';

describe('RnnoiseVadState', () => {
  it('rejects a single short high-probability transient', () => {
    const state = new RnnoiseVadState();
    state.push(0.9, 1000);
    expect(state.isSpeechStable(1000 + RNNOISE_VAD_MIN_SPEECH_MS - 1)).toBe(false);
    state.push(0.05, 1010);
    expect(state.isSpeechStable(1030)).toBe(false);
  });

  it('opens after sustained speech probability', () => {
    const state = new RnnoiseVadState();
    state.push(0.8, 1000);
    state.push(0.82, 1010);
    state.push(0.84, 1020);
    expect(state.isSpeechStable(1020)).toBe(true);
  });

  it('keeps an already open gate through softer speech', () => {
    const state = new RnnoiseVadState();
    state.push(0.8, 1000);
    state.push(0.8, 1010);
    state.push(0.8, 1020);
    state.push(0.35, 1030);
    expect(state.shouldKeepOpen(1030)).toBe(true);
  });

  it('treats stale VAD data as unavailable', () => {
    const state = new RnnoiseVadState();
    state.push(0.9, 1000);
    expect(state.isFresh(1000 + RNNOISE_VAD_FRESH_MS + 1)).toBe(false);
    expect(state.shouldKeepOpen(1000 + RNNOISE_VAD_FRESH_MS + 1)).toBe(false);
  });
});
