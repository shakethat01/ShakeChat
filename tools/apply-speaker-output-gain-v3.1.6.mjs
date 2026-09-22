import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const voiceFile = path.join(root, 'apps/web/src/useVoice.ts');
const prefsFile = path.join(root, 'apps/web/src/preferences.ts');
const settingsFile = path.join(root, 'apps/web/src/AppSettings.tsx');
for (const file of [voiceFile, prefsFile, settingsFile]) {
  if (!fs.existsSync(file)) throw new Error('Dosya bulunamadi: ' + file);
}

function replaceOnce(text, from, to, label) {
  const count = text.split(from).length - 1;
  if (count !== 1) throw new Error(label + ': hedef sayisi ' + count + ' (1 bekleniyordu)');
  return text.replace(from, to);
}

let prefs = fs.readFileSync(prefsFile, 'utf8');
if (!prefs.includes('microphoneGainPercent: number;')) throw new Error('Microphone Gain v3.1.5 aktif degil.');
if (!prefs.includes('speakerGainPercent: number;')) {
  prefs = replaceOnce(prefs, '  microphoneGainPercent: number;\n', '  microphoneGainPercent: number;\n  speakerGainPercent: number;\n', 'speaker type');
  prefs = replaceOnce(prefs, '  microphoneGainPercent: 100,\n', '  microphoneGainPercent: 100,\n  speakerGainPercent: 100,\n', 'speaker default');
  prefs = replaceOnce(
    prefs,
    'export function clampMicrophoneGainPercent(value: number) {',
    "export function clampSpeakerGainPercent(value: number) {\n  if (!Number.isFinite(value)) return DEFAULT_PREFERENCES.speakerGainPercent;\n  return Math.max(0, Math.min(200, Math.round(value)));\n}\n\nexport function clampMicrophoneGainPercent(value: number) {",
    'speaker clamp',
  );
  const micLoad = "      microphoneGainPercent: clampMicrophoneGainPercent(typeof parsed.microphoneGainPercent === 'number' ? parsed.microphoneGainPercent : DEFAULT_PREFERENCES.microphoneGainPercent),\n";
  prefs = replaceOnce(prefs, micLoad, micLoad + "      speakerGainPercent: clampSpeakerGainPercent(typeof parsed.speakerGainPercent === 'number' ? parsed.speakerGainPercent : DEFAULT_PREFERENCES.speakerGainPercent),\n", 'speaker load');
}
fs.writeFileSync(prefsFile, prefs);

let settings = fs.readFileSync(settingsFile, 'utf8');
if (!settings.includes('Hoparlör çıkış seviyesi')) {
  const micEnd = "<small><b>{draft.microphoneGainPercent}%</b> · 100% doğal seviye · 200% yaklaşık +6 dB. 100% üstünde tepe limiter'ı kırpılmayı önler.</small></label></div>";
  const speakerUi = "\n            <div className=\"media-quality-grid\"><label>HOPARLÖR ÇIKIŞ SEVİYESİ<input aria-label=\"Hoparlör çıkış seviyesi\" type=\"range\" min=\"0\" max=\"200\" step=\"5\" value={draft.speakerGainPercent} onChange={e=>setDraft(p=>({...p,speakerGainPercent:Number(e.target.value)}))}/><small><b>{draft.speakerGainPercent}%</b> · 100% doğal seviye · 200% yaklaşık +6 dB. Yalnızca senin duyduğun gelen sesi etkiler; mikrofon filtresine dokunmaz.</small></label></div>";
  settings = replaceOnce(settings, micEnd, micEnd + speakerUi, 'speaker settings UI');
}
fs.writeFileSync(settingsFile, settings);

