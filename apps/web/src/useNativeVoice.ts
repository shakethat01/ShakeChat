import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import type { AppPreferences } from './preferences';
import { pushToTalkKeyLabel } from './preferences';
import type { VoiceParticipant, VoiceVideoTrack } from './useVoice';

type NativeDevice = { deviceId:string; label:string };
type NativeSnapshot = {
  status:'disconnected'|'connecting'|'connected'|'reconnecting';
  channelId:string;
  participants:VoiceParticipant[];
  muted:boolean;
  deafened:boolean;
  canSpeak:boolean;
  inputDevices:NativeDevice[];
  outputDevices:NativeDevice[];
  inputDeviceId:string;
  outputDeviceId:string;
  engine:string;
};

const VOICE_MUTE_STORAGE_KEY = 'shakechat.voice-global-muted.v1';

function isTauriRuntime(){return typeof window!=='undefined'&&'__TAURI_INTERNALS__' in window}
function loadGlobalMuted(){try{return localStorage.getItem(VOICE_MUTE_STORAGE_KEY)==='1'}catch{return false}}
function saveGlobalMuted(value:boolean){try{localStorage.setItem(VOICE_MUTE_STORAGE_KEY,value?'1':'0')}catch{/* storage may be unavailable */}}
function asMediaDevice(device:NativeDevice,kind:'audioinput'|'audiooutput'):MediaDeviceInfo{
  return {deviceId:device.deviceId,groupId:'',kind,label:device.label,toJSON(){return {deviceId:device.deviceId,groupId:'',kind,label:device.label}}} as MediaDeviceInfo;
}

const EMPTY_SNAPSHOT:NativeSnapshot={
  status:'disconnected',channelId:'',participants:[],muted:true,deafened:false,canSpeak:false,
  inputDevices:[],outputDevices:[],inputDeviceId:'',outputDeviceId:'',engine:'native-webrtc-apm',
};

