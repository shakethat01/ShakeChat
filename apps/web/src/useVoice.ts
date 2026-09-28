import { useCallback, useEffect, useRef, useState } from 'react';
import { LocalAudioTrack, LocalTrackPublication, Participant, RemoteTrackPublication, Room, RoomEvent, Track, TrackPublication, VideoQuality } from 'livekit-client';
import { api } from './api';
import { AppPreferences, DEFAULT_PREFERENCES, cameraCaptureFor, pushToTalkKeyLabel, screenCaptureFor, screenPublishFor, screenQualityLabel } from './preferences';
import { NoiseGateProcessor } from './noiseGate';
import { loadVoiceDevices, saveVoiceDevices } from './voiceDevicePreferences';
import type { RemoteAudioTrack } from 'livekit-client';
import { RemoteAudioPlayback, type PlaybackSource } from './remoteAudioPlayback';
import { applyScreenSettings, replaceScreenSource, screenOptions, settingsForPreset, type ScreenSettings } from './screenShareControl';
import { playVoiceSound, type VoiceSound } from './voiceNotifications';
import { isMicrophoneTestActive, registerMicrophoneTestIsolation } from './microphoneTestIsolation';

export type VoiceParticipant = {
  identity: string;
  name: string;
  local: boolean;
  speaking: boolean;
  muted: boolean;
  camera: boolean;
  screen: boolean;
};

export type VoiceVideoTrack = {
  id: string;
  identity: string;
  name: string;
  local: boolean;
  source: 'camera' | 'screen';
  publication: TrackPublication;
};

type VoiceStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export function publicationIsActive(
  publication?: TrackPublication | null,
): publication is TrackPublication {
  return Boolean(publication?.track && !publication.isMuted);
}

const VOICE_MUTE_STORAGE_KEY = 'shakechat.voice-global-muted.v1';
function loadGlobalMuted() { try { return localStorage.getItem(VOICE_MUTE_STORAGE_KEY) === '1'; } catch { return false; } }
function saveGlobalMuted(value: boolean) { try { localStorage.setItem(VOICE_MUTE_STORAGE_KEY, value ? '1' : '0'); } catch { /* Storage may be unavailable. */ } }

const VOICE_VOLUME_STORAGE_KEY = 'shakechat.voice-user-volumes.v14';
const SCREEN_VOLUME_STORAGE_KEY = 'shakechat.screen-user-volumes.v1';
const MICROPHONE_PUBLISH_OPTIONS = {
  audioPreset: { maxBitrate: 192_000, priority: 'high' as const },
  dtx: true,
  red: true,
  stopMicTrackOnMute: false,
};

export function clampVoiceVolume(value: number) {
  if (!Number.isFinite(value)) return 100;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function loadVoiceVolumes(key = VOICE_VOLUME_STORAGE_KEY): Record<string, number> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '{}') as Record<string, unknown>;
    return Object.fromEntries(Object.entries(parsed).filter(([, value]) => typeof value === 'number').map(([identity, value]) => [identity, clampVoiceVolume(value as number)]));
  } catch { return {}; }
}

function persistVoiceVolumes(volumes: Record<string, number>, key = VOICE_VOLUME_STORAGE_KEY) {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(key, JSON.stringify(volumes)); } catch { /* Storage can be unavailable in private mode. */ }
}

