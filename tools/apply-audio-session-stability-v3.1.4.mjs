import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const voiceFile = path.join(root, 'apps/web/src/useVoice.ts');
const appFile = path.join(root, 'apps/web/src/App.tsx');
const noiseFile = path.join(root, 'apps/web/src/noiseGate.ts');
for (const file of [voiceFile, appFile, noiseFile]) {
  if (!fs.existsSync(file)) throw new Error('Dosya bulunamadi: ' + file);
}

function replaceOnce(text, from, to, label) {
  const count = text.split(from).length - 1;
  if (count !== 1) throw new Error(label + ': hedef sayisi ' + count + ' (1 bekleniyordu)');
  return text.replace(from, to);
}

function replaceAllCount(text, from, to, expected, label) {
  const count = text.split(from).length - 1;
  if (count !== expected) throw new Error(label + ': hedef sayisi ' + count + ' (' + expected + ' bekleniyordu)');
  return text.split(from).join(to);
}

function replaceBlock(text, startMarker, endMarker, replacement, label) {
  const start = text.indexOf(startMarker);
  if (start < 0) throw new Error(label + ': baslangic bulunamadi');
  const end = text.indexOf(endMarker, start);
  if (end < 0) throw new Error(label + ': bitis bulunamadi');
  if (text.indexOf(startMarker, start + startMarker.length) >= 0) throw new Error(label + ': baslangic birden fazla');
  return text.slice(0, start) + replacement + text.slice(end);
}

const noise = fs.readFileSync(noiseFile, 'utf8');
if (!noise.includes("readonly name = 'shakechat-stable-ai-gate-v3.1'")) throw new Error('Audio Stability v3.1 aktif degil.');
if (!noise.includes('v3.1.3 diagnostic: AI-only, custom gate bypassed')) throw new Error('AI-only v3.1.3 diagnostic aktif degil. Gate simdilik kapali kalmali.');

let voice = fs.readFileSync(voiceFile, 'utf8');
if (!voice.includes('processingSignature')) throw new Error('v3.1 useVoice bulunamadi.');
if (!voice.includes('const localSpeakingRef = useRef(false);')) throw new Error('Local Speaking Meter v3.1.1 bulunamadi.');
if (voice.includes('shakechat.voice-global-muted.v1')) {
  console.log('Audio Session Stability v3.1.4 zaten uygulanmis.');
  process.exit(0);
}

voice = replaceOnce(
  voice,
  "const VOICE_VOLUME_STORAGE_KEY = 'shakechat.voice-user-volumes.v14';\n",
  "const VOICE_VOLUME_STORAGE_KEY = 'shakechat.voice-user-volumes.v14';\nconst VOICE_MUTE_STORAGE_KEY = 'shakechat.voice-global-muted.v1';\n",
  'mute storage key',
);

voice = replaceOnce(
  voice,
  "function persistVoiceVolumes(volumes: Record<string, number>) {\n  if (typeof localStorage === 'undefined') return;\n  try { localStorage.setItem(VOICE_VOLUME_STORAGE_KEY, JSON.stringify(volumes)); } catch { /* Storage can be unavailable in private mode. */ }\n}\n",
  "function persistVoiceVolumes(volumes: Record<string, number>) {\n  if (typeof localStorage === 'undefined') return;\n  try { localStorage.setItem(VOICE_VOLUME_STORAGE_KEY, JSON.stringify(volumes)); } catch { /* Storage can be unavailable in private mode. */ }\n}\n\nfunction loadGlobalVoiceMuted() {\n  if (typeof localStorage === 'undefined') return false;\n  try { return localStorage.getItem(VOICE_MUTE_STORAGE_KEY) === '1'; } catch { return false; }\n}\n\nfunction persistGlobalVoiceMuted(value: boolean) {\n  if (typeof localStorage === 'undefined') return;\n  try { localStorage.setItem(VOICE_MUTE_STORAGE_KEY, value ? '1' : '0'); } catch { /* Storage can be unavailable in private mode. */ }\n}\n",
  'mute storage helpers',
);

voice = replaceOnce(
  voice,
  '  const pttOperationRef = useRef(0);\n  const noiseGateProcessorRef = useRef<NoiseGateProcessor | null>(null);\n  const localSpeakingRef = useRef(false);\n',
  '  const pttOperationRef = useRef(0);\n  const globalMuteRef = useRef(loadGlobalVoiceMuted());\n  const micRepairInFlightRef = useRef(false);\n  const noiseGateProcessorRef = useRef<NoiseGateProcessor | null>(null);\n  const localSpeakingRef = useRef(false);\n',
  'voice refs',
);

voice = replaceOnce(
  voice,
  '  const [muted, setMuted] = useState(true);\n',
  '  const [muted, setMuted] = useState(() => globalMuteRef.current);\n',
  'muted initial state',
);

