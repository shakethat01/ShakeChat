import { describe, expect, it } from 'vitest';
import {
  RNNOISE_VAD_FRESH_MS,
  RNNOISE_VAD_MIN_SPEECH_MS,
  RnnoiseVadState,
} from './rnnoiseVadState';

describe('RnnoiseVadState', () => {
  it('rejects a single short high-probability transient', () => {
    const state = new RnnoiseVadState();
    state.push(0.95, 1000);
    expect(state.isSpeechStable(1000 + RNNOISE_VAD_MIN_SPEECH_MS - 1)).toBe(false);
    state.push(0.05, 1010);
    expect(state.isSpeechStable(1100)).toBe(false);
  });

  it('rejects a loud multi-frame impact that decays below the attack floor', () => {
    const state = new RnnoiseVadState();
    state.push(0.98, 1000);
    state.push(0.91, 1010);
    state.push(0.72, 1020);
    state.push(0.42, 1030);
    state.push(0.18, 1040);
    expect(state.isSpeechStable(1080)).toBe(false);
  });

  it('opens after sustained speech probability', () => {
    const state = new RnnoiseVadState();
    state.push(0.82, 1000);
    state.push(0.8, 1010);
    state.push(0.76, 1020);
    state.push(0.72, 1030);
    state.push(0.69, 1040);
    state.push(0.66, 1050);
    state.push(0.63, 1060);
    expect(state.isSpeechStable(1060)).toBe(true);
  });

  it('resets speech attack after a gap below the attack floor', () => {
    const state = new RnnoiseVadState();
    state.push(0.9, 1000);
    state.push(0.9, 1010);
    state.push(0.4, 1020);
    state.push(0.9, 1030);
    expect(state.isSpeechStable(1030 + RNNOISE_VAD_MIN_SPEECH_MS - 1)).toBe(false);
  });

  it('keeps an already open gate through softer speech', () => {
    const state = new RnnoiseVadState();
    state.push(0.82, 1000);
    state.push(0.8, 1020);
    state.push(0.76, 1040);
    state.push(0.7, 1060);
    state.push(0.35, 1070);
    expect(state.shouldKeepOpen(1070)).toBe(true);
  });

  it('treats stale VAD data as unavailable', () => {
    const state = new RnnoiseVadState();
    state.push(0.9, 1000);
    expect(state.isFresh(1000 + RNNOISE_VAD_FRESH_MS + 1)).toBe(false);
    expect(state.shouldKeepOpen(1000 + RNNOISE_VAD_FRESH_MS + 1)).toBe(false);
  });
});
