import { Track } from 'livekit-client';
import type { RemoteAudioTrack, RemoteTrackPublication } from 'livekit-client';

export type PlaybackSource = 'microphone' | 'screen';
type Entry = { track: RemoteAudioTrack; element: HTMLMediaElement; identity: string; source: PlaybackSource };
type VolumeFor = (identity: string, source: PlaybackSource) => number;

/** One playback element per publication. Use the SDK volume API so the same
 * controls also work if LiveKit switches to a Web Audio output graph. */
export class RemoteAudioPlayback {
  private entries = new Map<string, Entry>();

  attach(track: RemoteAudioTrack, publication: RemoteTrackPublication, identity: string, volumeFor: VolumeFor) {
    const key = publication.trackSid;
    const previous = this.entries.get(key);
    if (previous?.track === track) {
      track.setVolume(volumeFor(previous.identity, previous.source));
      return;
    }
    if (previous) this.remove(previous.track);
    const source = publication.source === Track.Source.ScreenShareAudio ? 'screen' : 'microphone';
    // Set the SDK's remembered gain before attachment as well, then again
    // after attachment (the SDK treats an initial zero as unset).
    track.setVolume(volumeFor(identity, source));
    const element = track.attach();
    element.autoplay = true;
    element.style.display = 'none';
    track.setVolume(volumeFor(identity, source));
    this.entries.set(key, { track, element, identity, source });
    document.body.appendChild(element);
  }

  update(volumeFor: VolumeFor) {
    for (const entry of this.entries.values()) {
      entry.track.setVolume(volumeFor(entry.identity, entry.source));
    }
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
