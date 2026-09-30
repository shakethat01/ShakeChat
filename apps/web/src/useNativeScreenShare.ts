import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { API_ORIGIN, auth } from './api';
import { isMicrophoneTestActive, registerMicrophoneTestIsolation } from './microphoneTestIsolation';
import { screenOwner as ownerIdentity, isNativeScreenIdentity as isSyntheticScreen } from './screenIdentity';
import { SCREEN_FRAME_RATES, SCREEN_HEIGHTS, screenOptions, type ScreenSettings } from './screenShareControl';
import type { useVoice } from './useVoice';

type BaseVoice = ReturnType<typeof useVoice>;
type NativeScreenSource = { id:string; title:string; kind:'screen'|'window' };
type NativeScreenToken = { token:string; url:string; room:string; channelId:string; ownerId:string; identity:string };
type NativeScreenPreview = { width:number; height:number; rgba:number[] };
type NativeScreenPick = { source:NativeScreenSource; settings:ScreenSettings };
type PickerTab = 'window'|'screen'|'device';

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

function sourceTitle(source:NativeScreenSource,index:number){
  const raw=source.title?.trim();
  if(source.kind==='screen'&&(!raw||/^(ekran|screen)$/i.test(raw)))return `Ekran ${index+1}`;
  return raw||(source.kind==='screen'?`Ekran ${index+1}`:'Pencere');
}

async function paintPreview(host:HTMLElement,source:NativeScreenSource,signal:AbortSignal){
  try{
    const preview=await invoke<NativeScreenPreview>('native_screen_preview',{sourceKind:source.kind,sourceId:source.id});
    if(signal.aborted||!host.isConnected||!preview?.width||!preview?.height||!preview.rgba?.length)return;
    const canvas=document.createElement('canvas');canvas.width=preview.width;canvas.height=preview.height;
    const context=canvas.getContext('2d');if(!context)return;
    const pixels=new Uint8ClampedArray(preview.rgba);
    context.putImageData(new ImageData(pixels,preview.width,preview.height),0,0);
    host.replaceChildren(canvas);
  }catch{
    // Some protected/minimized windows cannot be previewed. Keep the styled placeholder.
  }
}