voice = replaceOnce(
  voice,
  '  const [pushToTalkActive, setPushToTalkActive] = useState(false);\n\n  const processingSignature = [\n',
  "  const [pushToTalkActive, setPushToTalkActive] = useState(false);\n\n  const setGlobalMuted = useCallback((next: boolean) => {\n    globalMuteRef.current = next;\n    persistGlobalVoiceMuted(next);\n    setMuted(next);\n  }, []);\n\n  const processingSignature = [\n",
  'global mute setter',
);

const disconnectState = "    setStatus('disconnected');\n    setParticipants([]);\n    setVideoTracks([]);\n    setCanSpeak(false);\n    setMuted(true);\n";
const disconnectStatePersistent = "    setStatus('disconnected');\n    setParticipants([]);\n    setVideoTracks([]);\n    setCanSpeak(false);\n    setMuted(globalMuteRef.current);\n";
voice = replaceAllCount(voice, disconnectState, disconnectStatePersistent, 3, 'disconnect mute persistence');

const joinOld = "      if (credentials.canSpeak) {\n        const openMic = preferences.voiceInputMode === 'voice_activity';\n        await setMicrophone(room, openMic, inputDeviceId || undefined);\n        setMuted(!openMic);\n      } else {\n        setMuted(true);\n      }\n";
const joinNew = "      if (credentials.canSpeak) {\n        const openMic = preferences.voiceInputMode === 'voice_activity' && !globalMuteRef.current;\n        await setMicrophone(room, openMic, inputDeviceId || undefined);\n        setMuted(preferences.voiceInputMode === 'voice_activity' ? globalMuteRef.current : true);\n      } else {\n        setMuted(globalMuteRef.current);\n      }\n";
voice = replaceOnce(voice, joinOld, joinNew, 'join global mute');

const toggleMuteNew = `  const toggleMute = useCallback(async () => {
    if (preferences.voiceInputMode === 'push_to_talk') {
      onError(\`Bas-konuş etkin. \${pushToTalkKeyLabel(preferences.pushToTalkKey)} tuşunu basılı tut.\`);
      return;
    }

    const nextMuted = !globalMuteRef.current;
    const previousMuted = globalMuteRef.current;
    setGlobalMuted(nextMuted);

    const room = roomRef.current;
    if (!room) return;
    if (!canSpeak && !nextMuted) {
      setGlobalMuted(previousMuted);
      onError('Bu ses kanalında konuşma yetkin yok.');
      return;
    }

    try {
      await setMicrophone(room, !nextMuted, inputDeviceId || undefined);
      syncParticipants(room);
    } catch (error) {
      setGlobalMuted(previousMuted);
      onError(error instanceof Error ? error.message : 'Mikrofon durumu değiştirilemedi.');
    }
  }, [canSpeak, inputDeviceId, onError, preferences.pushToTalkKey, preferences.voiceInputMode, setGlobalMuted, setMicrophone, syncParticipants]);
`;
voice = replaceBlock(voice, '  const toggleMute = useCallback(async () => {', '\n\n  const toggleDeafen = useCallback', toggleMuteNew, 'toggleMute');

const deafenNew = `  const toggleDeafen = useCallback(async () => {
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
      setMuted(globalMuteRef.current);
      try { await room?.startAudio(); } catch { /* Browser may still require another interaction. */ }
      if (room && preferences.voiceInputMode === 'voice_activity' && !globalMuteRef.current && canSpeak) {
        try { await setMicrophone(room, true, inputDeviceId || undefined); syncParticipants(room); } catch { /* Mic control can retry. */ }
      }
    }
  }, [canSpeak, inputDeviceId, preferences.voiceInputMode, setMicrophone, syncParticipants]);
`;
voice = replaceBlock(voice, '  const toggleDeafen = useCallback(async () => {', '\n\n  const toggleCamera = useCallback', deafenNew, 'toggleDeafen');

const voiceActivityOld = `  useEffect(() => {
    if (preferences.voiceInputMode !== 'voice_activity') return;
    const room = roomRef.current;
    if (!room || status !== 'connected' || !canSpeak || deafenedRef.current || room.localParticipant.isMicrophoneEnabled) return;
    void room.localParticipant.setMicrophoneEnabled(true).then(() => {
      setMuted(false);
      syncParticipants(room);
    }).catch(() => { /* User can retry with the microphone control. */ });
  }, [canSpeak, preferences.voiceInputMode, status, syncParticipants]);
`;
const voiceActivityNew = `  useEffect(() => {
    if (preferences.voiceInputMode !== 'voice_activity') return;
    const room = roomRef.current;
    if (!room || status !== 'connected' || !canSpeak) return;

    if (globalMuteRef.current || deafenedRef.current) {
      if (room.localParticipant.isMicrophoneEnabled) {
        void setMicrophone(room, false).then(() => syncParticipants(room)).catch(() => { /* Connection may be changing. */ });
      }
      return;
    }

    if (!room.localParticipant.isMicrophoneEnabled) {
      void setMicrophone(room, true, inputDeviceId || undefined).then(() => {
        setMuted(false);
        syncParticipants(room);
      }).catch(() => { /* User can retry with the microphone control. */ });
    }
  }, [canSpeak, deafened, inputDeviceId, preferences.voiceInputMode, setMicrophone, status, syncParticipants]);
`;
voice = replaceOnce(voice, voiceActivityOld, voiceActivityNew, 'voice activity restore path');

