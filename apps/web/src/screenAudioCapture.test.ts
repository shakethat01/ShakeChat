import { describe, expect, it } from 'vitest';
import { withSystemAudioOptions } from './screenAudioCapture';

describe('screen audio capture options', () => {
  it('requests full system audio when screen share audio is enabled', () => {
    const options = withSystemAudioOptions({ video: true, audio: true }, { restrictOwnAudio: true });
    expect(options).toMatchObject({
      video: true,
      systemAudio: 'include',
      windowAudio: 'system',
      surfaceSwitching: 'include',
      monitorTypeSurfaces: 'include',
      audio: {
        suppressLocalAudioPlayback: false,
        restrictOwnAudio: true,
      },
    });
  });

  it('does not force audio when a caller disables it', () => {
    expect(withSystemAudioOptions({ video: true, audio: false }, { restrictOwnAudio: true }))
      .toEqual({ video: true, audio: false });
  });
});
