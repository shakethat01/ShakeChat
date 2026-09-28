import { Track } from 'livekit-client';
import type { LocalAudioTrack, LocalVideoTrack, Room } from 'livekit-client';
import { screenCaptureFor, type ScreenQuality } from './preferences';

export type ScreenSettings = { height: number; fps: number };
export const SCREEN_HEIGHTS = [480, 720, 1080, 1440] as const;
export const SCREEN_FRAME_RATES = [15, 30, 60, 120, 144] as const;

export function settingsForPreset(quality: ScreenQuality): ScreenSettings {
  const resolution = screenCaptureFor(quality);
  return { height: resolution.height, fps: resolution.frameRate };
}

export function screenOptions(settings: ScreenSettings) {
  if (!(SCREEN_HEIGHTS as readonly number[]).includes(settings.height) || !(SCREEN_FRAME_RATES as readonly number[]).includes(settings.fps)) {
    throw new Error('Desteklenmeyen yayın kalitesi.');
  }
  const width = ({ 480: 854, 720: 1280, 1080: 1920, 1440: 2560 } as Record<number, number>)[settings.height];
  const baseBitrate = ({ 480: 1_500_000, 720: 3_500_000, 1080: 6_000_000, 1440: 10_000_000 } as Record<number, number>)[settings.height];
  const maxBitrate = Math.round(baseBitrate * Math.max(0.5, Math.min(1.6, settings.fps / 60)));
  return {
    resolution: { width, height: settings.height, frameRate: settings.fps },
    constraints: {
      width: { ideal: width, max: width }, height: { ideal: settings.height, max: settings.height },
      frameRate: { ideal: settings.fps, max: settings.fps },
    } satisfies MediaTrackConstraints,
    publish: { simulcast: false, screenShareEncoding: { maxBitrate, maxFramerate: settings.fps, priority: 'high' as const }, degradationPreference: 'maintain-framerate' as const },
  };
}

/** Keep the published track/SID and receiver subscription while changing capture and encoding. */
export async function applyScreenSettings(track: LocalVideoTrack, settings: ScreenSettings) {
  const options = screenOptions(settings);
  const media = track.mediaStreamTrack;
  const previous = media.getConstraints();
  const previousHint = media.contentHint;
  const sender = track.sender;
  if (!sender) throw new Error('Yayın bağlantısı henüz hazır değil.');
  const before = sender.getParameters();
  try {
    await media.applyConstraints(options.constraints);
    const parameters = sender.getParameters();
    if (!parameters.encodings?.length) throw new Error('Yayın kodlayıcısı henüz hazır değil.');
    parameters.encodings = parameters.encodings.map(encoding => ({ ...encoding, maxBitrate: options.publish.screenShareEncoding.maxBitrate, maxFramerate: settings.fps, scaleResolutionDownBy: 1 }));
    parameters.degradationPreference = 'maintain-framerate';
    await sender.setParameters(parameters);
    media.contentHint = settings.fps >= 60 ? 'motion' : 'detail';
    // LiveKit reuses these options when replacing the source or recovering the sender.
    track.publishOptions = { ...track.publishOptions, ...options.publish };
  } catch (error) {
    await media.applyConstraints(previous).catch(() => undefined);
    const rollback = sender.getParameters();
    rollback.encodings = before.encodings;
    rollback.degradationPreference = before.degradationPreference;
    await sender.setParameters(rollback).catch(() => undefined);
    media.contentHint = previousHint;
    throw error;
  }
}

/** Acquire first. Cancelling the picker leaves the existing stream untouched. */
export async function replaceScreenSource(room: Room, settings: ScreenSettings, stillCurrent: () => boolean) {
  const video = room.localParticipant.getTrackPublication(Track.Source.ScreenShare)?.videoTrack;
  if (!video) throw new Error('Önce bir yayın başlat.');
  const options = screenOptions(settings);
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: options.constraints, audio: true });
  const nextVideo = stream.getVideoTracks()[0];
  const nextAudio = stream.getAudioTracks()[0];
  const oldVideo = video.mediaStreamTrack;
  const audio = room.localParticipant.getTrackPublication(Track.Source.ScreenShareAudio)?.audioTrack as LocalAudioTrack | undefined;
  const oldAudio = audio?.mediaStreamTrack;
  let addedAudio: LocalAudioTrack | undefined;
  let committed = false;
  try {
    if (!nextVideo || !stillCurrent() || room.localParticipant.getTrackPublication(Track.Source.ScreenShare)?.videoTrack !== video) return;
    nextVideo.contentHint = settings.fps >= 60 ? 'motion' : 'detail';
    await video.replaceTrack(nextVideo, { userProvidedTrack: true });
    if (!stillCurrent()) throw new Error('Yayın bağlantısı değişti.');
    await applyScreenSettings(video, settings);
    if (nextAudio && audio) await audio.replaceTrack(nextAudio, { userProvidedTrack: true });
    else if (nextAudio) {
      const publication = await room.localParticipant.publishTrack(nextAudio, { source: Track.Source.ScreenShareAudio });
      addedAudio = publication.audioTrack;
    } else if (audio) {
      await room.localParticipant.unpublishTrack(audio, false);
    }
    if (!stillCurrent()) throw new Error('Yayın bağlantısı değişti.');
    committed = true;
    oldVideo.stop();
    oldAudio?.stop();
  } catch (error) {
    if (stillCurrent()) {
      // replaceTrack(userProvidedTrack:true) retains the old source for rollback.
      await video.replaceTrack(oldVideo, { userProvidedTrack: true }).catch(() => undefined);
      if (audio && oldAudio && room.localParticipant.getTrackPublication(Track.Source.ScreenShareAudio)?.audioTrack === audio) {
        await audio.replaceTrack(oldAudio, { userProvidedTrack: true }).catch(() => undefined);
      }
      if (addedAudio) await room.localParticipant.unpublishTrack(addedAudio).catch(() => undefined);
    }
    throw error;
  } finally {
    if (!committed) stream.getTracks().forEach(track => track.stop());
    if (!stillCurrent()) { oldVideo.stop(); oldAudio?.stop(); }
  }
}