voice = replaceOnce(
  voice,
  "      void room.localParticipant.setMicrophoneEnabled(true).then(async () => {\n",
  "      void setMicrophone(room, true, inputDeviceId || undefined).then(async () => {\n",
  'ptt processor path',
);
voice = replaceOnce(
  voice,
  '  }, [canSpeak, onError, preferences.pushToTalkKey, preferences.voiceInputMode, status, syncParticipants]);\n',
  '  }, [canSpeak, inputDeviceId, onError, preferences.pushToTalkKey, preferences.voiceInputMode, setMicrophone, status, syncParticipants]);\n',
  'ptt dependencies',
);

voice = replaceOnce(
  voice,
  "      room.on(RoomEvent.Reconnected, () => { setStatus('connected'); sync(); });\n",
  "      room.on(RoomEvent.Reconnected, () => {\n        setStatus('connected');\n        sync();\n        if (preferences.voiceInputMode === 'voice_activity' && !globalMuteRef.current && !deafenedRef.current) {\n          void setMicrophone(room, true, inputDeviceId || undefined).then(() => sync()).catch(error => {\n            console.warn('[voice:v3.1.4] reconnect mic restore failed', error);\n          });\n        }\n      });\n",
  'reconnected mic restore',
);

const watchdog = `  useEffect(() => {
    const timer = window.setInterval(() => {
      const room = roomRef.current;
      if (!room || status !== 'connected' || preferences.voiceInputMode !== 'voice_activity') return;
      if (globalMuteRef.current || deafenedRef.current || micRepairInFlightRef.current) return;

      const publication = room.localParticipant.getTrackPublication(Track.Source.Microphone) as LocalTrackPublication | undefined;
      const track = publication?.track;
      const processor = noiseGateProcessorRef.current;
      const processorAttached = track instanceof LocalAudioTrack && processor && track.getProcessor() === processor;
      if (processorAttached) return;

      micRepairInFlightRef.current = true;
      console.warn('[voice:v3.1.4] microphone processor missing; repairing', {
        hasPublication: Boolean(publication),
        hasTrack: track instanceof LocalAudioTrack,
        hasProcessor: Boolean(processor),
      });

      const repair = track instanceof LocalAudioTrack
        ? applyMicrophoneTuning(room, publication)
        : setMicrophone(room, true, inputDeviceId || undefined);

      void repair.then(() => {
        syncParticipants(room);
        console.info('[voice:v3.1.4] microphone processor repaired');
      }).catch(error => {
        console.warn('[voice:v3.1.4] microphone processor repair failed', error);
      }).finally(() => {
        micRepairInFlightRef.current = false;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [applyMicrophoneTuning, inputDeviceId, preferences.voiceInputMode, setMicrophone, status, syncParticipants]);

`;
voice = replaceOnce(
  voice,
  '  useEffect(() => {\n    if (!enabled) void leave();\n  }, [enabled, leave]);\n',
  watchdog + '  useEffect(() => {\n    if (!enabled) void leave();\n  }, [enabled, leave]);\n',
  'processor watchdog',
);

fs.writeFileSync(voiceFile, voice);

let app = fs.readFileSync(appFile, 'utf8');
if (!app.includes('MicOff')) {
  app = replaceOnce(app, 'UserRound, Users, Volume2, X', 'UserRound, Users, Volume2, Mic, MicOff, X', 'App mic icon imports');
}

const profileButton = '<button className="icon-btn" title="Profili düzenle" aria-label="Profili düzenle" onClick={()=>setProfileOpen(true)}><UserRound size={18}/></button>';
const micButton = '<button className={voice.muted?"icon-btn voice-user-muted":"icon-btn"} title={voice.muted?"Mikrofonu aç":"Mikrofonu kapat"} aria-label={voice.muted?"Mikrofonu aç":"Mikrofonu kapat"} aria-pressed={voice.muted} onClick={()=>void voice.toggleMute()}>{voice.muted?<MicOff size={18}/>:<Mic size={18}/>}</button>';
if (!app.includes('voice-user-muted')) {
  app = replaceAllCount(app, profileButton, micButton + profileButton, 2, 'bottom-left mic buttons');
}
fs.writeFileSync(appFile, app);

console.log('\n=== ShakeChat Audio Session Stability v3.1.4 uygulandi ===');
console.log('- Global mute localStorage ile kullanici bazli kalici oldu');
console.log('- Oda degistirme/cikis-giris mute tercihini sifirlamaz');
console.log('- Sol alt userbar alanina global mikrofon dugmesi eklendi');
console.log('- Voice activity mic acma artik her zaman setMicrophone() uzerinden processor takar');
console.log('- Reconnect sonrasi processor/mic state tekrar dogrulanir');
console.log('- 1 sn watchdog processor detach olursa sessizce tekrar baglar');
console.log('- AI-only v3.1.3 diagnostic korunur; custom gate hala kapali');
