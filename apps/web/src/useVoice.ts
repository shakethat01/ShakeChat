import { useCallback, useEffect, useRef, useState } from 'react';
import { LocalAudioTrack, LocalTrackPublication, Participant, RemoteTrackPublication, Room, RoomEvent, Track, TrackPublication, VideoQuality } from 'livekit-client';
import { api } from './api';
import { AppPreferences, DEFAULT_PREFERENCES, cameraCaptureFor, pushToTalkKeyLabel, screenCaptureFor, screenPublishFor, screenQualityLabel } from './preferences';
import { NoiseGateProcessor } from './noiseGate';
import { loadVoiceDevices, saveVoiceDevices } from './voiceDevicePreferences';

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
  const devicesRef = useRef(loadVoiceDevices());
  const userMutedRef = useRef(loadGlobalMuted());
  const inputModeRef = useRef(preferences.voiceInputMode);
  const [microphoneTrack, setMicrophoneTrack] = useState<MediaStreamTrack | null>(null);
  const roomRef = useRef<Room | null>(null);
  const channelRef = useRef('');
  const operationRef = useRef(0);
  const deafenedRef = useRef(false);
  const audioElements = useRef(new Set<HTMLMediaElement>());
  const audioElementsByParticipant = useRef(new Map<string, Set<HTMLMediaElement>>());
  const locallyMutedRef = useRef(new Set<string>());
  const pttHeldRef = useRef(false);
  const pttOperationRef = useRef(0);
  const noiseGateProcessorRef = useRef<NoiseGateProcessor | null>(null);
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
  const [inputDeviceId, setInputDeviceId] = useState(devicesRef.current.audioinput);
  const [outputDeviceId, setOutputDeviceId] = useState(devicesRef.current.audiooutput);
  const [cameraDeviceId, setCameraDeviceId] = useState('');
  const [participantVolumes, setParticipantVolumes] = useState<Record<string, number>>(() => participantVolumesRef.current);
  const [locallyMutedParticipants, setLocallyMutedParticipants] = useState<string[]>([]);
  const [pushToTalkActive, setPushToTalkActive] = useState(false);

  const microphoneCaptureOptions = useCallback((deviceId?: string) => ({
    sampleRate: 48_000,
    channelCount: 2,
    echoCancellation: preferences.echoCancellation,
    noiseSuppression: preferences.noiseSuppression,
    autoGainControl: preferences.autoGainControl,
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
  }), [preferences.autoGainControl, preferences.echoCancellation, preferences.noiseSuppression]);

  const applyMicrophoneTuning = useCallback(async (room: Room, publication?: LocalTrackPublication) => {
    const activePublication = publication ?? room.localParticipant.getTrackPublication(Track.Source.Microphone) as LocalTrackPublication | undefined;
    const track = activePublication?.track;
    if (!(track instanceof LocalAudioTrack)) return;
    await track.applyConstraints({
      echoCancellation: preferences.echoCancellation,
      noiseSuppression: preferences.noiseSuppression,
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
      noiseSuppression: preferences.noiseSuppression,
      autoGainControl: preferences.autoGainControl,
    });
    console.info('[voice] applied noise gate settings', { enabled: preferences.noiseGateEnabled, thresholdDb: preferences.noiseGateThreshold });
    console.info('[voice] applied audio bitrate', { maxBitrate: 192_000, priority: 'high', codec: 'opus-preferred-by-webrtc' });
  }, [preferences.autoGainControl, preferences.echoCancellation, preferences.noiseGateEnabled, preferences.noiseGateThreshold, preferences.noiseSuppression]);

  const setMicrophone = useCallback(async (room: Room, enabled: boolean, deviceId?: string) => {
    if (!enabled) {
      await room.localParticipant.setMicrophoneEnabled(false);
      return;
    }
    const publication = await room.localParticipant.setMicrophoneEnabled(true, microphoneCaptureOptions(deviceId || devicesRef.current.audioinput || undefined), MICROPHONE_PUBLISH_OPTIONS);
    if (publication) await applyMicrophoneTuning(room, publication);
  }, [applyMicrophoneTuning, microphoneCaptureOptions]);

  const syncParticipants = useCallback((room: Room) => {
    if (roomRef.current !== room) return;
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
    const mic = local.getTrackPublication(Track.Source.Microphone)?.audioTrack;
    if (mic) setMicrophoneTrack(mic.mediaStreamTrack);
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
      devicesRef.current = { audioinput: input, audiooutput: output };
      saveVoiceDevices(devicesRef.current);
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

      await room.connect(credentials.url, credentials.token);
      if (operation !== operationRef.current || roomRef.current !== room) { await room.disconnect(true); return; }
      setChannelId(nextChannelId);
      setCanSpeak(credentials.canSpeak);
      if (credentials.canSpeak) {
        const openMic = inputModeRef.current === 'voice_activity' && !userMutedRef.current && !deafenedRef.current;
        await setMicrophone(room, openMic, input || undefined);
        setMuted(!openMic);
      } else {
        setMuted(true);
      }
      if (operation !== operationRef.current || roomRef.current !== room) return;
      setStatus('connected');
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
  }, [enabled, inputDeviceId, leave, onError, preferences.autoGainControl, preferences.echoCancellation, preferences.noiseSuppression, preferences.voiceInputMode, refreshDevices, removeAudioElements, setMicrophone, status, syncParticipants]);

  const toggleMute = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    if (!canSpeak) { onError('Bu ses kanalında konuşma yetkin yok.'); return; }
    if (preferences.voiceInputMode === 'push_to_talk') { onError(`Bas-konuş etkin. ${pushToTalkKeyLabel(preferences.pushToTalkKey)} tuşunu basılı tut.`); return; }
    try {
      const enable = muted;
      if (enable && deafenedRef.current) { onError('Önce sağırlaştırmayı kapat.'); return; }
      await setMicrophone(room, enable, inputDeviceId || undefined);
      userMutedRef.current = !enable;
      saveGlobalMuted(!enable);
      setMuted(!enable);
      syncParticipants(room);
    } catch (error) { onError(error instanceof Error ? error.message : 'Mikrofon durumu değiştirilemedi.'); }
  }, [canSpeak, inputDeviceId, muted, onError, preferences.pushToTalkKey, preferences.voiceInputMode, setMicrophone, syncParticipants]);

  const toggleDeafen = useCallback(async () => {
    const next = !deafenedRef.current;
    deafenedRef.current = next;
    setDeafened(next);
    for (const [identity, elements] of audioElementsByParticipant.current) {
      for (const element of elements) element.muted = next || locallyMutedRef.current.has(identity);
    }
    const room = roomRef.current;
    if (next && room?.localParticipant.isMicrophoneEnabled) {
      try { await setMicrophone(room, false); setMuted(true); syncParticipants(room); } catch { /* Deafen still applies to playback. */ }
    }
    if (!next) {
      if (room && canSpeak && inputModeRef.current === 'voice_activity' && !userMutedRef.current) {
        try { await setMicrophone(room, true); setMuted(false); syncParticipants(room); } catch { /* User can retry unmuting. */ }
      }
      try { await room?.startAudio(); } catch { /* Browser may still require another interaction. */ }
    }
  }, [canSpeak, setMicrophone, syncParticipants]);

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
    if (!room) return;
    const publication = room.localParticipant.getTrackPublication(Track.Source.Microphone) as LocalTrackPublication | undefined;
    if (!publication?.track) return;
    void applyMicrophoneTuning(room, publication).catch(() => { /* Runtime tuning is best effort. */ });
  }, [applyMicrophoneTuning]);

  const switchInput = useCallback(async (deviceId: string) => {
    if (!deviceId) return;
    const room = roomRef.current;
    try {
      if (room) {
        const switched = await room.switchActiveDevice('audioinput', deviceId);
        if (!switched) throw new Error('Mikrofon değiştirilemedi.');
        const publication = room.localParticipant.getTrackPublication(Track.Source.Microphone) as LocalTrackPublication | undefined;
        if (publication?.track) await applyMicrophoneTuning(room, publication);
      }
      devicesRef.current = { ...devicesRef.current, audioinput: deviceId };
      saveVoiceDevices(devicesRef.current);
      setInputDeviceId(deviceId);
      if (room) syncParticipants(room);
    } catch (error) { onError(error instanceof Error ? error.message : 'Mikrofon değiştirilemedi.'); }
  }, [applyMicrophoneTuning, onError, syncParticipants]);

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
      setMuted(!open); syncParticipants(room);
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
      void setMicrophone(room, true).then(async () => {
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
