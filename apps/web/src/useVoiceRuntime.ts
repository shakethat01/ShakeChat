import { useCallback, useEffect, useMemo } from 'react';
import { API_ORIGIN, api, auth, type VoiceToken } from './api';
import type { AppPreferences } from './preferences';
import { useNativeScreenShare } from './useNativeScreenShare';
import { isTauriRuntime, useNativeVoice } from './useNativeVoice';
import { useVoice } from './useVoice';

const LEGACY_BROWSER_MUTE_KEY='shakechat.voice-global-muted.v1';
const NATIVE_MUTE_KEY='shakechat.native-voice-muted.v1';
let desktopMediaTokenInstalled=false;

function prepareDesktopAudioIsolation(){
  if(!isTauriRuntime()||typeof localStorage==='undefined')return;
  try{
    if(localStorage.getItem(NATIVE_MUTE_KEY)===null){
      localStorage.setItem(NATIVE_MUTE_KEY,localStorage.getItem(LEGACY_BROWSER_MUTE_KEY)==='1'?'1':'0');
    }
    // The WebView LiveKit room is video/data only. Keeping its legacy mic state
    // permanently muted prevents getUserMedia from ever opening on desktop.
    localStorage.setItem(LEGACY_BROWSER_MUTE_KEY,'1');
  }catch{/* storage can be unavailable */}
}

function installDesktopMediaToken(){
  if(desktopMediaTokenInstalled||!isTauriRuntime())return;
  desktopMediaTokenInstalled=true;
  api.voiceToken=async(channelId:string):Promise<VoiceToken>=>{
    const token=auth.token();
    if(!token)throw new Error('Oturum bulunamadı.');
    const base=API_ORIGIN?`${API_ORIGIN}/api`:'/api';
    const response=await fetch(`${base}/voice/channels/${encodeURIComponent(channelId)}/media-token`,{
      method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
    });
    if(!response.ok){
      const body=await response.json().catch(()=>({message:'Masaüstü medya bağlantısı kurulamadı.'}));
      throw new Error(Array.isArray(body?.message)?body.message.join(', '):(body?.message||'Masaüstü medya bağlantısı kurulamadı.'));
    }
    return response.json() as Promise<VoiceToken>;
  };
}

/**
 * Desktop architecture:
 * - WebView LiveKit room: camera, remote video/screen rendering and data only.
 * - Rust LiveKit sidecar: WASAPI microphone/playout and all voice processing.
 * - Rust native screen publisher: screen/window video and share audio.
 *
 * The WebView never opens an audio-input device, so Tauri/WebView2 must never
 * display a browser-style microphone permission prompt on desktop.
 */
export function useVoiceRuntime(enabled:boolean,onError:(message:string)=>void,preferences:AppPreferences){
  const desktop=isTauriRuntime();
  if(desktop){prepareDesktopAudioIsolation();installDesktopMediaToken()}

  const media=useVoice(enabled,onError,preferences);
  const native=useNativeVoice(enabled&&desktop,onError,preferences);

  // The media room must never render remote audio in WebView2. Its only job on
  // desktop is video/data. Native PlatformAudio owns speaker playout.
  useEffect(()=>{
    if(!desktop||media.status!=='connected'||media.deafened)return;
    void media.toggleDeafen().catch(error=>console.warn('[desktop:media] audio isolation failed',error));
  },[desktop,media.deafened,media.status,media.toggleDeafen]);

  const join=useCallback(async(channelId:string)=>{
    if(!desktop){await media.join(channelId);return}
    await Promise.all([media.join(channelId),native.join(channelId)]);
  },[desktop,media.join,native.join]);

  const leave=useCallback(async()=>{
    if(!desktop){await media.leave();return}
    await Promise.allSettled([media.leave(),native.leave()]);
  },[desktop,media.leave,native.leave]);

  const participants=useMemo(()=>{
    if(!desktop)return media.participants;
    const audioByOwner=new Map(native.participants.map(participant=>[participant.identity,participant]));
    const rows=media.participants
      .filter(participant=>!participant.identity.startsWith('audio:'))
      .map(participant=>{
        const audio=audioByOwner.get(participant.identity);
        return audio?{...participant,speaking:audio.speaking,muted:audio.muted}:participant;
      });
    const known=new Set(rows.map(participant=>participant.identity));
    for(const participant of native.participants)if(!known.has(participant.identity))rows.push(participant);
    return rows;
  },[desktop,media.participants,native.participants]);

  const desktopVoice=useMemo(()=>desktop?{
    ...media,
    status:native.status==='connected'&&media.status==='connected'?'connected':
      (native.status==='reconnecting'||media.status==='reconnecting'?'reconnecting':
        (native.status==='connecting'||media.status==='connecting'?'connecting':native.status)),
    channelId:native.channelId||media.channelId,
    participants,
    muted:native.muted,
    deafened:native.deafened,
    canSpeak:native.canSpeak||media.canSpeak,
    microphoneTrack:null,
    microphoneError:'',
    microphonePermissionDenied:false,
    microphoneMutedPreference:native.muted,
    inputDevices:native.inputDevices,
    outputDevices:native.outputDevices,
    inputDeviceId:native.inputDeviceId,
    outputDeviceId:native.outputDeviceId,
    inputMode:native.inputMode,
    pushToTalkKey:native.pushToTalkKey,
    pushToTalkActive:native.pushToTalkActive,
    participantVolumes:native.participantVolumes,
    locallyMutedParticipants:native.locallyMutedParticipants,
    join,leave,
    toggleMute:native.toggleMute,
    retryMicrophone:native.refreshSnapshot,
    toggleDeafen:native.toggleDeafen,
    switchInput:native.switchInput,
    switchOutput:native.switchOutput,
    setParticipantVolume:native.setParticipantVolume,
    toggleParticipantLocalMute:native.toggleParticipantLocalMute,
  }:media,[desktop,join,leave,media,native,participants]);

  return useNativeScreenShare(desktopVoice as ReturnType<typeof useVoice>,onError);
}
