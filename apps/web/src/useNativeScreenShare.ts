import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { API_ORIGIN, auth } from './api';
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
function ownerIdentity(identity:string){return identity.startsWith('screen:')?identity.slice('screen:'.length):identity}
function isSyntheticScreen(identity:string){return identity.startsWith('screen:')}

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

async function pickNativeSource():Promise<NativeScreenSource|null>{
  const sources=await invoke<NativeScreenSource[]>('native_screen_sources');
  if(!sources.length)throw new Error('Paylaşılabilir ekran veya pencere bulunamadı.');
  return new Promise(resolve=>{
    const dialog=document.createElement('dialog');dialog.className='modal-backdrop native-screen-picker-backdrop';
    const modal=document.createElement('div');modal.className='modal native-screen-picker';
    const head=document.createElement('div');head.className='modal-head';
    const heading=document.createElement('div');
    const h2=document.createElement('h2');h2.textContent='Ne paylaşmak istiyorsun?';
    const p=document.createElement('p');p.textContent='ShakeChat yerel Windows yakalama motorunu kullanır.';
    heading.append(h2,p);
    const close=document.createElement('button');close.type='button';close.className='icon-btn';close.textContent='×';close.setAttribute('aria-label','Kapat');
    head.append(heading,close);modal.append(head);
    const finish=(source:NativeScreenSource|null)=>{try{dialog.close()}catch{}dialog.remove();resolve(source)};
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
  const locallyMutedScreensRaw=voice.locallyMutedScreens??[];
  const screenVolumesRaw=voice.screenVolumes??{};
  const [active,setActive]=useState(false);
  const [busy,setBusy]=useState(false);
  const [settings,setSettings]=useState<ScreenSettings>(voice.screenSettings??{height:1080,fps:60});
  const sourceRef=useRef<NativeScreenSource|null>(null);
  const settingsRef=useRef(settings);settingsRef.current=settings;
  const localIdentity=participantsRaw.find(person=>person.local)?.identity||'';

  const rawForOwner=useCallback((identity:string)=>{
    const owner=ownerIdentity(identity);
    const candidate=availableScreensRaw.find(item=>ownerIdentity(item.identity)===owner);
    return candidate?.identity||identity;
  },[availableScreensRaw]);

  const start=useCallback(async(source:NativeScreenSource,next:ScreenSettings)=>{
    if(!voice.channelId)throw new Error('Önce bir ses kanalına bağlan.');
    const credentials=await fetchScreenToken(voice.channelId);
    const options=screenOptions(next);
    await invoke('native_screen_start',{
      url:credentials.url,token:credentials.token,
      sourceKind:source.kind,sourceId:source.id,
      width:options.resolution.width,height:options.resolution.height,fps:options.resolution.frameRate,
    });
    sourceRef.current=source;settingsRef.current=next;setSettings(next);setActive(true);
  },[voice.channelId]);

  const stop=useCallback(async()=>{
    try{await invoke('native_screen_stop')}finally{sourceRef.current=null;setActive(false)}
  },[]);

  const toggleScreenShare=useCallback(async()=>{
    if(!desktop)return voice.toggleScreenShare();
    if(busy)return;
    setBusy(true);
    try{
      if(active){await stop();return}
      if(!voice.canSpeak)throw new Error('Bu ses kanalında ekran paylaşma yetkin yok.');
      if(voice.microphoneTestActive)throw new Error('Yeni yayın başlatmadan önce mikrofon testini durdur.');
      const source=await pickNativeSource();if(!source)return;
      await start(source,settingsRef.current);
    }catch(error){onError(error instanceof Error?error.message:String(error))}
    finally{setBusy(false)}
  },[active,busy,desktop,onError,start,stop,voice]);

  const changeScreenSource=useCallback(async()=>{
    if(!desktop)return voice.changeScreenSource();
    if(!active||busy)return;
    setBusy(true);
    try{const source=await pickNativeSource();if(source)await start(source,settingsRef.current)}
    catch(error){onError(error instanceof Error?error.message:String(error))}
    finally{setBusy(false)}
  },[active,busy,desktop,onError,start,voice]);

  const changeScreenSettings=useCallback(async(next:ScreenSettings)=>{
    if(!desktop)return voice.changeScreenSettings(next);
    if(!active){settingsRef.current=next;setSettings(next);return}
    const source=sourceRef.current;if(!source)return;
    if(busy)return;setBusy(true);
    try{await start(source,next)}catch(error){onError(error instanceof Error?error.message:String(error))}
    finally{setBusy(false)}
  },[active,busy,desktop,onError,start,voice]);

  useEffect(()=>{
    if(!desktop||!active||!localIdentity)return;
    const synthetic=availableScreensRaw.find(item=>item.identity===`screen:${localIdentity}`);
    if(synthetic&&!watchingScreensRaw.includes(synthetic.identity))voice.setScreenWatching(synthetic.identity,true);
  },[active,availableScreensRaw,desktop,localIdentity,voice.setScreenWatching,watchingScreensRaw]);

  useEffect(()=>{
    if(!desktop||!active)return;
    if(voice.status==='disconnected'||!voice.channelId)void stop();
  },[active,desktop,stop,voice.channelId,voice.status]);
  useEffect(()=>()=>{if(desktop)void invoke('native_screen_stop').catch(()=>undefined)},[desktop]);

  const participants=useMemo(()=>{
    const synthetic=new Map(participantsRaw.filter(person=>isSyntheticScreen(person.identity)).map(person=>[ownerIdentity(person.identity),person]));
    return participantsRaw.filter(person=>!isSyntheticScreen(person.identity)).map(person=>{
      const screen=synthetic.get(person.identity);
      return screen?{...person,screen:person.screen||screen.screen}:person;
    });
  },[participantsRaw]);

  const mapTrack=useCallback((item:(typeof videoTracksRaw)[number])=>{
    const identity=ownerIdentity(item.identity);
    return isSyntheticScreen(item.identity)?{...item,identity,local:identity===localIdentity}:item;
  },[localIdentity]);
  const videoTracks=useMemo(()=>videoTracksRaw.map(mapTrack),[mapTrack,videoTracksRaw]);
  const availableScreens=useMemo(()=>availableScreensRaw.map(mapTrack),[availableScreensRaw,mapTrack]);
  const watchingScreens=useMemo(()=>[...new Set(watchingScreensRaw.map(ownerIdentity))],[watchingScreensRaw]);
  const locallyMutedScreens=useMemo(()=>[...new Set(locallyMutedScreensRaw.map(ownerIdentity))],[locallyMutedScreensRaw]);
  const screenVolumes=useMemo(()=>Object.fromEntries(Object.entries(screenVolumesRaw).map(([id,value])=>[ownerIdentity(id),value])),[screenVolumesRaw]);

  const setScreenWatching=useCallback((identity:string,watch:boolean)=>voice.setScreenWatching(rawForOwner(identity),watch),[rawForOwner,voice.setScreenWatching]);
  const setScreenVolume=useCallback((identity:string,value:number)=>voice.setScreenVolume(rawForOwner(identity),value),[rawForOwner,voice.setScreenVolume]);
  const toggleScreenLocalMute=useCallback((identity:string)=>voice.toggleScreenLocalMute(rawForOwner(identity)),[rawForOwner,voice.toggleScreenLocalMute]);

  if(!desktop)return voice;
  return {
    ...voice,participants,videoTracks,availableScreens,watchingScreens,locallyMutedScreens,screenVolumes,
    screenSharing:active,screenSettings:settings,screenBusy:busy,
    toggleScreenShare,changeScreenSource,changeScreenSettings,setScreenWatching,setScreenVolume,toggleScreenLocalMute,
  };
}