export function useVoice(enabled: boolean, onError: (message: string) => void, preferences: AppPreferences = DEFAULT_PREFERENCES) {
  const devicesRef = useRef(loadVoiceDevices());
  const userMutedRef = useRef(loadGlobalMuted());
  const [microphoneMutedPreference, setMicrophoneMutedPreference] = useState(userMutedRef.current);
  const inputModeRef = useRef(preferences.voiceInputMode);
  const [microphoneTrack, setMicrophoneTrack] = useState<MediaStreamTrack | null>(null);
  const roomRef = useRef<Room | null>(null);
  const channelRef = useRef('');
  const readyRef = useRef(false);
  const watchingRef = useRef(new Set<string>());
  const subscriptionIntentRef = useRef(new Map<string, boolean>());
  const viewersRef = useRef(new Set<string>());
  const [watchingScreens, setWatchingScreens] = useState<string[]>([]);
  const [availableScreens, setAvailableScreens] = useState<VoiceVideoTrack[]>([]);
  const [screenViewers, setScreenViewers] = useState<string[]>([]);
  const [screenSettings, setScreenSettings] = useState<ScreenSettings>(() => settingsForPreset(preferences.screenQuality));
  const settingsRef = useRef(screenSettings);
  const [screenBusy, setScreenBusy] = useState(false);
  const soundRef = useRef<(event: VoiceSound) => void>(() => {});

  const operationRef = useRef(0);
  const deafenedRef = useRef(false);
  const playbackRef = useRef(new RemoteAudioPlayback());
  const locallyMutedRef = useRef(new Set<string>());
  const screenMutedRef = useRef(new Set<string>());
  const microphoneOperationsRef = useRef<Promise<void>>(Promise.resolve());
  const testPausedScreenRef = useRef<LocalTrackPublication | null>(null);
  const screenPickerPendingRef = useRef(false);
  const pttHeldRef = useRef(false);
  const pttOperationRef = useRef(0);
  const noiseGateProcessorRef = useRef<NoiseGateProcessor | null>(null);
  const participantVolumesRef = useRef<Record<string, number>>(loadVoiceVolumes());
  const screenVolumesRef = useRef<Record<string, number>>(loadVoiceVolumes(SCREEN_VOLUME_STORAGE_KEY));
  const [status, setStatus] = useState<VoiceStatus>('disconnected');
  const [channelId, setChannelId] = useState('');
  const [participants, setParticipants] = useState<VoiceParticipant[]>([]);
  const [videoTracks, setVideoTracks] = useState<VoiceVideoTrack[]>([]);
  const [muted, setMuted] = useState(true);
  const [deafened, setDeafened] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [canSpeak, setCanSpeak] = useState(false);
  const [inputDevices, setInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [inputDeviceId, setInputDeviceId] = useState(devicesRef.current.audioinput);
  const [outputDeviceId, setOutputDeviceId] = useState(devicesRef.current.audiooutput);
  const [cameraDeviceId, setCameraDeviceId] = useState('');
  const [participantVolumes, setParticipantVolumes] = useState<Record<string, number>>(() => participantVolumesRef.current);
  const [screenVolumes, setScreenVolumes] = useState<Record<string, number>>(() => screenVolumesRef.current);
  const [locallyMutedScreens, setLocallyMutedScreens] = useState<string[]>([]);
  const [microphoneTestActive, setMicrophoneTestActive] = useState(isMicrophoneTestActive);
  const [locallyMutedParticipants, setLocallyMutedParticipants] = useState<string[]>([]);
  const [pushToTalkActive, setPushToTalkActive] = useState(false);

  soundRef.current = event => {
    if (deafenedRef.current || isMicrophoneTestActive()) return;
    const enabled = event === 'join' || event === 'leave' ? preferences.channelSounds : preferences.streamSounds;
    if (enabled) playVoiceSound(event, preferences.notificationVolume, devicesRef.current.audiooutput);
  };

  const sendWatchState = useCallback((room: Room, identity: string, watching: boolean) => {
    const publication = room.remoteParticipants.get(identity)?.getTrackPublication(Track.Source.ScreenShare);
    if (!publication) return;
    const payload = new TextEncoder().encode(JSON.stringify({ type: 'watch', sid: publication.trackSid, watching }));
    void room.localParticipant.publishData?.(payload, { reliable: true, topic: 'shakechat.watch.v1', destinationIdentities: [identity] }).catch(() => undefined);
  }, []);

  const syncSubscriptions = useCallback((room: Room) => {
    for (const participant of room.remoteParticipants.values()) {
      for (const publication of participant.trackPublications?.values() ?? []) {
        const screen = publication.source === Track.Source.ScreenShare || publication.source === Track.Source.ScreenShareAudio;
        const desired = !screen || watchingRef.current.has(participant.identity);
        if (subscriptionIntentRef.current.get(publication.trackSid) === desired) continue;
        subscriptionIntentRef.current.set(publication.trackSid, desired);
        publication.setSubscribed(desired);
      }
    }
  }, []);

  const queueMicrophoneOperation = useCallback((task: () => Promise<void>) => {
    const operation = microphoneOperationsRef.current.then(task);
    microphoneOperationsRef.current = operation.catch(() => undefined);
    return operation;
  }, []);

  const playbackVolume = useCallback((identity: string, source: PlaybackSource) => {
    if (deafenedRef.current) return 0;
    const muted = source === 'screen' ? screenMutedRef.current : locallyMutedRef.current;
    const volumes = source === 'screen' ? screenVolumesRef.current : participantVolumesRef.current;
    return muted.has(identity) ? 0 : clampVoiceVolume(volumes[identity] ?? 100) / 100;
  }, []);

  const microphoneCaptureOptions = useCallback((deviceId?: string) => ({
    sampleRate: 48_000,
    channelCount: 2,
    echoCancellation: preferences.echoCancellation,
    noiseSuppression: false,
    autoGainControl: preferences.autoGainControl,
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
  }), [preferences.autoGainControl, preferences.echoCancellation, preferences.noiseSuppression]);

  const applyMicrophoneTuning = useCallback(async (room: Room, publication?: LocalTrackPublication) => {
    const activePublication = publication ?? room.localParticipant.getTrackPublication(Track.Source.Microphone) as LocalTrackPublication | undefined;
    const track = activePublication?.track;
    if (!(track instanceof LocalAudioTrack)) return;
    await track.applyConstraints({
      echoCancellation: preferences.echoCancellation,
      noiseSuppression: false,
      autoGainControl: preferences.autoGainControl,
    }).catch(() => undefined);
    let gate = noiseGateProcessorRef.current;
    if (!gate) {
      gate = new NoiseGateProcessor(preferences.noiseGateEnabled, preferences.noiseGateThreshold, preferences.noiseSuppression);
      noiseGateProcessorRef.current = gate;
    } else {
      gate.setSettings(preferences.noiseGateEnabled, preferences.noiseGateThreshold, preferences.noiseSuppression);
    }
    if (track.getProcessor()?.name !== gate.name) await track.setProcessor(gate);
    if (roomRef.current === room) setMicrophoneTrack(track.mediaStreamTrack);
    console.info('[voice] applied mic constraints', {
      sampleRate: 48_000,
      channelCount: 2,
      echoCancellation: preferences.echoCancellation,
      noiseSuppression: false,
      autoGainControl: preferences.autoGainControl,
    });
    console.info('[voice] applied noise gate settings', { enabled: preferences.noiseGateEnabled, thresholdDb: preferences.noiseGateThreshold });
    console.info('[voice] applied audio bitrate', { maxBitrate: 192_000, priority: 'high', codec: 'opus-preferred-by-webrtc' });
  }, [preferences.autoGainControl, preferences.echoCancellation, preferences.noiseGateEnabled, preferences.noiseGateThreshold, preferences.noiseSuppression]);

  const setMicrophone = useCallback((room: Room, requested: boolean, deviceId?: string) => queueMicrophoneOperation(async () => {
    if (roomRef.current !== room) return;
    const enabled = requested && !isMicrophoneTestActive() && !deafenedRef.current;
    if (!enabled) {
      await room.localParticipant.setMicrophoneEnabled(false);
      return;
    }
    const publication = await room.localParticipant.setMicrophoneEnabled(true, microphoneCaptureOptions(deviceId ?? (room.getActiveDevice('audioinput') || undefined)), MICROPHONE_PUBLISH_OPTIONS);
    if (roomRef.current !== room) return;
    if (publication) await applyMicrophoneTuning(room, publication);
    // Isolation can be requested while getUserMedia / processor.init is awaiting.
    if (isMicrophoneTestActive() || deafenedRef.current) await room.localParticipant.setMicrophoneEnabled(false);
  }), [applyMicrophoneTuning, microphoneCaptureOptions, queueMicrophoneOperation]);

  const syncParticipants = useCallback((room: Room) => {
    if (roomRef.current !== room) return;
    syncSubscriptions(room);
    const all: Participant[] = [room.localParticipant, ...room.remoteParticipants.values()];
    setParticipants(all.map(participant => ({
      identity: participant.identity,
      name: participant.name || participant.identity,
      local: participant.isLocal,
      speaking: participant.isSpeaking,
      muted: participant.getTrackPublication(Track.Source.Microphone)?.isMuted ?? !participant.isMicrophoneEnabled,
      camera: publicationIsActive(participant.getTrackPublication(Track.Source.Camera)),
      screen: Boolean(participant.getTrackPublication(Track.Source.ScreenShare) && !participant.getTrackPublication(Track.Source.ScreenShare)?.isMuted),
    })));

    const nextVideoTracks: VoiceVideoTrack[] = [];
    const nextScreens: VoiceVideoTrack[] = [];
    for (const participant of all) {
      const camera = participant.getTrackPublication(Track.Source.Camera);
      if (publicationIsActive(camera)) {
        nextVideoTracks.push({
          id: `${participant.identity}:camera:${camera.trackSid}`,
          identity: participant.identity,
          name: participant.name || participant.identity,
          local: participant.isLocal,
          source: 'camera',
          publication: camera,
        });
      }
      const screen = participant.getTrackPublication(Track.Source.ScreenShare);
      if (screen && !screen.isMuted) {
        const item: VoiceVideoTrack = { id: `${participant.identity}:screen:${screen.trackSid}`, identity: participant.identity, name: participant.name || participant.identity, local: participant.isLocal, source: 'screen', publication: screen };
        nextScreens.push(item);
        if (!participant.isLocal && !watchingRef.current.has(participant.identity)) continue;
        if (!publicationIsActive(screen)) continue;
        if (!participant.isLocal && screen instanceof RemoteTrackPublication) {
          // Receiving quality must not depend on this viewer's own publishing
          // preference. Otherwise a second account left at 1080p30 asks LiveKit
          // for a smaller simulcast layer and a 1440p publisher arrives as 720p.
          // Always request the highest screen-share layer; congestion control may
          // still reduce it if the actual connection cannot sustain the stream.
          screen.setVideoQuality(VideoQuality.HIGH);
          screen.setVideoDimensions({ width: 7680, height: 4320 });
          screen.setVideoFPS(144);
        }
        nextVideoTracks.push({
          id: `${participant.identity}:screen:${screen.trackSid}`,
          identity: participant.identity,
          name: participant.name || participant.identity,
          local: participant.isLocal,
          source: 'screen',
          publication: screen,
        });
      }
    }
    setVideoTracks(nextVideoTracks);
    setAvailableScreens(nextScreens);

    const local = room.localParticipant;
    setMuted(!local.isMicrophoneEnabled);
    const mic = local.getTrackPublication(Track.Source.Microphone)?.audioTrack;
    if (mic) setMicrophoneTrack(mic.mediaStreamTrack);
    setCameraEnabled(publicationIsActive(local.getTrackPublication(Track.Source.Camera)));
    setScreenSharing(publicationIsActive(local.getTrackPublication(Track.Source.ScreenShare)));
  }, [syncSubscriptions]);

  const refreshDevices = useCallback(async (requestPermissions = false) => {
    try {
      const [inputs, outputs, cameras] = await Promise.all([
        Room.getLocalDevices('audioinput', requestPermissions),
        Room.getLocalDevices('audiooutput', false),
        Room.getLocalDevices('videoinput', false),
      ]);
      setInputDevices(inputs);
      setOutputDevices(outputs);
      setCameraDevices(cameras);
      const room = roomRef.current;
      if (room) {
        setInputDeviceId(room.getActiveDevice('audioinput') || inputs[0]?.deviceId || '');
        setOutputDeviceId(room.getActiveDevice('audiooutput') || outputs[0]?.deviceId || '');
        setCameraDeviceId(room.getActiveDevice('videoinput') || cameras[0]?.deviceId || '');
      }
    } catch (error) {
      if (requestPermissions) onError(error instanceof Error ? error.message : 'Medya cihazları okunamadı.');
    }
  }, [onError]);

  const removeAudioElements = useCallback(() => {
    playbackRef.current.clear();
  }, []);

  const leave = useCallback(async () => {
    operationRef.current += 1;
    if (readyRef.current) soundRef.current('leave');
    readyRef.current = false;
    watchingRef.current.clear(); subscriptionIntentRef.current.clear(); viewersRef.current.clear();
    setWatchingScreens([]); setAvailableScreens([]); setScreenViewers([]);
    const room = roomRef.current;
    roomRef.current = null;
    testPausedScreenRef.current = null;
    channelRef.current = '';
    setChannelId('');
    setStatus('disconnected');
    setMicrophoneTrack(null);
    setParticipants([]);
    setVideoTracks([]);
    setCanSpeak(false);
    setMuted(true);
    setCameraEnabled(false);
    setScreenSharing(false);
    pttHeldRef.current = false;
    pttOperationRef.current += 1;
    setPushToTalkActive(false);
    removeAudioElements();
    const gate = noiseGateProcessorRef.current;
    noiseGateProcessorRef.current = null;
    if (gate) void gate.destroy();
    if (room) {
      try { await room.disconnect(true); } catch { /* Already disconnected. */ }
    }
  }, [removeAudioElements]);

  const join = useCallback(async (nextChannelId: string) => {
    if (!enabled || !nextChannelId) return;
    if (roomRef.current && channelRef.current === nextChannelId && status !== 'disconnected') return;
    await leave();
    const operation = ++operationRef.current;
    setStatus('connecting');
    try {
      const credentials = await api.voiceToken(nextChannelId);
      if (operation !== operationRef.current) return;
      const [inputs, outputs] = await Promise.all([
        Room.getLocalDevices('audioinput', false), Room.getLocalDevices('audiooutput', false),
      ]);
      if (operation !== operationRef.current) return;
      const input = inputs.some(device => device.deviceId === devicesRef.current.audioinput) ? devicesRef.current.audioinput : '';
      const output = outputs.some(device => device.deviceId === devicesRef.current.audiooutput) ? devicesRef.current.audiooutput : '';
      // A permission prompt or temporary device-list gap must not erase saved choices.
      setInputDeviceId(input); setOutputDeviceId(output);
      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        ...(output ? { audioOutput: { deviceId: output } } : {}),
        audioCaptureDefaults: {
          ...(input ? { deviceId: input } : {}),
          sampleRate: 48_000,
          channelCount: 2,
          echoCancellation: preferences.echoCancellation,
          noiseSuppression: false,
          autoGainControl: preferences.autoGainControl,
        },
      });
      roomRef.current = room;
      channelRef.current = nextChannelId;

      const sync = () => syncParticipants(room);
      room.on(RoomEvent.ParticipantConnected, () => { if (roomRef.current !== room) return; if (readyRef.current) soundRef.current('join'); sync(); });
      room.on(RoomEvent.ParticipantDisconnected, participant => {
        if (roomRef.current !== room) return;
        if (readyRef.current) soundRef.current('leave');
        watchingRef.current.delete(participant.identity); viewersRef.current.delete(participant.identity);
        setWatchingScreens([...watchingRef.current]); setScreenViewers([...viewersRef.current]);
        playbackRef.current.removeParticipant(participant.identity);
        sync();
      });
      room.on(RoomEvent.ActiveSpeakersChanged, sync);
      room.on(RoomEvent.TrackMuted, sync);
      room.on(RoomEvent.TrackUnmuted, sync);
      room.on(RoomEvent.TrackPublished, publication => {
        if (roomRef.current !== room) return;
        if (readyRef.current && publication.source === Track.Source.ScreenShare) soundRef.current('stream-start');
        sync();
      });
      room.on(RoomEvent.TrackUnpublished, (publication, participant) => {
        if (roomRef.current !== room) return;
        subscriptionIntentRef.current.delete(publication.trackSid);
        if (publication.source === Track.Source.ScreenShare) {
          if (readyRef.current) soundRef.current('stream-stop');
          watchingRef.current.delete(participant.identity); setWatchingScreens([...watchingRef.current]);
          playbackRef.current.removeParticipant(participant.identity, 'screen');
        }
        sync();
      });
      room.on(RoomEvent.LocalTrackPublished, publication => {
        if (roomRef.current !== room) return;
        if (readyRef.current && publication.source === Track.Source.ScreenShare) soundRef.current('stream-start');
        sync();
      });
      room.on(RoomEvent.LocalTrackUnpublished, publication => {
        if (roomRef.current !== room) return;
        if (publication.source === Track.Source.ScreenShare) {
          if (readyRef.current) soundRef.current('stream-stop');
          viewersRef.current.clear(); setScreenViewers([]);
        }
        sync();
      });
      room.on(RoomEvent.DataReceived, (payload, participant, _kind, topic) => {
        if (roomRef.current !== room || !participant || topic !== 'shakechat.watch.v1' || payload.byteLength > 512) return;
        try {
          const data = JSON.parse(new TextDecoder().decode(payload));
          if (data.type === 'query') {
            if (watchingRef.current.has(participant.identity) && participant.getTrackPublication(Track.Source.ScreenShare)?.isSubscribed) sendWatchState(room, participant.identity, true);
            return;
          }
          const publication = room.localParticipant.getTrackPublication(Track.Source.ScreenShare);
          if (data.type !== 'watch' || data.sid !== publication?.trackSid || typeof data.watching !== 'boolean') return;
          const existed = viewersRef.current.has(participant.identity);
          if (data.watching) viewersRef.current.add(participant.identity); else viewersRef.current.delete(participant.identity);
          setScreenViewers([...viewersRef.current]);
          if (data.watching && !existed && readyRef.current) soundRef.current('viewer');
        } catch { /* Ignore malformed data from another participant. */ }
      });
      room.on(RoomEvent.ParticipantPermissionsChanged, (_previous, participant) => {
        if (roomRef.current !== room) return;
        if (participant.isLocal) {
          const publishAllowed = participant.permissions?.canPublish ?? false;
          setCanSpeak(publishAllowed);
          if (!publishAllowed) {
            setMuted(true);
            setCameraEnabled(false);
            setScreenSharing(false);
            pttHeldRef.current = false;
            pttOperationRef.current += 1;
            setPushToTalkActive(false);
          }
        }
        sync();
      });
      room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
        if (roomRef.current !== room) return;
        const screen = publication.source === Track.Source.ScreenShare || publication.source === Track.Source.ScreenShareAudio;
        if (screen && !watchingRef.current.has(participant.identity)) { publication.setSubscribed(false); return; }
        if (publication.source === Track.Source.ScreenShare) sendWatchState(room, participant.identity, true);
        if (track.kind === Track.Kind.Audio) {
          playbackRef.current.attach(track as RemoteAudioTrack, publication, participant.identity, playbackVolume);
        }
        sync();
      });
      room.on(RoomEvent.TrackUnsubscribed, track => {
        if (track.kind === Track.Kind.Audio) {
          playbackRef.current.remove(track as RemoteAudioTrack);
        }
        sync();
      });
      room.on(RoomEvent.Reconnecting, () => { if (roomRef.current === room) { readyRef.current = false; setStatus('reconnecting'); } });
      room.on(RoomEvent.Reconnected, () => {
        if (roomRef.current !== room) return;
        subscriptionIntentRef.current.clear(); sync(); setStatus('connected'); readyRef.current = true;
        for (const identity of watchingRef.current) sendWatchState(room, identity, true);
        viewersRef.current.clear(); setScreenViewers([]);
        void room.localParticipant.publishData?.(new TextEncoder().encode('{"type":"query"}'), { reliable: true, topic: 'shakechat.watch.v1' }).catch(() => undefined);
      });
      room.on(RoomEvent.Disconnected, () => {
        if (roomRef.current !== room) return;
        readyRef.current = false;
        watchingRef.current.clear(); subscriptionIntentRef.current.clear(); viewersRef.current.clear();
        setWatchingScreens([]); setAvailableScreens([]); setScreenViewers([]);
        roomRef.current = null;
        testPausedScreenRef.current = null;
        channelRef.current = '';
        setChannelId('');
        setStatus('disconnected');
        setMicrophoneTrack(null);
        setParticipants([]);
        setVideoTracks([]);
        setCanSpeak(false);
        setMuted(true);
        setCameraEnabled(false);
        setScreenSharing(false);
        pttHeldRef.current = false;
        pttOperationRef.current += 1;
        setPushToTalkActive(false);
        removeAudioElements();
        const gate = noiseGateProcessorRef.current;
        noiseGateProcessorRef.current = null;
        if (gate) void gate.destroy();
      });
      room.on(RoomEvent.MediaDevicesChanged, () => { void refreshDevices(false); });

      await room.connect(credentials.url, credentials.token, { autoSubscribe: false });
      syncSubscriptions(room);
      if (operation !== operationRef.current || roomRef.current !== room) { await room.disconnect(true); return; }
      setChannelId(nextChannelId);
      setCanSpeak(credentials.canSpeak);
      if (credentials.canSpeak) {
        const openMic = inputModeRef.current === 'voice_activity' && !userMutedRef.current && !deafenedRef.current;
        await setMicrophone(room, openMic, input);
        setMuted(!room.localParticipant.isMicrophoneEnabled);
      } else {
        setMuted(true);
      }
      if (operation !== operationRef.current || roomRef.current !== room) return;
      setStatus('connected');
      readyRef.current = true; soundRef.current('join');
      try { await room.startAudio(); } catch { /* User can retry through a control click. */ }
      await refreshDevices(true);
      sync();
    } catch (error) {
      if (operation !== operationRef.current) return;
      const room = roomRef.current;
      roomRef.current = null;
      channelRef.current = '';
      setChannelId('');
      setStatus('disconnected');
      setMicrophoneTrack(null);
      setParticipants([]);
      setVideoTracks([]);
      setCanSpeak(false);
      setMuted(true);
      setCameraEnabled(false);
      setScreenSharing(false);
      pttHeldRef.current = false;
      pttOperationRef.current += 1;
      setPushToTalkActive(false);
      removeAudioElements();
      if (room) try { await room.disconnect(true); } catch { /* ignore */ }
      onError(error instanceof Error ? error.message : 'Ses kanalına bağlanılamadı.');
    }
  }, [enabled, inputDeviceId, leave, onError, playbackVolume, preferences.autoGainControl, preferences.echoCancellation, preferences.noiseSuppression, preferences.voiceInputMode, refreshDevices, removeAudioElements, setMicrophone, status, syncParticipants, syncSubscriptions, sendWatchState]);

  const toggleMute = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    if (!canSpeak) { onError('Bu ses kanalında konuşma yetkin yok.'); return; }
    if (preferences.voiceInputMode === 'push_to_talk') { onError(`Bas-konuş etkin. ${pushToTalkKeyLabel(preferences.pushToTalkKey)} tuşunu basılı tut.`); return; }
    try {
      const enable = userMutedRef.current;
      if (enable && deafenedRef.current) { onError('Önce sağırlaştırmayı kapat.'); return; }
      userMutedRef.current = !enable;
      setMicrophoneMutedPreference(!enable);
      saveGlobalMuted(!enable);
      await setMicrophone(room, enable, inputDeviceId || undefined);
      setMuted(!room.localParticipant.isMicrophoneEnabled);
      syncParticipants(room);
    } catch (error) { onError(error instanceof Error ? error.message : 'Mikrofon durumu değiştirilemedi.'); }
  }, [canSpeak, inputDeviceId, muted, onError, preferences.pushToTalkKey, preferences.voiceInputMode, setMicrophone, syncParticipants]);

  const toggleDeafen = useCallback(async () => {
    const next = !deafenedRef.current;
    deafenedRef.current = next;
    setDeafened(next);
    playbackRef.current.update(playbackVolume);
    const room = roomRef.current;
    if (next && room?.localParticipant.isMicrophoneEnabled) {
      try { await setMicrophone(room, false); setMuted(true); syncParticipants(room); } catch { /* Deafen still applies to playback. */ }
    }
    if (!next) {
      if (room && canSpeak && inputModeRef.current === 'voice_activity' && !userMutedRef.current) {
        try { await setMicrophone(room, true); setMuted(!room.localParticipant.isMicrophoneEnabled); syncParticipants(room); } catch { /* User can retry unmuting. */ }
      }
      try { await room?.startAudio(); } catch { /* Browser may still require another interaction. */ }
    }
  }, [canSpeak, playbackVolume, setMicrophone, syncParticipants]);

  const toggleCamera = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    if (!canSpeak) { onError('Bu ses kanalında kamera açma yetkin yok.'); return; }
    try {
      const enable = !cameraEnabled;
      const capture = enable ? cameraCaptureFor(preferences.cameraQuality) : undefined;
      await room.localParticipant.setCameraEnabled(enable, capture);
      setCameraEnabled(enable);
      await refreshDevices(false);
      syncParticipants(room);
    } catch (error) { onError(error instanceof Error ? error.message : 'Kamera durumu değiştirilemedi.'); }
  }, [cameraEnabled, canSpeak, onError, preferences.cameraQuality, refreshDevices, syncParticipants]);

  const toggleScreenShare = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    if (!canSpeak) { onError('Bu ses kanalında ekran paylaşma yetkin yok.'); return; }
    if (!screenSharing && isMicrophoneTestActive()) { onError('Yeni yayın başlatmadan önce mikrofon testini durdur.'); return; }
    if (screenPickerPendingRef.current) return;
    screenPickerPendingRef.current = true; setScreenBusy(true);
    try {
      const enable = !screenSharing;
      const options = screenOptions(settingsRef.current);
      const resolution = enable ? options.resolution : undefined;
      const publishOptions = enable ? options.publish : undefined;
      console.info('[voice] selected screen preset', { preset: preferences.screenQuality, label: screenQualityLabel(preferences.screenQuality), capture: resolution, publish: publishOptions?.screenShareEncoding });
      const publication = await room.localParticipant.setScreenShareEnabled(
        enable,
        enable ? {
          audio: true,
          contentHint: resolution?.frameRate && resolution.frameRate >= 60 ? 'motion' : 'detail',
          ...(resolution ? { resolution } : {}),
        } : undefined,
        publishOptions,
      );
      if (enable && resolution) {
        const mediaTrack = publication?.videoTrack?.mediaStreamTrack;
        if (mediaTrack) mediaTrack.contentHint = resolution.frameRate >= 60 ? 'motion' : 'detail';
        if (mediaTrack?.applyConstraints) {
          try {
            await mediaTrack.applyConstraints({
              width: { ideal: resolution.width, max: resolution.width },
              height: { ideal: resolution.height, max: resolution.height },
              frameRate: { ideal: resolution.frameRate, max: resolution.frameRate },
            });
          } catch {
            // Display capture support varies by browser. The originally requested
            // LiveKit constraints remain active when post-capture tuning is rejected.
          }
        }
        const actual = mediaTrack?.getSettings?.();
        console.info('[voice] applied video bitrate/FPS', {
          preset: preferences.screenQuality,
          requestedFps: resolution.frameRate,
          actualFps: actual?.frameRate,
          width: actual?.width,
          height: actual?.height,
          maxBitrate: publishOptions?.screenShareEncoding?.maxBitrate,
          contentHint: mediaTrack?.contentHint,
        });
        if (preferences.screenQuality === 'ultra' && actual?.frameRate && actual.frameRate < 144) {
          console.warn('[voice] Ultra capture returned below target FPS', { target: 144, actual: actual.frameRate });
        }
      }
      if (roomRef.current !== room) { if (enable) await room.localParticipant.setScreenShareEnabled(false); return; }
      setScreenSharing(enable);
      syncParticipants(room);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Ekran paylaşımı başlatılamadı.';
      if (!/cancel|denied|permission/i.test(message)) onError(message);
      syncParticipants(room);
    } finally {
      screenPickerPendingRef.current = false; setScreenBusy(false);
    }
  }, [canSpeak, onError, preferences.screenQuality, screenSharing, syncParticipants]);

  const setScreenWatching = useCallback((identity: string, watch: boolean) => {
    const room = roomRef.current;
    if (!room || !room.remoteParticipants.get(identity)?.getTrackPublication(Track.Source.ScreenShare)) return;
    if (watch) watchingRef.current.add(identity); else {
      sendWatchState(room, identity, false);
      watchingRef.current.delete(identity);
      playbackRef.current.removeParticipant(identity, 'screen');
    }
    setWatchingScreens([...watchingRef.current]);
    syncParticipants(room);
  }, [sendWatchState, syncParticipants]);

  const changeScreenSettings = useCallback(async (next: ScreenSettings) => {
    const room = roomRef.current;
    if (screenPickerPendingRef.current || !room) return;
    const track = room.localParticipant.getTrackPublication(Track.Source.ScreenShare)?.videoTrack;
    if (!track) return;
    screenPickerPendingRef.current = true; setScreenBusy(true);
    try {
      await applyScreenSettings(track, next);
      if (roomRef.current === room) { settingsRef.current = next; setScreenSettings(next); syncParticipants(room); }
    } catch (error) { onError(error instanceof Error ? error.message : 'Yayın kalitesi değiştirilemedi.'); }
    finally { screenPickerPendingRef.current = false; setScreenBusy(false); }
  }, [onError, syncParticipants]);

  const changeScreenSource = useCallback(async () => {
    const room = roomRef.current;
    if (!room || screenPickerPendingRef.current) return;
    if (isMicrophoneTestActive()) { onError('Ekranı değiştirmeden önce mikrofon testini durdur.'); return; }
    screenPickerPendingRef.current = true; setScreenBusy(true);
    try {
      await replaceScreenSource(room, settingsRef.current, () => roomRef.current === room);
      if (roomRef.current === room) syncParticipants(room);
    } catch (error) {
      if (!(error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'AbortError'))) onError(error instanceof Error ? error.message : 'Ekran değiştirilemedi.');
    } finally { screenPickerPendingRef.current = false; setScreenBusy(false); }
  }, [onError, syncParticipants]);

  useEffect(() => {
    if (!screenSharing) { const next = settingsForPreset(preferences.screenQuality); settingsRef.current = next; setScreenSettings(next); }
  }, [preferences.screenQuality, screenSharing]);

  const reconcileTestRef = useRef<() => Promise<void>>(async () => {});
  reconcileTestRef.current = async () => {
    const active = isMicrophoneTestActive();
    if (active && screenPickerPendingRef.current) throw new Error('Ekran paylaşımı seçimini bitirdikten sonra mikrofon testini başlat.');
    setMicrophoneTestActive(active);
    pttHeldRef.current = false;
    pttOperationRef.current += 1;
    setPushToTalkActive(false);
    const room = roomRef.current;
    if (!room) return;
    const open = !active && canSpeak && inputModeRef.current === 'voice_activity' && !userMutedRef.current && !deafenedRef.current;
    await setMicrophone(room, open);
    if (roomRef.current !== room) return;
    const screen = room.localParticipant.getTrackPublication(Track.Source.ScreenShareAudio);
    if (active && screen && !screen.isUpstreamPaused && !screen.isMuted) {
      // The local monitor would otherwise be captured by full-system sharing.
      testPausedScreenRef.current = screen;
      await screen.pauseUpstream();
    } else if (!active) {
      const paused = testPausedScreenRef.current;
      testPausedScreenRef.current = null;
      if (paused && screen === paused) await paused.resumeUpstream();
    }
    setMuted(!room.localParticipant.isMicrophoneEnabled);
    syncParticipants(room);
  };
  useEffect(() => registerMicrophoneTestIsolation(() => reconcileTestRef.current()), []);

  useEffect(() => {
    const room = roomRef.current;
    if (!room) return;
    const publication = room.localParticipant.getTrackPublication(Track.Source.Microphone) as LocalTrackPublication | undefined;
    if (!publication?.track) return;
    void queueMicrophoneOperation(async () => {
      if (roomRef.current === room) await applyMicrophoneTuning(room, publication);
    }).catch(() => { /* Runtime tuning is best effort. */ });
  }, [applyMicrophoneTuning, queueMicrophoneOperation]);

  const switchInput = useCallback((deviceId: string) => {
    const selectedRoom = roomRef.current;
    return queueMicrophoneOperation(async () => {
      if (!deviceId) return;
      const room = roomRef.current;
      if (room !== selectedRoom) return;
      const previousDevice = room?.getActiveDevice('audioinput') || devicesRef.current.audioinput || 'default';
      try {
        if (room) {
          const switched = await room.switchActiveDevice('audioinput', deviceId);
          if (!switched) throw new Error('Mikrofon değiştirilemedi.');
          if (roomRef.current !== room) return;
          const publication = room.localParticipant.getTrackPublication(Track.Source.Microphone) as LocalTrackPublication | undefined;
          if (publication?.track) await applyMicrophoneTuning(room, publication);
        }
        devicesRef.current = { ...devicesRef.current, audioinput: deviceId };
        saveVoiceDevices(devicesRef.current);
        setInputDeviceId(deviceId);
        if (room) syncParticipants(room);
      } catch (error) {
        if (roomRef.current !== room) return;
        if (room) {
          try {
            const recovered = await room.switchActiveDevice('audioinput', previousDevice);
            if (!recovered) throw new Error('Önceki mikrofon açılamadı.');
            if (roomRef.current !== room) return;
            await applyMicrophoneTuning(room);
            syncParticipants(room);
          } catch {
            onError('Mikrofon değiştirilemedi ve önceki cihaz açılamadı. Bağlantıyı kesmeden çalışan bir mikrofon seç.');
            return;
          }
        }
        onError(error instanceof Error ? error.message : 'Mikrofon değiştirilemedi.');
      }
    });
  }, [applyMicrophoneTuning, onError, queueMicrophoneOperation, syncParticipants]);

  const switchOutput = useCallback(async (deviceId: string) => {
    if (!deviceId) return;
    const room = roomRef.current;
    try {
      if (room) await room.switchActiveDevice('audiooutput', deviceId);
      devicesRef.current = { ...devicesRef.current, audiooutput: deviceId };
      saveVoiceDevices(devicesRef.current);
      setOutputDeviceId(deviceId);
    } catch { onError('Hoparlör değiştirilemedi. Önceki cihaz seçimi korunuyor.'); }
  }, [onError]);

  const switchCamera = useCallback(async (deviceId: string) => {
    setCameraDeviceId(deviceId);
    const room = roomRef.current;
    if (!room || !deviceId) return;
    try {
      await room.switchActiveDevice('videoinput', deviceId);
      syncParticipants(room);
    } catch (error) { onError(error instanceof Error ? error.message : 'Kamera değiştirilemedi.'); }
  }, [onError, syncParticipants]);

  const setParticipantVolume = useCallback((identity: string, value: number) => {
    const nextValue = clampVoiceVolume(value);
    const next = { ...participantVolumesRef.current, [identity]: nextValue };
    participantVolumesRef.current = next;
    persistVoiceVolumes(next);
    setParticipantVolumes(next);
    playbackRef.current.update(playbackVolume);
  }, [playbackVolume]);

  const setScreenVolume = useCallback((identity: string, value: number) => {
    const next = { ...screenVolumesRef.current, [identity]: clampVoiceVolume(value) };
    screenVolumesRef.current = next;
    persistVoiceVolumes(next, SCREEN_VOLUME_STORAGE_KEY);
    setScreenVolumes(next);
    playbackRef.current.update(playbackVolume);
  }, [playbackVolume]);

  const toggleScreenLocalMute = useCallback((identity: string) => {
    const next = new Set(screenMutedRef.current);
    if (next.has(identity)) next.delete(identity); else next.add(identity);
    screenMutedRef.current = next;
    setLocallyMutedScreens([...next]);
    playbackRef.current.update(playbackVolume);
  }, [playbackVolume]);

  const toggleParticipantLocalMute = useCallback((identity: string) => {
    const next = new Set(locallyMutedRef.current);
    if (next.has(identity)) next.delete(identity); else next.add(identity);
    locallyMutedRef.current = next;
    setLocallyMutedParticipants([...next]);
    playbackRef.current.update(playbackVolume);
  }, [playbackVolume]);

  useEffect(() => {
    if (inputModeRef.current === preferences.voiceInputMode) return;
    inputModeRef.current = preferences.voiceInputMode;
    pttHeldRef.current = false;
    pttOperationRef.current += 1;
    setPushToTalkActive(false);
    const room = roomRef.current;
    if (!room || status !== 'connected' || !canSpeak) return;
    const open = preferences.voiceInputMode === 'voice_activity' && !userMutedRef.current && !deafenedRef.current;
    void setMicrophone(room, open).then(() => {
      if (roomRef.current !== room) return;
      setMuted(!room.localParticipant.isMicrophoneEnabled); syncParticipants(room);
    }).catch(error => onError(error instanceof Error ? error.message : 'Mikrofon modu değiştirilemedi.'));
  }, [canSpeak, onError, preferences.voiceInputMode, setMicrophone, status, syncParticipants]);

  useEffect(() => {
    if (preferences.voiceInputMode !== 'push_to_talk') return;
    const release = () => {
      if (!pttHeldRef.current) return;
      pttHeldRef.current = false;
      pttOperationRef.current += 1;
      setPushToTalkActive(false);
      const room = roomRef.current;
      if (!room) return;
      void setMicrophone(room, false).then(() => {
        setMuted(true);
        syncParticipants(room);
      }).catch(() => { /* Connection state may already be changing. */ });
    };
    const down = (event: KeyboardEvent) => {
      if (event.code !== preferences.pushToTalkKey || event.repeat || pttHeldRef.current) return;
      const room = roomRef.current;
      if (!room || status !== 'connected' || !canSpeak || deafenedRef.current || isMicrophoneTestActive()) return;
      event.preventDefault();
      pttHeldRef.current = true;
      const operation = ++pttOperationRef.current;
      setPushToTalkActive(true);
      void setMicrophone(room, true).then(async () => {
        if (!pttHeldRef.current || operation !== pttOperationRef.current) {
          try { await setMicrophone(room, false); } catch { /* The room may be disconnecting. */ }
          setMuted(true);
          syncParticipants(room);
          return;
        }
        setMuted(false);
        syncParticipants(room);
      }).catch(error => {
        if (operation !== pttOperationRef.current) return;
        pttHeldRef.current = false;
        setPushToTalkActive(false);
        setMuted(true);
        onError(error instanceof Error ? error.message : 'Bas-konuş mikrofonu açılamadı.');
      });
    };
    const up = (event: KeyboardEvent) => {
      if (event.code !== preferences.pushToTalkKey) return;
      event.preventDefault();
      release();
    };
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    window.addEventListener('blur', release);
    return () => {
      window.removeEventListener('keydown', down, true);
      window.removeEventListener('keyup', up, true);
      window.removeEventListener('blur', release);
      release();
    };
  }, [canSpeak, onError, preferences.pushToTalkKey, preferences.voiceInputMode, setMicrophone, status, syncParticipants]);

  useEffect(() => {
    if (!enabled) void leave();
  }, [enabled, leave]);

  useEffect(() => () => { void leave(); }, [leave]);

  return {
    microphoneTrack,
    status,
    channelId,
    participants,
    videoTracks,
    muted,
    deafened,
    cameraEnabled,
    screenSharing,
    canSpeak,
    inputDevices,
    outputDevices,
    cameraDevices,
    inputDeviceId,
    outputDeviceId,
    cameraDeviceId,
    inputMode: preferences.voiceInputMode,
    pushToTalkKey: preferences.pushToTalkKey,
    pushToTalkActive,
    participantVolumes,
    screenVolumes,
    locallyMutedScreens,
    microphoneTestActive,
    microphoneMutedPreference,
    locallyMutedParticipants,
    join,
    leave,
    toggleMute,
    toggleDeafen,
    toggleCamera,
    toggleScreenShare,
    availableScreens, watchingScreens, setScreenWatching, screenSettings, screenBusy, changeScreenSettings, changeScreenSource, screenViewers,
    switchInput,
    switchOutput,
    switchCamera,
    setParticipantVolume,
    setScreenVolume,
    toggleScreenLocalMute,
    toggleParticipantLocalMute,
    refreshDevices,
  };
}
