import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { API_ORIGIN, auth } from './api';
import { isMicrophoneTestActive, registerMicrophoneTestIsolation } from './microphoneTestIsolation';
import { screenOwner as ownerIdentity, isNativeScreenIdentity as isSyntheticScreen } from './screenIdentity';
import { screenOptions, type ScreenSettings } from './screenShareControl';
import type { useVoice } from './useVoice';

type BaseVoice = ReturnType<typeof useVoice>;
type NativeScreenSource = { id:string; title:string; kind:'screen'|'window' };
type NativeScreenToken = { token:string; url:string; room:string; channelId:string; ownerId:string; identity:string };

function isTauriRuntime(){
  if(typeof window==='undefined')return false;
  const internals=(window as unknown as {__TAURI_INTERNALS__?:{invoke?:unknown}}).__TAURI_INTERNALS__;
  return typeof internals?.invoke==='function';
}

async function fetchScreenToken(channelId:string):Promise<NativeScreenToken>{
  const token=auth.token();
  if(!token)throw new Error('Oturum bulunamadı.');
  const base=API_ORIGIN?`${API_ORIGIN}/api`:'/api';
  const response=await fetch(`${base}/voice/channels/${encodeURIComponent(channelId)}/screen-token`,{
    method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
  });
  if(!response.ok){
    const body=await response.json().catch(()=>({message:'Native ekran yayını başlatılamadı.'}));
    const message=Array.isArray(body?.message)?body.message.join(', '):body?.message;
    throw new Error(message||'Native ekran yayını başlatılamadı.');
  }
  return response.json() as Promise<NativeScreenToken>;
}

function pickerButton(source:NativeScreenSource,finish:(source:NativeScreenSource|null)=>void){
  const button=document.createElement('button');
  button.type='button';button.className='type-card native-screen-source';
  const copy=document.createElement('span');
  const title=document.createElement('b');title.textContent=source.title||(source.kind==='screen'?'Ekran':'Pencere');
  const detail=document.createElement('small');detail.textContent=source.kind==='screen'?'Tüm ekranı paylaş':'Yalnızca bu pencereyi paylaş';
  copy.append(title,detail);button.append(copy);button.addEventListener('click',()=>finish(source));return button;
}

async function pickNativeSource(signal:AbortSignal):Promise<NativeScreenSource|null>{
  const sources=await invoke<NativeScreenSource[]>('native_screen_sources');
  if(signal.aborted)return null;
  if(!sources.length)throw new Error('Paylaşılabilir ekran veya pencere bulunamadı.');
  return new Promise(resolve=>{
    const dialog=document.createElement('dialog');dialog.className='modal-backdrop native-screen-picker-backdrop';
    const modal=document.createElement('div');modal.className='modal native-screen-picker';
    const head=document.createElement('div');head.className='modal-head';
    const heading=document.createElement('div');
    const h2=document.createElement('h2');h2.textContent='Ne paylaşmak istiyorsun?';
    const p=document.createElement('p');p.textContent='Bir ekran veya pencere seç. Bilgisayar sesi tüm uygulamalardan paylaşılır.';
    heading.append(h2,p);
    const close=document.createElement('button');close.type='button';close.className='icon-btn';close.textContent='×';close.setAttribute('aria-label','Kapat');
    head.append(heading,close);modal.append(head);
    const cancel=()=>finish(null);
    const finish=(source:NativeScreenSource|null)=>{signal.removeEventListener('abort',cancel);try{dialog.close()}catch{}dialog.remove();resolve(source)};
    signal.addEventListener('abort',cancel,{once:true});
    close.addEventListener('click',()=>finish(null));dialog.addEventListener('cancel',event=>{event.preventDefault();finish(null)},{once:true});
    for(const kind of ['screen','window'] as const){
      const group=sources.filter(source=>source.kind===kind);if(!group.length)continue;
      const label=document.createElement('div');label.className='section';label.textContent=kind==='screen'?'EKRANLAR':'PENCERELER';modal.append(label);
      const list=document.createElement('div');list.className='native-screen-source-list';
      group.forEach(source=>list.append(pickerButton(source,finish)));modal.append(list);
    }
    dialog.append(modal);document.body.append(dialog);dialog.showModal();
  });
}

