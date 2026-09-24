// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { forceAudioTrackAgcOff, forceBrowserAgcOff } from './microphoneCapturePolicy';

it('forces browser AGC off without changing the requested AEC/NS constraints', () => {
  const result = forceBrowserAgcOff({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      sampleRate: 48_000,
    },
    video: false,
  });
  expect(result?.audio).toMatchObject({
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: false,
    sampleRate: 48_000,
  });
  expect(result?.video).toBe(false);
});

it('keeps browser AGC off when LiveKit reapplies live audio constraints', () => {
  expect(forceAudioTrackAgcOff({ echoCancellation: false, autoGainControl: true })).toEqual({
    echoCancellation: false,
    autoGainControl: false,
  });
});

it('leaves non-audio capture constraints unchanged', () => {
  const input = { video: true } satisfies MediaStreamConstraints;
  expect(forceBrowserAgcOff(input)).toBe(input);
});
