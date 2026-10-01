import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useCallback, useEffect, useRef, useState } from 'react';
import { API_ORIGIN, auth } from './api';
import type { AppPreferences } from './preferences';
import { pushToTalkKeyLabel } from './preferences';
import type { VoiceParticipant, VoiceVideoTrack } from './useVoice';

type NativeDevice = { deviceId:string; label:string };
type NativeMicLevelEvent = { speaking:boolean; levelDb:number };
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
type NativeAudioToken={token:string;url:string;room:string;channelId:string;canSpeak:boolean;ownerId:string;identity:string};

const NATIVE_MUTE_STORAGE_KEY='shakechat.native-voice-muted.v1';
const LEGACY_MUTE_STORAGE_KEY='shakechat.voice-global-muted.v1';

export function isTauriRuntime(){return typeof window!=='undefined'&&'__TAURI_INTERNALS__' in window}
function ownerIdentity(identity:string){return identity.startsWith('audio:')?identity.slice(6):identity.startsWith('screen:')?identity.slice(7):identity}
function loadGlobalMuted(){
  try{
    const native=localStorage.getItem(NATIVE_MUTE_STORAGE_KEY);
    if(native!==null)return native==='1';
    const legacy=localStorage.getItem(LEGACY_MUTE_STORAGE_KEY)==='1';
    localStorage.setItem(NATIVE_MUTE_STORAGE_KEY,legacy?'1':'0');
    return legacy;
  }catch{return false}
}
function saveGlobalMuted(value:boolean){try{localStorage.setItem(NATIVE_MUTE_STORAGE_KEY,value?'1':'0')}catch{/* storage may be unavailable */}}
function asMediaDevice(device:NativeDevice,kind:'audioinput'|'audiooutput'):MediaDeviceInfo{
  return {deviceId:device.deviceId,groupId:'',kind,label:device.label,toJSON(){return {deviceId:device.deviceId,groupId:'',kind,label:device.label}}} as MediaDeviceInfo;
}
async function fetchAudioToken(channelId:string):Promise<NativeAudioToken>{
  const token=auth.token();
  if(!token)throw new Error('Oturum bulunamadı.');
  const base=API_ORIGIN?`${API_ORIGIN}/api`:'/api';
  const response=await fetch(`${base}/voice/channels/${encodeURIComponent(channelId)}/audio-token`,{
    method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
  });
  if(!response.ok){
    const body=await response.json().catch(()=>({message:'Native ses bağlantısı kurulamadı.'}));
    throw new Error(Array.isArray(body?.message)?body.message.join(', '):(body?.message||'Native ses bağlantısı kurulamadı.'));
  }
  return response.json() as Promise<NativeAudioToken>;
}

const EMPTY_SNAPSHOT:NativeSnapshot={
  status:'disconnected',channelId:'',participants:[],muted:true,deafened:false,canSpeak:false,
  inputDevices:[],outputDevices:[],inputDeviceId:'',outputDeviceId:'',engine:'native-rnnoise-webrtc-aec',
};