export function useNativeVoice(enabled:boolean,onError:(message:string)=>void,preferences:AppPreferences){
  const [snapshot,setSnapshot]=useState<NativeSnapshot>(EMPTY_SNAPSHOT);
  const [participantVolumes,setParticipantVolumes]=useState<Record<string,number>>({});
  const [locallyMutedParticipants,setLocallyMutedParticipants]=useState<string[]>([]);
  const globalMutedRef=useRef(loadGlobalMuted());
  const pttHeldRef=useRef(false);
  const joinedRef=useRef(false);

  const refreshSnapshot=useCallback(async()=>{
    if(!isTauriRuntime())return;
    try{
      const next=await invoke<NativeSnapshot>('native_voice_snapshot');
      setSnapshot(next);
      setParticipantVolumes(previous=>{
        const copy={...previous};
        for(const participant of next.participants)if(!participant.local&&copy[participant.identity]===undefined)copy[participant.identity]=100;
        return copy;
      });
    }catch(error){
      console.warn('[desktop:voice] snapshot failed',error);
    }
  },[]);

  const processing=useCallback(()=>({
    // Keep the desktop controls honest: these switches configure libwebrtc APM
    // directly in Rust/PlatformAudio rather than silently forcing them on.
    echoCancellation:preferences.echoCancellation,
    noiseSuppression:preferences.noiseSuppression,
    autoGainControl:preferences.autoGainControl,
    noiseGateEnabled:preferences.noiseGateEnabled,
    noiseGateThreshold:preferences.noiseGateThreshold,
  }),[preferences.autoGainControl,preferences.echoCancellation,preferences.noiseGateEnabled,preferences.noiseGateThreshold,preferences.noiseSuppression]);

  const join=useCallback(async(channelId:string)=>{
    if(!enabled||!channelId||!isTauriRuntime())return;
    try{
      const credentials=await api.voiceToken(channelId);
      const startMuted=preferences.voiceInputMode==='push_to_talk'||globalMutedRef.current;
      await invoke('native_voice_join',{
        url:credentials.url,
        token:credentials.token,
        channelId,
        canSpeak:credentials.canSpeak,
        processing:processing(),
        startMuted,
      });
      joinedRef.current=true;
      await refreshSnapshot();
    }catch(error){
      onError(error instanceof Error?error.message:String(error));
    }
  },[enabled,onError,preferences.voiceInputMode,processing,refreshSnapshot]);

  const leave=useCallback(async()=>{
    if(!isTauriRuntime())return;
    try{await invoke('native_voice_leave')}catch(error){console.warn('[desktop:voice] leave failed',error)}
    joinedRef.current=false;
    setSnapshot(previous=>({...EMPTY_SNAPSHOT,muted:previous.muted}));
  },[]);

  const toggleMute=useCallback(async()=>{
    if(preferences.voiceInputMode==='push_to_talk'){
      onError(`Bas-konuş etkin. ${pushToTalkKeyLabel(preferences.pushToTalkKey)} tuşunu basılı tut.`);
      return;
    }
    const next=!globalMutedRef.current;
    globalMutedRef.current=next;saveGlobalMuted(next);
    try{await invoke('native_voice_set_muted',{muted:next});await refreshSnapshot()}catch(error){onError(error instanceof Error?error.message:String(error))}
  },[onError,preferences.pushToTalkKey,preferences.voiceInputMode,refreshSnapshot]);

  const toggleDeafen=useCallback(async()=>{
    const next=!snapshot.deafened;
    try{
      await invoke('native_voice_set_deafened',{deafened:next});
      if(next){await invoke('native_voice_set_muted',{muted:true})}
      else if(preferences.voiceInputMode==='voice_activity'&&!globalMutedRef.current&&snapshot.canSpeak){await invoke('native_voice_set_muted',{muted:false})}
      await refreshSnapshot();
    }catch(error){onError(error instanceof Error?error.message:String(error))}
  },[onError,preferences.voiceInputMode,refreshSnapshot,snapshot.canSpeak,snapshot.deafened]);

  const switchInput=useCallback(async(deviceId:string)=>{
    try{await invoke('native_voice_switch_input',{deviceId});await refreshSnapshot()}catch(error){onError(error instanceof Error?error.message:String(error))}
  },[onError,refreshSnapshot]);
  const switchOutput=useCallback(async(deviceId:string)=>{
    try{await invoke('native_voice_switch_output',{deviceId});await refreshSnapshot()}catch(error){onError(error instanceof Error?error.message:String(error))}
  },[onError,refreshSnapshot]);

  const toggleParticipantLocalMute=useCallback((identity:string)=>{
    setLocallyMutedParticipants(previous=>{
      const muted=!previous.includes(identity);
      void invoke('native_voice_set_participant_muted',{identity,muted}).catch(error=>onError(error instanceof Error?error.message:String(error)));
      return muted?[...previous,identity]:previous.filter(id=>id!==identity);
    });
  },[onError]);

  const setParticipantVolume=useCallback((identity:string,value:number)=>{
    const next=Math.max(0,Math.min(100,Math.round(value)));
    setParticipantVolumes(previous=>({...previous,[identity]:next}));
    // Native Rust SDK currently exposes platform playout rather than per-track gain.
    // Preserve the familiar 0% behavior; intermediate gain is added after the native
    // engine checkpoint instead of routing audio back through browser WebAudio.
    if(next===0&&!locallyMutedParticipants.includes(identity))toggleParticipantLocalMute(identity);
    else if(next>0&&locallyMutedParticipants.includes(identity))toggleParticipantLocalMute(identity);
  },[locallyMutedParticipants,toggleParticipantLocalMute]);

  const unsupportedMedia=useCallback(async()=>{onError('Desktop native ses motoru aktif. Kamera/ekran paylaşımı bir sonraki desktop adımında native hatta taşınacak.')},[onError]);
  const switchCamera=useCallback(async(_deviceId:string)=>{await unsupportedMedia()},[unsupportedMedia]);

  useEffect(()=>{
    if(!enabled||!isTauriRuntime())return;
    const timer=window.setInterval(()=>{void refreshSnapshot()},350);
    void refreshSnapshot();
    return()=>window.clearInterval(timer);
  },[enabled,refreshSnapshot]);

  useEffect(()=>{
    if(!enabled||!joinedRef.current||!isTauriRuntime())return;
    void invoke('native_voice_set_processing',{processing:processing()}).catch(error=>console.warn('[desktop:voice] processing update failed',error));
  },[enabled,processing]);

  useEffect(()=>{
    if(preferences.voiceInputMode!=='push_to_talk'||!enabled||!isTauriRuntime())return;
    const release=()=>{
      if(!pttHeldRef.current)return;
      pttHeldRef.current=false;
      void invoke('native_voice_set_muted',{muted:true}).then(refreshSnapshot).catch(()=>undefined);
    };
    const down=(event:KeyboardEvent)=>{
      if(event.code!==preferences.pushToTalkKey||event.repeat||pttHeldRef.current||snapshot.status!=='connected'||!snapshot.canSpeak||snapshot.deafened)return;
      event.preventDefault();pttHeldRef.current=true;
      void invoke('native_voice_set_muted',{muted:false}).then(refreshSnapshot).catch(error=>onError(error instanceof Error?error.message:String(error)));
    };
    const up=(event:KeyboardEvent)=>{if(event.code===preferences.pushToTalkKey){event.preventDefault();release()}};
    window.addEventListener('keydown',down,true);window.addEventListener('keyup',up,true);window.addEventListener('blur',release);
    return()=>{window.removeEventListener('keydown',down,true);window.removeEventListener('keyup',up,true);window.removeEventListener('blur',release);release()};
  },[enabled,onError,preferences.pushToTalkKey,preferences.voiceInputMode,refreshSnapshot,snapshot.canSpeak,snapshot.deafened,snapshot.status]);

  useEffect(()=>{if(!enabled&&isTauriRuntime())void leave()},[enabled,leave]);
  useEffect(()=>()=>{if(isTauriRuntime())void invoke('native_voice_leave')},[]);

  const inputDevices=snapshot.inputDevices.map(device=>asMediaDevice(device,'audioinput'));
  const outputDevices=snapshot.outputDevices.map(device=>asMediaDevice(device,'audiooutput'));
  const videoTracks:VoiceVideoTrack[]=[];

  return {
    status:snapshot.status,channelId:snapshot.channelId,participants:snapshot.participants,videoTracks,
    muted:snapshot.muted,deafened:snapshot.deafened,cameraEnabled:false,screenSharing:false,canSpeak:snapshot.canSpeak,
    inputDevices,outputDevices,cameraDevices:[] as MediaDeviceInfo[],inputDeviceId:snapshot.inputDeviceId,outputDeviceId:snapshot.outputDeviceId,cameraDeviceId:'',
    inputMode:preferences.voiceInputMode,pushToTalkKey:preferences.pushToTalkKey,pushToTalkActive:preferences.voiceInputMode==='push_to_talk'&&!snapshot.muted,
    participantVolumes,locallyMutedParticipants,join,leave,toggleMute,toggleDeafen,toggleCamera:unsupportedMedia,toggleScreenShare:unsupportedMedia,
    switchInput,switchOutput,switchCamera,setParticipantVolume,toggleParticipantLocalMute,refreshDevices:refreshSnapshot,
  };
}

export function isDesktopNativeVoiceRuntime(){return isTauriRuntime()}
