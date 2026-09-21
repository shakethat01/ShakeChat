import { useCallback, useEffect, useRef, useState } from 'react';
import { Participant, RemoteTrackPublication, Room, RoomEvent, Track, TrackPublication, VideoQuality } from 'livekit-client';
import { api } from './api';
import { AppPreferences, DEFAULT_PREFERENCES, cameraCaptureFor, pushToTalkKeyLabel, screenCaptureFor, screenPublishFor } from './preferences';

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

const VOICE_VOLUME_STORAGE_KEY = 'shakechat.voice-user-volumes.v14';

export function clampVoiceVolume(value: number) {
  if (!Number.isFinite(value)) return 100;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function loadVoiceVolumes(): Record<string, number> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(VOICE_VOLUME_STORAGE_KEY) || '{}') as Record<string, unknown>;
    return Object.fromEntries(Object.entries(parsed).filter(([, value]) => typeof value === 'number').map(([identity, value]) => [identity, clampVoiceVolume(value as number)]));
  } catch { return {}; }
}

function persistVoiceVolumes(volumes: Record<string, number>) {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(VOICE_VOLUME_STORAGE_KEY, JSON.stringify(volumes)); } catch { /* Storage can be unavailable in private mode. */ }
}

export function useVoice(enabled: boolean, onError: (message: string) => void, preferences: AppPreferences = DEFAULT_PREFERENCES) {
  const roomRef = useRef<Room | null>(null);
  const channelRef = useRef('');
  const operationRef = useRef(0);
  const deafenedRef = useRef(false);
  const audioElements = useRef(new Set<HTMLMediaElement>());
  const audioElementsByParticipant = useRef(new Map<string, Set<HTMLMediaElement>>());
  const locallyMutedRef = useRef(new Set<string>());
  const pttHeldRef = useRef(false);
  const pttOperationRef = useRef(0);
  const participantVolumesRef = useRef<Record<string, number>>(loadVoiceVolumes());
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
  const [inputDeviceId, setInputDeviceId] = useState('');
  const [outputDeviceId, setOutputDeviceId] = useState('');
  const [cameraDeviceId, setCameraDeviceId] = useState('');
  const [participantVolumes, setParticipantVolumes] = useState<Record<string, number>>(() => participantVolumesRef.current);
  const [locallyMutedParticipants, setLocallyMutedParticipants] = useState<string[]>([]);
  const [pushToTalkActive, setPushToTalkActive] = useState(false);

  const syncParticipants = useCallback((room: Room) => {
    const all: Participant[] = [room.localParticipant, ...room.remoteParticipants.values()];
    setParticipants(all.map(participant => ({
      identity: participant.identity,
      name: participant.name || participant.identity,
      local: participant.isLocal,
      speaking: participant.isSpeaking,
      muted: participant.getTrackPublication(Track.Source.Microphone)?.isMuted ?? !participant.isMicrophoneEnabled,
      camera: publicationIsActive(participant.getTrackPublication(Track.Source.Camera)),
      screen: publicationIsActive(participant.getTrackPublication(Track.Source.ScreenShare)),
    })));

    const nextVideoTracks: VoiceVideoTrack[] = [];
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
      if (publicationIsActive(screen)) {
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

    const local = room.localParticipant;
    setCameraEnabled(publicationIsActive(local.getTrackPublication(Track.Source.Camera)));
    setScreenSharing(publicationIsActive(local.getTrackPublication(Track.Source.ScreenShare)));
  }, []);

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
    for (const element of audioElements.current) element.remove();
    audioElements.current.clear();
    audioElementsByParticipant.current.clear();
  }, []);

  const leave = useCallback(async () => {
    operationRef.current += 1;
    const room = roomRef.current;
    roomRef.current = null;
    channelRef.current = '';
    setChannelId('');
    setStatus('disconnected');
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
      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        audioCaptureDefaults: {
          echoCancellation: preferences.echoCancellation,
          noiseSuppression: preferences.noiseSuppression,
          autoGainControl: preferences.autoGainControl,
        },
      });
      roomRef.current = room;
      channelRef.current = nextChannelId;

      const sync = () => syncParticipants(room);
      room.on(RoomEvent.ParticipantConnected, sync);
      room.on(RoomEvent.ParticipantDisconnected, sync);
      room.on(RoomEvent.ActiveSpeakersChanged, sync);
      room.on(RoomEvent.TrackMuted, sync);
      room.on(RoomEvent.TrackUnmuted, sync);
      room.on(RoomEvent.TrackPublished, sync);
      room.on(RoomEvent.TrackUnpublished, sync);
      room.on(RoomEvent.LocalTrackPublished, sync);
      room.on(RoomEvent.LocalTrackUnpublished, sync);
      room.on(RoomEvent.ParticipantPermissionsChanged, (_previous, participant) => {
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
      room.on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
        if (track.kind === Track.Kind.Audio) {
          const element = track.attach();
          const identity = participant.identity;
          element.autoplay = true;
          element.volume = clampVoiceVolume(participantVolumesRef.current[identity] ?? 100) / 100;
          element.muted = deafenedRef.current || locallyMutedRef.current.has(identity);
          element.style.display = 'none';
          audioElements.current.add(element);
          const participantElements = audioElementsByParticipant.current.get(identity) || new Set<HTMLMediaElement>();
          participantElements.add(element);
          audioElementsByParticipant.current.set(identity, participantElements);
          document.body.appendChild(element);
        }
        sync();
      });
      room.on(RoomEvent.TrackUnsubscribed, track => {
        if (track.kind === Track.Kind.Audio) {
          for (const element of track.detach()) {
            audioElements.current.delete(element);
            for (const [identity, elements] of audioElementsByParticipant.current) {
              elements.delete(element);
              if (elements.size === 0) audioElementsByParticipant.current.delete(identity);
            }
            element.remove();
          }
        }
        sync();
      });
      room.on(RoomEvent.Reconnecting, () => setStatus('reconnecting'));
      room.on(RoomEvent.Reconnected, () => { setStatus('connected'); sync(); });
      room.on(RoomEvent.Disconnected, () => {
        if (roomRef.current !== room) return;
        roomRef.current = null;
        channelRef.current = '';
        setChannelId('');
        setStatus('disconnected');
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
      });
      room.on(RoomEvent.MediaDevicesChanged, () => { void refreshDevices(false); });

      await room.connect(credentials.url, credentials.token);
      if (operation !== operationRef.current || roomRef.current !== room) { await room.disconnect(true); return; }
      setChannelId(nextChannelId);
      setCanSpeak(credentials.canSpeak);
      setStatus('connected');
      if (credentials.canSpeak) {
        const openMic = preferences.voiceInputMode === 'voice_activity';
        await room.localParticipant.setMicrophoneEnabled(openMic);
        setMuted(!openMic);
      } else {
        setMuted(true);
      }
      try { await room.startAudio(); } catch { /* User can retry through a control click. */ }
      await refreshDevices(true);
      sync();
    } catch (error) {
      const room = roomRef.current;
      roomRef.current = null;
      channelRef.current = '';
      setChannelId('');
      setStatus('disconnected');
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
  }, [enabled, leave, onError, preferences.autoGainControl, preferences.echoCancellation, preferences.noiseSuppression, preferences.voiceInputMode, refreshDevices, removeAudioElements, status, syncParticipants]);

  const toggleMute = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    if (!canSpeak) { onError('Bu ses kanalında konuşma yetkin yok.'); return; }
    if (preferences.voiceInputMode === 'push_to_talk') { onError(`Bas-konuş etkin. ${pushToTalkKeyLabel(preferences.pushToTalkKey)} tuşunu basılı tut.`); return; }
    try {
      const enable = muted;
      await room.localParticipant.setMicrophoneEnabled(enable);
      setMuted(!enable);
      syncParticipants(room);
    } catch (error) { onError(error instanceof Error ? error.message : 'Mikrofon durumu değiştirilemedi.'); }
  }, [canSpeak, muted, onError, preferences.pushToTalkKey, preferences.voiceInputMode, syncParticipants]);

  const toggleDeafen = useCallback(async () => {
    const next = !deafenedRef.current;
    deafenedRef.current = next;
    setDeafened(next);
    for (const [identity, elements] of audioElementsByParticipant.current) {
      for (const element of elements) element.muted = next || locallyMutedRef.current.has(identity);
    }
    const room = roomRef.current;
    if (next && room?.localParticipant.isMicrophoneEnabled) {
      try { await room.localParticipant.setMicrophoneEnabled(false); setMuted(true); syncParticipants(room); } catch { /* Deafen still applies to playback. */ }
    }
    if (!next) {
      try { await room?.startAudio(); } catch { /* Browser may still require another interaction. */ }
    }
  }, [syncParticipants]);

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
    try {
      const enable = !screenSharing;
      const resolution = enable ? screenCaptureFor(preferences.screenQuality) : undefined;
      const publishOptions = enable ? screenPublishFor(preferences.screenQuality) : undefined;
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
      }
      setScreenSharing(enable);
      syncParticipants(room);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Ekran paylaşımı başlatılamadı.';
      if (!/cancel|denied|permission/i.test(message)) onError(message);
      syncParticipants(room);
    }
  }, [canSpeak, onError, preferences.screenQuality, screenSharing, syncParticipants]);

  useEffect(() => {
    const room = roomRef.current;
    const track = room?.localParticipant.getTrackPublication(Track.Source.Microphone)?.track;
    if (!track || !("applyConstraints" in track)) return;
    const apply = (track as unknown as { applyConstraints?: (constraints: { echoCancellation?: boolean; noiseSuppression?: boolean; autoGainControl?: boolean }) => Promise<void> }).applyConstraints;
    if (!apply) return;
    void apply.call(track, {
      echoCancellation: preferences.echoCancellation,
      noiseSuppression: preferences.noiseSuppression,
      autoGainControl: preferences.autoGainControl,
    }).catch(() => { /* Browser may not support changing every constraint while live. */ });
  }, [preferences.autoGainControl, preferences.echoCancellation, preferences.noiseSuppression]);

  const switchInput = useCallback(async (deviceId: string) => {
    setInputDeviceId(deviceId);
    const room = roomRef.current;
    if (!room || !deviceId) return;
    try { await room.switchActiveDevice('audioinput', deviceId); }
    catch (error) { onError(error instanceof Error ? error.message : 'Mikrofon değiştirilemedi.'); }
  }, [onError]);

  const switchOutput = useCallback(async (deviceId: string) => {
    setOutputDeviceId(deviceId);
    const room = roomRef.current;
    if (!room || !deviceId) return;
    try { await room.switchActiveDevice('audiooutput', deviceId); }
    catch { onError('Bu tarayıcı hoparlör seçimini desteklemiyor olabilir.'); }
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
    setParticipantVolumes(previous => {
      const next = { ...previous, [identity]: nextValue };
      participantVolumesRef.current = next;
      persistVoiceVolumes(next);
      return next;
    });
    for (const element of audioElementsByParticipant.current.get(identity) || []) element.volume = nextValue / 100;
  }, []);

  const toggleParticipantLocalMute = useCallback((identity: string) => {
    const next = new Set(locallyMutedRef.current);
    if (next.has(identity)) next.delete(identity); else next.add(identity);
    locallyMutedRef.current = next;
    setLocallyMutedParticipants([...next]);
    for (const element of audioElementsByParticipant.current.get(identity) || []) element.muted = deafenedRef.current || next.has(identity);
  }, []);

  useEffect(() => {
    if (preferences.voiceInputMode !== 'push_to_talk') return;
    const room = roomRef.current;
    if (room?.localParticipant.isMicrophoneEnabled) {
      void room.localParticipant.setMicrophoneEnabled(false).then(() => {
        setMuted(true);
        syncParticipants(room);
      }).catch(() => { /* A reconnect may own the microphone transition. */ });
    }
    pttHeldRef.current = false;
    pttOperationRef.current += 1;
    setPushToTalkActive(false);
  }, [preferences.voiceInputMode, syncParticipants]);

  useEffect(() => {
    if (preferences.voiceInputMode !== 'voice_activity') return;
    const room = roomRef.current;
    if (!room || status !== 'connected' || !canSpeak || deafenedRef.current || room.localParticipant.isMicrophoneEnabled) return;
    void room.localParticipant.setMicrophoneEnabled(true).then(() => {
      setMuted(false);
      syncParticipants(room);
    }).catch(() => { /* User can retry with the microphone control. */ });
  }, [canSpeak, preferences.voiceInputMode, status, syncParticipants]);

  useEffect(() => {
    if (preferences.voiceInputMode !== 'push_to_talk') return;
    const release = () => {
      if (!pttHeldRef.current) return;
      pttHeldRef.current = false;
      pttOperationRef.current += 1;
      setPushToTalkActive(false);
      const room = roomRef.current;
      if (!room) return;
      void room.localParticipant.setMicrophoneEnabled(false).then(() => {
        setMuted(true);
        syncParticipants(room);
      }).catch(() => { /* Connection state may already be changing. */ });
    };
    const down = (event: KeyboardEvent) => {
      if (event.code !== preferences.pushToTalkKey || event.repeat || pttHeldRef.current) return;
      const room = roomRef.current;
      if (!room || status !== 'connected' || !canSpeak || deafenedRef.current) return;
      event.preventDefault();
      pttHeldRef.current = true;
      const operation = ++pttOperationRef.current;
      setPushToTalkActive(true);
      void room.localParticipant.setMicrophoneEnabled(true).then(async () => {
        if (!pttHeldRef.current || operation !== pttOperationRef.current) {
          try { await room.localParticipant.setMicrophoneEnabled(false); } catch { /* The room may be disconnecting. */ }
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
  }, [canSpeak, onError, preferences.pushToTalkKey, preferences.voiceInputMode, status, syncParticipants]);

  useEffect(() => {
    if (!enabled) void leave();
  }, [enabled, leave]);

  useEffect(() => () => { void leave(); }, [leave]);

  return {
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
    locallyMutedParticipants,
    join,
    leave,
    toggleMute,
    toggleDeafen,
    toggleCamera,
    toggleScreenShare,
    switchInput,
    switchOutput,
    switchCamera,
    setParticipantVolume,
    toggleParticipantLocalMute,
    refreshDevices,
  };
}
