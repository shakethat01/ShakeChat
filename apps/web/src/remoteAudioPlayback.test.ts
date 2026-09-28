// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { Track } from 'livekit-client';
import { RemoteAudioPlayback } from './remoteAudioPlayback';

function makeTrack() {
  const element = document.createElement('audio');
  const track = {
    attach: vi.fn(() => element),
    detach: vi.fn(() => [element]),
    setVolume: vi.fn(),
  };
  return { track, element };
}

describe('RemoteAudioPlayback', () => {
  it('applies participant microphone volume and mute to both LiveKit and the media element', () => {
    const playback = new RemoteAudioPlayback();
    const { track, element } = makeTrack();
    const publication = { trackSid: 'mic-1', source: Track.Source.Microphone };
    let volume = 1;

    playback.attach(track as any, publication as any, 'user-1', () => volume);
    expect(track.setVolume).toHaveBeenLastCalledWith(1);
    expect(element.volume).toBe(1);
    expect(element.muted).toBe(false);

    volume = 0;
    playback.update(() => volume);
    expect(track.setVolume).toHaveBeenLastCalledWith(0);
    expect(element.volume).toBe(0);
    expect(element.muted).toBe(true);

    volume = 0.35;
    playback.update(() => volume);
    expect(track.setVolume).toHaveBeenLastCalledWith(0.35);
    expect(element.volume).toBeCloseTo(0.35);
    expect(element.muted).toBe(false);
  });

  it('keeps screen audio on its independent source path', () => {
    const playback = new RemoteAudioPlayback();
    const { track, element } = makeTrack();
    const publication = { trackSid: 'screen-1', source: Track.Source.ScreenShareAudio };

    playback.attach(track as any, publication as any, 'user-1', (_identity, source) => source === 'screen' ? 0.2 : 1);
    expect(track.setVolume).toHaveBeenLastCalledWith(0.2);
    expect(element.volume).toBeCloseTo(0.2);
    expect(element.muted).toBe(false);
  });
});
