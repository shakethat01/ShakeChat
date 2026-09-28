import { Track } from 'livekit-client';
import type { RemoteAudioTrack, RemoteTrackPublication } from 'livekit-client';

export type PlaybackSource = 'microphone' | 'screen';
type Entry = { track: RemoteAudioTrack; element: HTMLMediaElement; identity: string; source: PlaybackSource };
type VolumeFor = (identity: string, source: PlaybackSource) => number;

/** One playback element per publication. Keep both the LiveKit gain and the
 * actual media element in sync. Tauri/WebView playback can bypass one of these
 * paths depending on how the remote audio track is rendered, so applying only
 * track.setVolume() is not sufficient for reliable per-user mute/volume. */
export class RemoteAudioPlayback {
  private entries = new Map<string, Entry>();

  private applyVolume(entry: Entry, volumeFor: VolumeFor) {
    const volume = Math.max(0, Math.min(1, volumeFor(entry.identity, entry.source)));
    entry.track.setVolume(volume);
    entry.element.volume = volume;
    entry.element.muted = volume <= 0;
  }

  attach(track: RemoteAudioTrack, publication: RemoteTrackPublication, identity: string, volumeFor: VolumeFor) {
    const key = publication.trackSid;
    const previous = this.entries.get(key);
    if (previous?.track === track) {
      this.applyVolume(previous, volumeFor);
      return;
    }
    if (previous) this.remove(previous.track);
    const source: PlaybackSource = publication.source === Track.Source.ScreenShareAudio ? 'screen' : 'microphone';
    const element = track.attach();
    element.autoplay = true;
    element.style.display = 'none';
    const entry: Entry = { track, element, identity, source };
    this.entries.set(key, entry);
    this.applyVolume(entry, volumeFor);
    document.body.appendChild(element);
  }

  update(volumeFor: VolumeFor) {
    for (const entry of this.entries.values()) this.applyVolume(entry, volumeFor);
  }

  remove(track: RemoteAudioTrack) {
    for (const [key, entry] of this.entries) {
      if (entry.track !== track) continue;
      track.detach(entry.element);
      entry.element.pause();
      entry.element.srcObject = null;
      entry.element.remove();
      this.entries.delete(key);
    }
  }

  clear() {
    for (const entry of [...this.entries.values()]) this.remove(entry.track);
  }
}