export function useNativeScreenShare(voice:BaseVoice,onError:(message:string)=>void){
  const desktop=isTauriRuntime();
  const participantsRaw=voice.participants??[];
  const videoTracksRaw=voice.videoTracks??[];
  const availableScreensRaw=voice.availableScreens??[];
  const watchingScreensRaw=voice.watchingScreens??[];
  const [active,setActive]=useState(false);
  const [busy,setBusy]=useState(false);
  const [settings,setSettings]=useState<ScreenSettings>(voice.screenSettings??{height:1080,fps:60});
  const sourceRef=useRef<NativeScreenSource|null>(null);
  const settingsRef=useRef(settings);
  const activeRef=useRef(false);
  const busyRef=useRef(false);
  const mountedRef=useRef(true);
  const generationRef=useRef(0);
  const pickerRef=useRef<AbortController|null>(null);
  const channelRef=useRef('');
  const voiceRef=useRef(voice);voiceRef.current=voice;
  const errorRef=useRef(onError);errorRef.current=onError;
  const operationsRef=useRef<Promise<unknown>>(Promise.resolve());
  const localIdentity=participantsRaw.find(person=>person.local)?.identity||'';
  const enqueue=useCallback(<T,>(task:()=>Promise<T>):Promise<T>=>{
    const operation=operationsRef.current.then(task);
    operationsRef.current=operation.catch(()=>undefined);
    return operation;
  },[]);
  const valid=useCallback((generation:number,channel:string)=>mountedRef.current&&generationRef.current===generation&&voiceRef.current.channelId===channel&&voiceRef.current.status==='connected'&&voiceRef.current.canSpeak,[]);

  const stop=useCallback(async()=>{
    generationRef.current+=1;pickerRef.current?.abort();pickerRef.current=null;
    sourceRef.current=null;channelRef.current='';activeRef.current=false;busyRef.current=false;
    if(mountedRef.current){setActive(false);setBusy(false)}
    await enqueue(()=>invoke('native_screen_stop'));
  },[enqueue]);

  useEffect(()=>{
    if(!active&&!busy){settingsRef.current=voice.screenSettings;setSettings(voice.screenSettings)}
  },[active,busy,voice.screenSettings]);

  const toggleScreenShare=useCallback(async()=>{
    if(!desktop)return voice.toggleScreenShare();
    if(activeRef.current){await stop().catch(error=>errorRef.current(String(error)));return}
    if(busyRef.current)return;
    const channel=voiceRef.current.channelId;
    if(!channel||voiceRef.current.status!=='connected'){errorRef.current('Önce bir ses kanalına bağlan.');return}
    if(!voiceRef.current.canSpeak){errorRef.current('Bu ses kanalında ekran paylaşma yetkin yok.');return}
    if(isMicrophoneTestActive()){errorRef.current('Yeni yayın başlatmadan önce mikrofon testini durdur.');return}
    const generation=++generationRef.current;
    const picker=new AbortController();pickerRef.current=picker;
    channelRef.current=channel;busyRef.current=true;setBusy(true);
    try{
      const source=await pickNativeSource(picker.signal);
      if(!source||!valid(generation,channel))return;
      const credentials=await fetchScreenToken(channel);
      if(!valid(generation,channel))return;
      const next=settingsRef.current,options=screenOptions(next);
      const started=await enqueue(async()=>{
        if(!valid(generation,channel)||isMicrophoneTestActive())return false;
        await invoke('native_screen_start',{url:credentials.url,token:credentials.token,sourceKind:source.kind,sourceId:source.id,width:options.resolution.width,height:options.resolution.height,fps:options.resolution.frameRate});
        return true;
      });
      if(!started||!valid(generation,channel))return;
      sourceRef.current=source;activeRef.current=true;setActive(true);setSettings(next);
    }catch(error){if(valid(generation,channel))errorRef.current(error instanceof Error?error.message:String(error))}
    finally{if(generationRef.current===generation){pickerRef.current=null;busyRef.current=false;if(mountedRef.current)setBusy(false)}}
  },[desktop,enqueue,stop,valid,voice.toggleScreenShare]);

  const update=useCallback(async(source:NativeScreenSource,next:ScreenSettings,generation:number,channel:string)=>{
    const options=screenOptions(next);
    const applied=await enqueue(async()=>{
      if(!valid(generation,channel))return false;
      await invoke('native_screen_update',{sourceKind:source.kind,sourceId:source.id,width:options.resolution.width,height:options.resolution.height,fps:options.resolution.frameRate});
      return true;
    });
    if(applied&&valid(generation,channel)){sourceRef.current=source;settingsRef.current=next;setSettings(next)}
  },[enqueue,valid]);

  const changeScreenSource=useCallback(async()=>{
    if(!desktop)return voice.changeScreenSource();
    if(!activeRef.current||busyRef.current)return;
    if(isMicrophoneTestActive()){errorRef.current('Ekranı değiştirmeden önce mikrofon testini durdur.');return}
    const generation=generationRef.current,channel=channelRef.current;
    const picker=new AbortController();pickerRef.current=picker;
    busyRef.current=true;setBusy(true);
    try{const source=await pickNativeSource(picker.signal);if(source)await update(source,settingsRef.current,generation,channel)}
    catch(error){if(valid(generation,channel))errorRef.current(error instanceof Error?error.message:String(error))}
    finally{if(generationRef.current===generation){pickerRef.current=null;busyRef.current=false;if(mountedRef.current)setBusy(false)}}
  },[desktop,update,valid,voice.changeScreenSource]);

  const changeScreenSettings=useCallback(async(next:ScreenSettings)=>{
    if(!desktop)return voice.changeScreenSettings(next);
    const source=sourceRef.current;if(!activeRef.current||!source||busyRef.current)return;
    const generation=generationRef.current,channel=channelRef.current;
    busyRef.current=true;setBusy(true);
    try{await update(source,next,generation,channel)}
    catch(error){if(valid(generation,channel))errorRef.current(error instanceof Error?error.message:String(error))}
    finally{if(generationRef.current===generation){busyRef.current=false;if(mountedRef.current)setBusy(false)}}
  },[desktop,update,valid,voice.changeScreenSettings]);

  // Await the native mute before the microphone test is allowed to play a monitor.
  useEffect(()=>{
    if(!desktop)return;
    return registerMicrophoneTestIsolation(async()=>{
      if(isMicrophoneTestActive()&&busyRef.current)throw new Error('Yayın işlemini bitirdikten sonra mikrofon testini başlat.');
      if(activeRef.current)await enqueue(()=>invoke('native_screen_audio_pause',{paused:isMicrophoneTestActive()}));
    });
  },[desktop,enqueue]);

  useEffect(()=>{
    if(!desktop||(!activeRef.current&&!busyRef.current))return;
    if(voice.status==='disconnected'||!voice.channelId||voice.channelId!==channelRef.current||!voice.canSpeak)void stop().catch(error=>errorRef.current(String(error)));
  },[desktop,stop,voice.channelId,voice.status,voice.canSpeak]);
  useEffect(()=>{
    mountedRef.current=true;
    return()=>{mountedRef.current=false;if(desktop)void stop().catch(()=>undefined)};
  },[desktop,stop]);

  useEffect(()=>{
    if(!desktop||!active)return;
    let disposed=false,checking=false;
    const timer=window.setInterval(async()=>{
      if(checking||busyRef.current)return;checking=true;
      try{
        const alive=await invoke<boolean>('native_screen_active');
        if(!disposed&&!alive&&activeRef.current){await stop();errorRef.current('Ekran yayını durdu. Ekranı ve ses cihazını kontrol edip yeniden başlat.');}
      }catch(error){if(!disposed)errorRef.current(error instanceof Error?error.message:String(error))}
      finally{checking=false}
    },2000);
    return()=>{disposed=true;window.clearInterval(timer)};
  },[active,desktop,stop]);

  const join=useCallback(async(channel:string)=>{
    if(desktop&&channel!==voiceRef.current.channelId)await stop();
    await voiceRef.current.join(channel);
  },[desktop,stop]);
  const leave=useCallback(async()=>{
    if(desktop)await stop();
    await voiceRef.current.leave();
  },[desktop,stop]);

  // Apply the same owner mapping to browser viewers and desktop viewers.
  const participants=useMemo(()=>{
    const synthetic=new Map(participantsRaw.filter(person=>isSyntheticScreen(person.identity)).map(person=>[ownerIdentity(person.identity),person]));
    return participantsRaw.filter(person=>!isSyntheticScreen(person.identity)).map(person=>{
      const screen=synthetic.get(person.identity);
      return screen?{...person,screen:person.screen||screen.screen}:person;
    });
  },[participantsRaw]);
  const mapTrack=useCallback((item:(typeof videoTracksRaw)[number])=>{
    const identity=ownerIdentity(item.identity);
    return isSyntheticScreen(item.identity)?{...item,identity,local:identity===localIdentity,native:true}:item;
  },[localIdentity]);
  const videoTracks=useMemo(()=>videoTracksRaw.map(mapTrack),[mapTrack,videoTracksRaw]);
  const availableScreens=useMemo(()=>availableScreensRaw.map(mapTrack),[availableScreensRaw,mapTrack]);
  const watchingScreens=useMemo(()=>[...new Set(watchingScreensRaw.map(ownerIdentity))],[watchingScreensRaw]);
  const rawForOwner=useCallback((identity:string)=>availableScreensRaw.find(item=>ownerIdentity(item.identity)===ownerIdentity(identity))?.identity||identity,[availableScreensRaw]);
  const setScreenWatching=useCallback((identity:string,watch:boolean)=>voice.setScreenWatching(rawForOwner(identity),watch),[rawForOwner,voice.setScreenWatching]);
  return {
    ...voice,participants,videoTracks,availableScreens,watchingScreens,setScreenWatching,
    ...(desktop?{screenSharing:active,screenSettings:settings,screenBusy:busy,toggleScreenShare,changeScreenSource,changeScreenSettings,join,leave}:{}),
  };
}