let voice = fs.readFileSync(voiceFile, 'utf8');
if (!voice.includes('shakechat.voice-global-muted.v1')) throw new Error('Audio Session Stability v3.1.4 aktif degil.');
if (!voice.includes('microphoneGainPercent')) throw new Error('Microphone Gain v3.1.5 useVoice tarafinda yok.');
if (!voice.includes('speakerGainPercentRef')) {
  voice = replaceOnce(
    voice,
    '  const participantVolumesRef = useRef<Record<string, number>>(loadVoiceVolumes());\n',
    '  const participantVolumesRef = useRef<Record<string, number>>(loadVoiceVolumes());\n  const speakerGainPercentRef = useRef(Math.max(0, Math.min(200, Math.round(preferences.speakerGainPercent))));\n',
    'speaker gain ref',
  );

  voice = replaceOnce(
    voice,
    '      const room = new Room({\n        adaptiveStream: true,\n',
    '      const room = new Room({\n        adaptiveStream: true,\n        webAudioMix: true,\n',
    'LiveKit webAudioMix',
  );

  const helperNeedle = '  const setParticipantVolume = useCallback((identity: string, value: number) => {';
  const helper = `  const applyParticipantPlayback = useCallback((identity: string) => {
    const participant = roomRef.current?.remoteParticipants.get(identity);
    if (!participant) return;
    const mutedForMe = deafenedRef.current || locallyMutedRef.current.has(identity);
    const userGain = clampVoiceVolume(participantVolumesRef.current[identity] ?? 100) / 100;
    const masterGain = speakerGainPercentRef.current / 100;
    const volume = mutedForMe ? 0 : Math.max(0, Math.min(2, userGain * masterGain));
    participant.setVolume(volume, Track.Source.Microphone);
    participant.setVolume(volume, Track.Source.ScreenShareAudio);
  }, []);

  useEffect(() => {
    speakerGainPercentRef.current = Math.max(0, Math.min(200, Math.round(preferences.speakerGainPercent)));
    const room = roomRef.current;
    if (!room) return;
    for (const identity of room.remoteParticipants.keys()) applyParticipantPlayback(identity);
  }, [applyParticipantPlayback, preferences.speakerGainPercent]);

`;
  voice = replaceOnce(voice, helperNeedle, helper + helperNeedle, 'playback gain helper');

  const subscribedOld = `          element.autoplay = true;
          element.volume = clampVoiceVolume(participantVolumesRef.current[identity] ?? 100) / 100;
          element.muted = deafenedRef.current || locallyMutedRef.current.has(identity);
          element.style.display = 'none';`;
  const subscribedNew = `          element.autoplay = true;
          // webAudioMix routes the remote track through LiveKit's GainNode.
          // Keep the HTML element silent to avoid duplicate playback.
          element.volume = 0;
          element.muted = true;
          element.style.display = 'none';`;
  voice = replaceOnce(voice, subscribedOld, subscribedNew, 'subscribed webAudio element');
  voice = replaceOnce(voice, '          document.body.appendChild(element);\n        }\n        sync();', '          document.body.appendChild(element);\n          applyParticipantPlayback(identity);\n        }\n        sync();', 'subscribed apply gain');

  voice = replaceOnce(
    voice,
    '    for (const [identity, elements] of audioElementsByParticipant.current) {\n      for (const element of elements) element.muted = next || locallyMutedRef.current.has(identity);\n    }\n',
    '    for (const identity of audioElementsByParticipant.current.keys()) applyParticipantPlayback(identity);\n',
    'deafen playback gain',
  );

  const volumeOld = `  const setParticipantVolume = useCallback((identity: string, value: number) => {
    const nextValue = clampVoiceVolume(value);
    setParticipantVolumes(previous => {
      const next = { ...previous, [identity]: nextValue };
      participantVolumesRef.current = next;
      persistVoiceVolumes(next);
      return next;
    });
    for (const element of audioElementsByParticipant.current.get(identity) || []) element.volume = nextValue / 100;
  }, []);`;
  const volumeNew = `  const setParticipantVolume = useCallback((identity: string, value: number) => {
    const nextValue = clampVoiceVolume(value);
    const next = { ...participantVolumesRef.current, [identity]: nextValue };
    participantVolumesRef.current = next;
    persistVoiceVolumes(next);
    setParticipantVolumes(next);
    applyParticipantPlayback(identity);
  }, [applyParticipantPlayback]);`;
  voice = replaceOnce(voice, volumeOld, volumeNew, 'participant volume callback');

  const localMuteOld = `  const toggleParticipantLocalMute = useCallback((identity: string) => {
    const next = new Set(locallyMutedRef.current);
    if (next.has(identity)) next.delete(identity); else next.add(identity);
    locallyMutedRef.current = next;
    setLocallyMutedParticipants([...next]);
    for (const element of audioElementsByParticipant.current.get(identity) || []) element.muted = deafenedRef.current || next.has(identity);
  }, []);`;
  const localMuteNew = `  const toggleParticipantLocalMute = useCallback((identity: string) => {
    const next = new Set(locallyMutedRef.current);
    if (next.has(identity)) next.delete(identity); else next.add(identity);
    locallyMutedRef.current = next;
    setLocallyMutedParticipants([...next]);
    applyParticipantPlayback(identity);
  }, [applyParticipantPlayback]);`;
  voice = replaceOnce(voice, localMuteOld, localMuteNew, 'participant local mute callback');

  voice = voice.replace('  }, [canSpeak, inputDeviceId, preferences.voiceInputMode, setMicrophone, syncParticipants]);\n\n  const toggleCamera', '  }, [applyParticipantPlayback, canSpeak, inputDeviceId, preferences.voiceInputMode, setMicrophone, syncParticipants]);\n\n  const toggleCamera');
  voice = voice.replace('  }, [enabled, inputDeviceId, leave, onError,', '  }, [applyParticipantPlayback, enabled, inputDeviceId, leave, onError,');
}
fs.writeFileSync(voiceFile, voice);

console.log('\n=== ShakeChat Speaker Output Gain v3.1.6 uygulandi ===');
console.log('- Hoparlor cikisi: 0-200%, varsayilan 100%');
console.log('- LiveKit webAudioMix acik: 100% ustu GainNode ile gercek boost');
console.log('- Kullanici bazli ses 0-100% korunur; master gain onun uzerine uygulanir');
console.log('- Deafen ve yerel mute master gain ile uyumlu');
console.log('- Mikrofon filtresi/GTCRN zincirine dokunulmaz');