export function useNativeVoice(enabled:boolean,onError:(message:string)=>void,preferences:AppPreferences){
  const [snapshot,setSnapshot]=useState<NativeSnapshot>(EMPTY_SNAPSHOT);
  const [participantVolumes,setParticipantVolumes]=useState<Record<string,number>>({});
  const [locallyMutedParticipants,setLocallyMutedParticipants]=useState<string[]>([]);
  const globalMutedRef=useRef(loadGlobalMuted());
  const pttHeldRef=useRef(false);
  const joinedRef=useRef(false);

  const normalize=useCallback((next:NativeSnapshot):NativeSnapshot=>({
    ...next,
    participants:next.participants.map(participant=>({...participant,identity:ownerIdentity(participant.identity)})),
  }),[]);

  const refreshSnapshot=useCallback(async()=>{
    if(!isTauriRuntime())return;
    try{
      const raw=await invoke<NativeSnapshot>('native_voice_snapshot');
      const next=normalize(raw);
      setSnapshot(next);
      setParticipantVolumes(previous=>{
        const copy={...previous};
        for(const participant of next.participants)if(!participant.local&&copy[participant.identity]===undefined)copy[participant.identity]=100;
        return copy;
      });
    }catch(error){console.warn('[desktop:voice] snapshot failed',error)}
  },[normalize]);

  const processing=useCallback(()=>({
    // Rust enforces AEC-only WebRTC APM. This flag controls AEC; the NS switch
    // controls native RNNoise and AGC is deliberately ignored by the native path.
    echoCancellation:preferences.echoCancellation,
    noiseSuppression:preferences.noiseSuppression,
    autoGainControl:false,
    noiseGateEnabled:preferences.noiseGateEnabled,
    noiseGateThreshold:preferences.noiseGateThreshold,
  }),[preferences.echoCancellation,preferences.noiseGateEnabled,preferences.noiseGateThreshold,preferences.noiseSuppression]);

  const join=useCallback(async(channelId:string)=>{
    if(!enabled||!channelId||!isTauriRuntime())return;
    const credentials=await fetchAudioToken(channelId);
    const startMuted=preferences.voiceInputMode==='push_to_talk'||globalMutedRef.current;
    await invoke('native_voice_join',{
      url:credentials.url,token:credentials.token,channelId,canSpeak:credentials.canSpeak,
      processing:processing(),startMuted,
    });
    joinedRef.current=true;
    await refreshSnapshot();
  },[enabled,preferences.voiceInputMode,processing,refreshSnapshot]);

  const leave=useCallback(async()=>{
    if(!isTauriRuntime())return;
    try{await invoke('native_voice_leave')}catch(error){console.warn('[desktop:voice] leave failed',error)}
    joinedRef.current=false;
    setSnapshot(previous=>({...EMPTY_SNAPSHOT,muted:previous.muted}));
  },[]);

  const toggleMute=useCallback(async()=>{
    if(preferences.voiceInputMode==='push_to_talk'){
      onError(`Bas-konuş etkin. ${pushToTalkKeyLabel(preferences.pushToTalkKey)} tuşunu basılı tut.`);return;
    }
    const next=!globalMutedRef.current;
    globalMutedRef.current=next;saveGlobalMuted(next);
    try{await invoke('native_voice_set_muted',{muted:next});await refreshSnapshot()}
    catch(error){onError(error instanceof Error?error.message:String(error))}
  },[onError,preferences.pushToTalkKey,preferences.voiceInputMode,refreshSnapshot]);

  const toggleDeafen=useCallback(async()=>{
    const next=!snapshot.deafened;
    try{
      await invoke('native_voice_set_deafened',{deafened:next});
      if(next)await invoke('native_voice_set_muted',{muted:true});
      else if(preferences.voiceInputMode==='voice_activity'&&!globalMutedRef.current&&snapshot.canSpeak)await invoke('native_voice_set_muted',{muted:false});
      await refreshSnapshot();
    }catch(error){onError(error instanceof Error?error.message:String(error))}
  },[onError,preferences.voiceInputMode,refreshSnapshot,snapshot.canSpeak,snapshot.deafened]);

  const switchInput=useCallback(async(deviceId:string)=>{
    try{await invoke('native_voice_switch_input',{deviceId});await refreshSnapshot()}
    catch(error){onError(error instanceof Error?error.message:String(error))}
  },[onError,refreshSnapshot]);
  const switchOutput=useCallback(async(deviceId:string)=>{
    try{await invoke('native_voice_switch_output',{deviceId});await refreshSnapshot()}
    catch(error){onError(error instanceof Error?error.message:String(error))}
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
    if(next===0&&!locallyMutedParticipants.includes(identity))toggleParticipantLocalMute(identity);
    else if(next>0&&locallyMutedParticipants.includes(identity))toggleParticipantLocalMute(identity);
  },[locallyMutedParticipants,toggleParticipantLocalMute]);

  useEffect(()=>{
    if(!enabled||!isTauriRuntime())return;
    let disposed=false;
    const unlisten:Array<()=>void>=[];
    const register=async()=>{
      const speakers=await listen<string[]>('shakechat:voice-speakers',event=>{
        if(disposed)return;
        const active=new Set((event.payload||[]).map(ownerIdentity));
        setSnapshot(previous=>({...previous,participants:previous.participants.map(participant=>
          participant.local?participant:{...participant,speaking:active.has(participant.identity)}
        )}));
      });
      if(disposed)speakers();else unlisten.push(speakers);
      const mic=await listen<NativeMicLevelEvent>('shakechat:voice-mic-level',event=>{
        if(disposed)return;
        setSnapshot(previous=>({...previous,participants:previous.participants.map(participant=>
          participant.local?{...participant,speaking:!previous.muted&&Boolean(event.payload?.speaking)}:participant
        )}));
      });
      if(disposed)mic();else unlisten.push(mic);
      const dirty=await listen<boolean>('shakechat:voice-dirty',()=>{if(!disposed)void refreshSnapshot()});
      if(disposed)dirty();else unlisten.push(dirty);
    };
    void register();void refreshSnapshot();
    const timer=window.setInterval(()=>{void refreshSnapshot()},1000);
    return()=>{disposed=true;window.clearInterval(timer);for(const stop of unlisten)stop()};
  },[enabled,refreshSnapshot]);

  useEffect(()=>{
    if(!enabled||!joinedRef.current||!isTauriRuntime())return;
    void invoke('native_voice_set_processing',{processing:processing()}).catch(error=>console.warn('[desktop:voice] processing update failed',error));
  },[enabled,processing]);

  useEffect(()=>{
    if(preferences.voiceInputMode!=='push_to_talk'||!enabled||!isTauriRuntime())return;
    const release=()=>{
      if(!pttHeldRef.current)return;pttHeldRef.current=false;
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
  const unsupportedMedia=async()=>{};

  return {
    status:snapshot.status,channelId:snapshot.channelId,participants:snapshot.participants,videoTracks,
    muted:snapshot.muted,deafened:snapshot.deafened,cameraEnabled:false,screenSharing:false,canSpeak:snapshot.canSpeak,
    inputDevices,outputDevices,cameraDevices:[] as MediaDeviceInfo[],inputDeviceId:snapshot.inputDeviceId,outputDeviceId:snapshot.outputDeviceId,cameraDeviceId:'',
    inputMode:preferences.voiceInputMode,pushToTalkKey:preferences.pushToTalkKey,pushToTalkActive:preferences.voiceInputMode==='push_to_talk'&&!snapshot.muted,
    participantVolumes,locallyMutedParticipants,join,leave,toggleMute,toggleDeafen,toggleCamera:unsupportedMedia,toggleScreenShare:unsupportedMedia,
    switchInput,switchOutput,switchCamera:async(_deviceId:string)=>{},setParticipantVolume,toggleParticipantLocalMute,refreshDevices:refreshSnapshot,
    refreshSnapshot,
  };
}

export function isDesktopNativeVoiceRuntime(){return isTauriRuntime()}