async function pickNativeSource(signal:AbortSignal,initialSettings:ScreenSettings):Promise<NativeScreenPick|null>{
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

    let selected:NativeScreenSource|null=null;
    let selectedCard:HTMLButtonElement|null=null;
    let currentSettings:ScreenSettings={...initialSettings};
    let activeTab:PickerTab=sources.some(source=>source.kind==='window')?'window':'screen';

    const tabs=document.createElement('div');tabs.className='native-screen-tabs';
    const body=document.createElement('div');body.className='native-screen-picker-body';
    const footer=document.createElement('div');footer.className='native-screen-footer';

    const footerInfo=document.createElement('div');footerInfo.className='native-screen-footer-info';
    const footerIcon=document.createElement('div');footerIcon.className='native-screen-footer-icon';footerIcon.textContent='◉';
    const footerCopy=document.createElement('div');footerCopy.className='native-screen-footer-copy';
    const footerTitle=document.createElement('b');footerTitle.textContent='Paylaşım kaynağı seç';
    const footerMeta=document.createElement('div');footerMeta.className='native-screen-footer-meta';
    const qualityMeta=document.createElement('span');
    const audioMeta=document.createElement('span');audioMeta.className='audio';audioMeta.textContent='🔊 Sistem sesi dahil';
    footerMeta.append(qualityMeta,audioMeta);footerCopy.append(footerTitle,footerMeta);footerInfo.append(footerIcon,footerCopy);

    const actions=document.createElement('div');actions.className='native-screen-footer-actions';
    const pills=document.createElement('div');pills.className='native-screen-quality-pills';
    const sd=document.createElement('button');sd.type='button';sd.textContent='SD';sd.title='720p';
    const hd=document.createElement('button');hd.type='button';hd.textContent='HD';hd.title='1080p veya üstü';
    pills.append(sd,hd);
    const settingsButton=document.createElement('button');settingsButton.type='button';settingsButton.className='native-screen-settings-button';settingsButton.textContent='⚙';settingsButton.setAttribute('aria-label','Yayın kalitesi');
    const publish=document.createElement('button');publish.type='button';publish.className='native-screen-publish';publish.disabled=true;publish.innerHTML='<span>◉</span><span>Yayın yap</span>';
    actions.append(pills,settingsButton,publish);footer.append(footerInfo,actions);

    const popover=document.createElement('div');popover.className='native-screen-quality-popover';popover.hidden=true;
    const heightLabel=document.createElement('label');heightLabel.textContent='Çözünürlük';
    const heightSelect=document.createElement('select');
    SCREEN_HEIGHTS.forEach(height=>{const option=document.createElement('option');option.value=String(height);option.textContent=`${height}p`;heightSelect.append(option)});
    heightLabel.append(heightSelect);
    const fpsLabel=document.createElement('label');fpsLabel.textContent='FPS';
    const fpsSelect=document.createElement('select');
    SCREEN_FRAME_RATES.forEach(fps=>{const option=document.createElement('option');option.value=String(fps);option.textContent=`${fps} FPS`;fpsSelect.append(option)});
    fpsLabel.append(fpsSelect);popover.append(heightLabel,fpsLabel);footer.append(popover);

    const updateQuality=()=>{
      qualityMeta.textContent=`${currentSettings.height}p · ${currentSettings.fps} FPS`;
      heightSelect.value=String(currentSettings.height);fpsSelect.value=String(currentSettings.fps);
      sd.classList.toggle('active',currentSettings.height<=720);hd.classList.toggle('active',currentSettings.height>=1080);
    };
    const updateSelectionCopy=()=>{
      if(!selected){footerTitle.textContent='Paylaşım kaynağı seç';footerIcon.textContent='◉';publish.disabled=true;return}
      const index=sources.filter(source=>source.kind===selected?.kind).findIndex(source=>source.id===selected?.id);
      footerTitle.textContent=selected.kind==='screen'?sourceTitle(selected,Math.max(0,index)):'Uygulama';
      footerIcon.textContent=selected.kind==='screen'?'▣':'▤';publish.disabled=false;
    };

    const setSelected=(source:NativeScreenSource,card:HTMLButtonElement)=>{
      selectedCard?.classList.remove('selected');selected=source;selectedCard=card;card.classList.add('selected');updateSelectionCopy();
    };

    const renderTab=()=>{
      body.replaceChildren();selected=null;selectedCard=null;updateSelectionCopy();
      [...tabs.children].forEach(element=>{
        const button=element as HTMLButtonElement;button.classList.toggle('active',button.dataset.tab===activeTab);
      });
      if(activeTab==='device'){
        const empty=document.createElement('div');empty.className='native-screen-empty';
        empty.innerHTML='<div><strong>Kamera paylaşımı</strong><span>Kameranı açmak için ses kanalındaki kamera düğmesini kullan. Ekran paylaşımı penceresinden kamera başlatılmaz.</span></div>';
        body.append(empty);return;
      }
      const group=sources.filter(source=>source.kind===activeTab);
      if(!group.length){
        const empty=document.createElement('div');empty.className='native-screen-empty';empty.innerHTML='<div><strong>Kaynak bulunamadı</strong><span>Bu türde paylaşılabilir bir kaynak görünmüyor.</span></div>';body.append(empty);return;
      }
      const grid=document.createElement('div');grid.className='native-screen-grid';
      group.forEach((source,index)=>{
        const card=document.createElement('button');card.type='button';card.className='native-screen-card';card.dataset.sourceId=source.id;
        const preview=document.createElement('div');preview.className='native-screen-card-preview';
        const placeholder=document.createElement('div');placeholder.className='native-screen-preview-placeholder';
        const placeholderIcon=document.createElement('strong');placeholderIcon.textContent=source.kind==='screen'?'▣':'▤';
        const placeholderText=document.createElement('span');placeholderText.textContent='Önizleme hazırlanıyor';placeholder.append(placeholderIcon,placeholderText);preview.append(placeholder);
        const copy=document.createElement('div');copy.className='native-screen-card-copy';
        const badge=document.createElement('div');badge.className='native-screen-card-badge';badge.textContent=source.kind==='screen'?'▣':'▤';
        const text=document.createElement('span');const title=document.createElement('b');title.textContent=sourceTitle(source,index);
        const detail=document.createElement('small');detail.textContent=source.kind==='screen'?'Tüm ekranı paylaş':'Yalnızca bu pencereyi paylaş';text.append(title,detail);copy.append(badge,text);card.append(preview,copy);
        card.addEventListener('click',()=>setSelected(source,card));
        card.addEventListener('dblclick',()=>{setSelected(source,card);finish({source,settings:{...currentSettings}})});
        grid.append(card);
        window.setTimeout(()=>{if(!signal.aborted&&dialog.isConnected)void paintPreview(preview,source,signal)},Math.min(index*45,360));
      });
      body.append(grid);
    };

    const tabDefinitions:[PickerTab,string,string][]=[['window','Uygulamalar','▤'],['screen','Tüm Ekran','▣'],['device','Cihazlar','●']];
    tabDefinitions.forEach(([key,label,icon])=>{
      const button=document.createElement('button');button.type='button';button.className='native-screen-tab';button.dataset.tab=key;
      const iconSpan=document.createElement('span');iconSpan.className='native-screen-tab-icon';iconSpan.textContent=icon;
      const text=document.createElement('span');text.textContent=label;button.append(iconSpan,text);
      button.addEventListener('click',()=>{activeTab=key;renderTab()});tabs.append(button);
    });

    const cancel=()=>finish(null);
    const finish=(pick:NativeScreenPick|null)=>{signal.removeEventListener('abort',cancel);try{dialog.close()}catch{}dialog.remove();resolve(pick)};
    signal.addEventListener('abort',cancel,{once:true});
    close.addEventListener('click',()=>finish(null));dialog.addEventListener('cancel',event=>{event.preventDefault();finish(null)},{once:true});
    publish.addEventListener('click',()=>{if(selected)finish({source:selected,settings:{...currentSettings}})});
    sd.addEventListener('click',()=>{currentSettings={height:720,fps:Math.min(currentSettings.fps,60)};updateQuality()});
    hd.addEventListener('click',()=>{currentSettings={height:Math.max(1080,currentSettings.height),fps:currentSettings.fps};updateQuality()});
    settingsButton.addEventListener('click',()=>{popover.hidden=!popover.hidden});
    heightSelect.addEventListener('change',()=>{currentSettings={...currentSettings,height:Number(heightSelect.value)};updateQuality()});
    fpsSelect.addEventListener('change',()=>{currentSettings={...currentSettings,fps:Number(fpsSelect.value)};updateQuality()});

    modal.append(tabs,body,footer);dialog.append(modal);document.body.append(dialog);updateQuality();renderTab();dialog.showModal();
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
      const picked=await pickNativeSource(picker.signal,settingsRef.current);
      if(!picked||!valid(generation,channel))return;
      const {source,settings:next}=picked;
      const credentials=await fetchScreenToken(channel);
      if(!valid(generation,channel))return;
      const options=screenOptions(next);
      const started=await enqueue(async()=>{
        if(!valid(generation,channel)||isMicrophoneTestActive())return false;
        await invoke('native_screen_start',{url:credentials.url,token:credentials.token,sourceKind:source.kind,sourceId:source.id,width:options.resolution.width,height:options.resolution.height,fps:options.resolution.frameRate});
        return true;
      });
      if(!started||!valid(generation,channel))return;
      sourceRef.current=source;settingsRef.current=next;activeRef.current=true;setActive(true);setSettings(next);
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
    try{const picked=await pickNativeSource(picker.signal,settingsRef.current);if(picked)await update(picked.source,picked.settings,generation,channel)}
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
