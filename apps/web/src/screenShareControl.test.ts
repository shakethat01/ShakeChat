// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { applyScreenSettings, replaceScreenSource } from './screenShareControl';

function media(id: string) {
  return { id, contentHint: '', stop: vi.fn(), getConstraints: () => ({ width: { max: 1280 } }), applyConstraints: vi.fn(async () => {}) };
}
function fixture() {
  const oldVideo = media('old-video'), oldAudio = media('old-audio');
  const video = { mediaStreamTrack: oldVideo, sender: { getParameters: () => ({ encodings: [{ maxBitrate: 3_500_000 }] }), setParameters: vi.fn(async () => {}) }, replaceTrack: vi.fn(async (track: any) => { video.mediaStreamTrack = track; }) };
  const audio = { mediaStreamTrack: oldAudio, replaceTrack: vi.fn(async (track: any) => { audio.mediaStreamTrack = track; }) };
  const room = { localParticipant: { getTrackPublication: (source: string) => source === 'screen_share' ? { videoTrack: video } : source === 'screen_share_audio' ? { audioTrack: audio } : undefined, unpublishTrack: vi.fn(async () => {}), publishTrack: vi.fn() } };
  return { room, video, audio, oldVideo, oldAudio };
}
afterEach(() => vi.unstubAllGlobals());

it('changes capture and sender settings without unpublishing, and rolls capture back on encoder failure', async () => {
  const { video } = fixture();
  await applyScreenSettings(video as any, { height: 1080, fps: 60 });
  expect(video.sender.setParameters).toHaveBeenLastCalledWith(expect.objectContaining({ encodings: [expect.objectContaining({ maxFramerate: 60, maxBitrate: 6_000_000 })] }));
  video.sender.setParameters.mockRejectedValueOnce(new Error('encoder busy'));
  await expect(applyScreenSettings(video as any, { height: 1440, fps: 120 })).rejects.toThrow('encoder busy');
  expect(video.mediaStreamTrack.applyConstraints).toHaveBeenLastCalledWith({ width: { max: 1280 } });
  expect(video.mediaStreamTrack.stop).not.toHaveBeenCalled();
});

it('keeps the current source alive when source selection is cancelled', async () => {
  const { room, video, oldVideo, oldAudio } = fixture();
  vi.stubGlobal('navigator', { mediaDevices: { getDisplayMedia: vi.fn().mockRejectedValue(new DOMException('cancelled', 'NotAllowedError')) } });
  await expect(replaceScreenSource(room as any, { height: 1080, fps: 60 }, () => true)).rejects.toThrow('cancelled');
  expect(video.replaceTrack).not.toHaveBeenCalled(); expect(oldVideo.stop).not.toHaveBeenCalled(); expect(oldAudio.stop).not.toHaveBeenCalled();
});

it('replaces video and audio in the existing publications before stopping old sources', async () => {
  const { room, video, audio, oldVideo, oldAudio } = fixture();
  const nextVideo = media('new-video'), nextAudio = media('new-audio');
  vi.stubGlobal('navigator', { mediaDevices: { getDisplayMedia: vi.fn(async () => ({ getVideoTracks: () => [nextVideo], getAudioTracks: () => [nextAudio], getTracks: () => [nextVideo, nextAudio] })) } });
  await replaceScreenSource(room as any, { height: 1080, fps: 60 }, () => true);
  expect(video.mediaStreamTrack).toBe(nextVideo); expect(audio.mediaStreamTrack).toBe(nextAudio);
  expect(oldVideo.stop).toHaveBeenCalledOnce(); expect(oldAudio.stop).toHaveBeenCalledOnce();
  expect(nextVideo.stop).not.toHaveBeenCalled(); expect(room.localParticipant.unpublishTrack).not.toHaveBeenCalled();
});

it('stops a late capture after leaving without touching the old publication', async () => {
  const { room, video } = fixture(); const nextVideo = media('late');
  vi.stubGlobal('navigator', { mediaDevices: { getDisplayMedia: vi.fn(async () => ({ getVideoTracks: () => [nextVideo], getAudioTracks: () => [], getTracks: () => [nextVideo] })) } });
  await replaceScreenSource(room as any, { height: 720, fps: 30 }, () => false);
  expect(nextVideo.stop).toHaveBeenCalledOnce(); expect(video.replaceTrack).not.toHaveBeenCalled();
});
