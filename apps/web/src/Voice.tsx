import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { Camera, CameraOff, Focus, Grid2X2, Headphones, Maximize2, Mic, MicOff, MonitorUp, PhoneOff, Radio, ScreenShareOff, Volume2, VolumeX } from 'lucide-react';
import { VoiceParticipant, VoiceVideoTrack } from './useVoice';
import { StreamStats } from './streamStats';
import { SCREEN_HEIGHTS, SCREEN_FRAME_RATES, type ScreenSettings } from './screenShareControl';
import { VoiceInputMode, pushToTalkKeyLabel } from './preferences';

type VoiceState = {
  status:'disconnected'|'connecting'|'connected'|'reconnecting';
  channelId:string;
  participants:VoiceParticipant[];
  videoTracks:VoiceVideoTrack[];
  availableScreens:VoiceVideoTrack[];
  watchingScreens:string[];
  screenSettings:ScreenSettings;
  screenBusy:boolean;
  screenViewers:string[];
  setScreenWatching:(identity:string,watch:boolean)=>void;
  changeScreenSettings:(settings:ScreenSettings)=>Promise<void>;
  changeScreenSource:()=>Promise<void>;
  muted:boolean;
  deafened:boolean;
  cameraEnabled:boolean;
  screenSharing:boolean;
  canSpeak:boolean;
  inputDevices:MediaDeviceInfo[];
  outputDevices:MediaDeviceInfo[];
  cameraDevices:MediaDeviceInfo[];
  inputDeviceId:string;
  outputDeviceId:string;
  cameraDeviceId:string;
  inputMode:VoiceInputMode;
  pushToTalkKey:string;
  pushToTalkActive:boolean;
  participantVolumes:Record<string,number>;
  screenVolumes:Record<string,number>;
  locallyMutedScreens:string[];
  microphoneTestActive:boolean;
  microphoneMutedPreference:boolean;
  locallyMutedParticipants:string[];
  join:(channelId:string)=>Promise<void>;
  leave:()=>Promise<void>;
  toggleMute:()=>Promise<void>;
  toggleDeafen:()=>Promise<void>;
  toggleCamera:()=>Promise<void>;
  toggleScreenShare:()=>Promise<void>;
  switchInput:(deviceId:string)=>Promise<void>;
  switchOutput:(deviceId:string)=>Promise<void>;
  switchCamera:(deviceId:string)=>Promise<void>;
  setParticipantVolume:(identity:string,value:number)=>void;
  setScreenVolume:(identity:string,value:number)=>void;
  toggleScreenLocalMute:(identity:string)=>void;
  toggleParticipantLocalMute:(identity:string)=>void;
};

type VoiceContextAction = { type:'volume'|'toggle-local-mute'|'screen-volume'|'toggle-screen-mute'; identity:string; value?:number };

function deviceName(device:MediaDeviceInfo,index:number,prefix:string){return device.label||`${prefix} ${index+1}`}
function pttLabel(voice:VoiceState){return `Bas-konuş · ${pushToTalkKeyLabel(voice.pushToTalkKey)}`}
function microphoneLabel(voice:VoiceState){
  if(voice.microphoneTestActive)return voice.microphoneMutedPreference?'Testten sonra mikrofonu aç':'Testten sonra mikrofonu kapat';
  return voice.muted?'Mikrofonu aç':'Mikrofonu kapat';
}

function VideoTile({item,featured,onToggleFeature,voice}:{item:VoiceVideoTrack;featured:boolean;onToggleFeature:()=>void;voice:VoiceState}){
  const ref=useRef<HTMLVideoElement>(null);
  const shellRef=useRef<HTMLDivElement>(null);
  const clickTimer=useRef<number|null>(null);
  const [metrics,setMetrics]=useState('');
  useEffect(()=>()=>{if(clickTimer.current!==null)window.clearTimeout(clickTimer.current)},[]);
  useEffect(()=>{
    const element=ref.current;
    const track=item.publication.videoTrack;
    if(!element||!track)return;
    let stopped=false;
    track.attach(element);
    // Audio has one dedicated playback path with source-specific controls.
    element.muted = true;
    const sampler=new StreamStats();
    let renderedFrames=0,frameHandle:number|undefined,lastFrameCount=0,lastFrameTime=performance.now();
    const frame=()=>{renderedFrames+=1;if(!stopped)frameHandle=element.requestVideoFrameCallback?.(frame)};
    if(typeof element.requestVideoFrameCallback==='function')frameHandle=element.requestVideoFrameCallback(frame);
    let updating=false;
    const updateMetrics=async()=>{
      if(updating)return;updating=true;
      try{
        const value=sampler.sample(await track.getRTCStatsReport?.(),item.local);
        const capture=item.local?track.mediaStreamTrack?.getSettings?.():undefined;
        const parts:string[]=[];
        const size=value.width&&value.height?`${value.width}×${value.height}`:'ölçülüyor';
        parts.push(`${item.local?'Gönderim':'Alım'}: ${size}${value.fps===undefined?'':` · ${value.fps} FPS`}`);
        if(item.local&&capture?.frameRate!==undefined)parts.push(`Yakalama: ${Math.round(capture.frameRate)} FPS`);
        if(!item.local&&typeof element.requestVideoFrameCallback==='function'){
          const now=performance.now();const seconds=(now-lastFrameTime)/1000;
          if(seconds>=0.5){parts.push(`Görüntü: ${Math.round((renderedFrames-lastFrameCount)/seconds)} FPS`);lastFrameCount=renderedFrames;lastFrameTime=now}
        }
        if(value.kbps!==undefined)parts.push(`${(value.kbps/1000).toFixed(1)} Mbps`);
        if(value.limitation)parts.push(`Sınır: ${value.limitation==='cpu'?'işlemci':value.limitation==='bandwidth'?'bağlantı':value.limitation}`);
        if(!stopped)setMetrics(parts.join(' · '));
      }catch{if(!stopped)setMetrics('Yayın ölçümü bekleniyor…')}
      finally{updating=false}
    };
    void updateMetrics();
    const timer=window.setInterval(()=>void updateMetrics(),1000);
    return()=>{stopped=true;window.clearInterval(timer);if(frameHandle!==undefined)element.cancelVideoFrameCallback?.(frameHandle);try{track.detach(element)}catch{/* Track may already be unpublished. */}};
  },[item.publication,item.local,item.publication.videoTrack]);

  async function fullscreen(){
    const shell=shellRef.current;
    if(!shell)return;
    try{
      if(document.fullscreenElement===shell)await document.exitFullscreen();
      else await shell.requestFullscreen();
    }catch{/* Fullscreen support/permission is browser dependent. */}
  }

  function tileClick(event:MouseEvent<HTMLDivElement>){
    if((event.target as HTMLElement).closest('button,input,label,select'))return;
    if(clickTimer.current!==null)window.clearTimeout(clickTimer.current);
    clickTimer.current=window.setTimeout(()=>{clickTimer.current=null;onToggleFeature()},220);
  }

  function tileDoubleClick(event:MouseEvent<HTMLDivElement>){
    if((event.target as HTMLElement).closest('button,input,label,select'))return;
    if(clickTimer.current!==null){window.clearTimeout(clickTimer.current);clickTimer.current=null}
    void fullscreen();
  }

  return <div ref={shellRef} className={`video-tile ${item.source==='screen'?'screen':''} ${featured?'featured':''}`} onClick={tileClick} onDoubleClick={tileDoubleClick}>
    <video ref={ref} autoPlay playsInline muted/>
    {item.source==='screen'&&item.local&&voice.screenSettings&&<div className="live-publish-controls" onClick={event=>event.stopPropagation()} onDoubleClick={event=>event.stopPropagation()}>
      <label>Çözünürlük<select aria-label="Yayın çözünürlüğü" disabled={voice.screenBusy} value={voice.screenSettings.height} onChange={event=>void voice.changeScreenSettings({...voice.screenSettings,height:Number(event.target.value)})}>{SCREEN_HEIGHTS.map(height=><option key={height} value={height}>{height}p</option>)}</select></label>
      <label>FPS<select aria-label="Yayın FPS" disabled={voice.screenBusy} value={voice.screenSettings.fps} onChange={event=>void voice.changeScreenSettings({...voice.screenSettings,fps:Number(event.target.value)})}>{SCREEN_FRAME_RATES.map(fps=><option key={fps} value={fps}>{fps}</option>)}</select></label>
      <button type="button" disabled={voice.screenBusy||voice.microphoneTestActive} onClick={()=>void voice.changeScreenSource()}>Ekranı / pencereyi değiştir</button>
      <small>{voice.screenBusy?'Uygulanıyor…':`${voice.screenViewers?.length??0} izleyici`}</small>
    </div>}

    {item.source==='screen'&&!item.local&&<div className="screen-audio-controls" onClick={event=>event.stopPropagation()} onDoubleClick={event=>event.stopPropagation()}>
      <button type="button" aria-label={`${item.name} yayın sesini ${voice.locallyMutedScreens?.includes(item.identity)?'aç':'kapat'}`} onClick={()=>voice.toggleScreenLocalMute(item.identity)}>{voice.locallyMutedScreens?.includes(item.identity)?<VolumeX size={16}/>:<Volume2 size={16}/>}</button>
      <label>Yayın sesi<input aria-label={`${item.name} yayın ses seviyesi`} type="range" min="0" max="100" step="5" value={voice.screenVolumes?.[item.identity]??100} onChange={event=>voice.setScreenVolume(item.identity,Number(event.target.value))}/></label>
      <small>{voice.locallyMutedScreens?.includes(item.identity)?'Sessiz':`${voice.screenVolumes?.[item.identity]??100}%`}</small>
    </div>}
    <div className="video-tile-actions">
      {item.source==='screen'&&!item.local&&<button type="button" onClick={event=>{event.stopPropagation();voice.setScreenWatching(item.identity,false)}}>İzlemeyi bırak</button>}
      <button type="button" aria-label={`${item.name} görüntüsünü ${featured?'ızgaraya döndür':'öne çıkar'}`} title={featured?'Izgaraya döndür':'Öne çıkar'} onClick={e=>{e.stopPropagation();onToggleFeature()}}>{featured?<Grid2X2 size={15}/>:<Focus size={15}/>}</button>
      <button type="button" aria-label={`${item.name} görüntüsünü tam ekran yap`} title="Tam ekran" onClick={e=>{e.stopPropagation();void fullscreen()}}><Maximize2 size={15}/></button>
    </div>
    <div className="video-label"><span>{item.source==='screen'?<MonitorUp size={14}/>:<Camera size={14}/>}</span><span>{item.name}{item.local?' · Sen':''}{item.source==='screen'?' · Ekran':''}</span>{item.source==='screen'&&<span className="video-live-badge"><Radio size={11}/> CANLI</span>}{item.source==='screen'&&item.local&&voice.screenSettings&&<small>Hedef: {voice.screenSettings.height}p · {voice.screenSettings.fps} FPS</small>}{metrics&&<small className="video-metrics" title="FPS anlık ölçülür. Sabit görüntüde daha az kare gönderilebilir; hedef değer donanım ve bağlantıya göre sınırlanabilir.">{metrics}</small>}</div>
  </div>;
}

function VoiceMemberList({voice,embedded=false}:{voice:VoiceState;embedded?:boolean}){
  useEffect(()=>{
    window.dispatchEvent(new CustomEvent('shakechat:voice-snapshot',{detail:{
      participants:voice.participants.map(person=>({identity:person.identity,name:person.name,local:person.local,speaking:person.speaking,muted:person.muted,camera:person.camera,screen:person.screen})),
      participantVolumes:voice.participantVolumes,
      screenVolumes:voice.screenVolumes,
      locallyMutedScreens:voice.locallyMutedScreens,
      locallyMutedParticipants:voice.locallyMutedParticipants,
    }}));
  },[voice.participants,voice.participantVolumes,voice.locallyMutedParticipants,voice.screenVolumes,voice.locallyMutedScreens]);

  useEffect(()=>{
    const action=(event:Event)=>{
      const detail=(event as CustomEvent<VoiceContextAction>).detail;
      if(!detail||!voice.participants.some(person=>person.identity===detail.identity&&!person.local))return;
      if(detail.type==='toggle-local-mute')voice.toggleParticipantLocalMute(detail.identity);
      else if(detail.type==='volume'&&typeof detail.value==='number')voice.setParticipantVolume(detail.identity,detail.value);
      else if(detail.type==='screen-volume'&&typeof detail.value==='number')voice.setScreenVolume(detail.identity,detail.value);
      else if(detail.type==='toggle-screen-mute')voice.toggleScreenLocalMute(detail.identity);
    };
    window.addEventListener('shakechat:voice-action',action as EventListener);
    return()=>window.removeEventListener('shakechat:voice-action',action as EventListener);
  },[voice.participants,voice.setParticipantVolume,voice.toggleParticipantLocalMute,voice.setScreenVolume,voice.toggleScreenLocalMute]);

  return <div className={embedded?'voice-dock-members channel-voice-members':'voice-dock-members'} aria-label="Ses kanalındaki kullanıcılar">{voice.participants.map(person=>{
    const localMuted=voice.locallyMutedParticipants.includes(person.identity);
    return <div className={`voice-dock-member ${person.speaking&&!localMuted?'speaking':''} ${person.screen?'streaming':''}`} key={person.identity} data-voice-user-id={person.identity} data-voice-user-name={person.name} title={person.local?'Ses kanalındasın':'Sağ tık: kullanıcı ve ses kontrolleri'}>
      <div className="voice-dock-avatar">{person.name.slice(0,2).toUpperCase()}</div>
      <div className="voice-dock-member-copy"><b>{person.name}{person.local?' · Sen':''}</b><small>{person.speaking&&!localMuted?'Konuşuyor':person.muted?'Mikrofon kapalı':'Ses kanalında'}</small></div>
      <div className="voice-dock-member-state">{person.screen&&<span className="voice-live-badge compact"><Radio size={10}/> LIVE</span>}{localMuted?<VolumeX size={14}/>:person.muted?<MicOff size={14}/>:<Mic size={14}/>}</div>
    </div>;
  })}</div>;
}

export function VoicePanel({channelId,channelName,voice,onJoin}:{channelId:string;channelName:string;voice:VoiceState;onJoin?:()=>void}){
  const [featuredId,setFeaturedId]=useState('');
  const active=voice.channelId===channelId&&voice.status!=='disconnected';
  useEffect(()=>{if(featuredId&&!voice.videoTracks.some(track=>track.id===featuredId))setFeaturedId('')},[featuredId,voice.videoTracks]);
  if(!active)return <div className="voice-stage empty"><Volume2 size={46}/><h2>{channelName}</h2><p>Bu ses kanalına katılarak arkadaşlarınla konuşabilir, kamera veya ekran paylaşabilirsin.</p><button className="primary voice-join" onClick={()=>onJoin?onJoin():void voice.join(channelId)} disabled={voice.status==='connecting'}>{voice.status==='connecting'?'Bağlanıyor…':'Ses kanalına katıl'}</button></div>;
  const screens=voice.videoTracks.filter(track=>track.source==='screen');
  const cameras=voice.videoTracks.filter(track=>track.source==='camera');
  const liveCount=voice.participants.filter(person=>person.screen).length;
  const videos=[...screens,...cameras].sort((a,b)=>Number(b.id===featuredId)-Number(a.id===featuredId));
  return <div className="voice-stage">
    <div className="voice-hero"><div><span className={`voice-status-dot ${voice.status==='connected'?'on':''}`}/><small>{voice.status==='reconnecting'?'Yeniden bağlanıyor':'SES & VİDEO BAĞLANTISI'}</small><h2>{channelName}</h2><p>{voice.participants.length} kişi bağlı{liveCount?` · ${liveCount} yayın canlı`:voice.videoTracks.length?` · ${voice.videoTracks.length} görüntü`:''}</p></div><button className="danger-btn" onClick={()=>void voice.leave()}><PhoneOff size={18}/> Bağlantıyı kes</button></div>

    {(voice.availableScreens??[]).some(item=>!item.local&&!voice.watchingScreens?.includes(item.identity))&&<div className="available-streams" aria-label="İzlenebilir yayınlar">{(voice.availableScreens??[]).filter(item=>!item.local&&!voice.watchingScreens?.includes(item.identity)).map(item=><div className="available-stream" key={item.id}><MonitorUp size={22}/><div><b>{item.name}</b><small>Ekran paylaşıyor</small></div><button type="button" className="primary compact" onClick={()=>voice.setScreenWatching(item.identity,true)}>Yayını izle</button></div>)}</div>}
    {(voice.availableScreens??[]).filter(item=>!item.local&&voice.watchingScreens?.includes(item.identity)&&!voice.videoTracks.some(track=>track.id===item.id)).map(item=><div className="stream-connecting" role="status" key={item.id}>{item.name} · Yayına bağlanılıyor… <button type="button" onClick={()=>voice.setScreenWatching(item.identity,false)}>İzlemeyi bırak</button></div>)}

    {voice.videoTracks.length>0&&<>
      <div className="stream-toolbar"><div><Radio size={15}/><span><b>CANLI YAYINLAR</b><small>{screens.length?`${screens.length} ekran paylaşımı`:''}{screens.length&&cameras.length?' · ':''}{cameras.length?`${cameras.length} kamera`:''}</small></span></div>{featuredId&&<button type="button" onClick={()=>setFeaturedId('')}><Grid2X2 size={14}/> Izgaraya dön</button>}</div>
      <div className={`video-stage ${featuredId?'has-featured':''}`} aria-label="Canlı görüntüler">{videos.map(item=><VideoTile key={item.id} item={item} voice={voice} featured={item.id===featuredId} onToggleFeature={()=>setFeaturedId(current=>current===item.id?'':item.id)}/>)}</div>
    </>}

    <div className="voice-grid">{voice.participants.map(person=>{
      const localMuted=voice.locallyMutedParticipants.includes(person.identity);
      const volume=voice.participantVolumes[person.identity]??100;
      return <div className={`voice-person ${person.speaking&&!localMuted?'speaking':''} ${person.screen?'streaming':''}`} key={person.identity}><div className="voice-avatar">{person.name.slice(0,2).toUpperCase()}</div><div className="voice-person-main"><div className="voice-person-title"><b>{person.name}{person.local?' · Sen':''}</b>{person.screen&&<span className="voice-live-badge"><Radio size={11}/> YAYIN</span>}</div><span>{person.muted?<><MicOff size={14}/> Sessiz</>:person.speaking?<><Mic size={14}/> Konuşuyor</>:<><Mic size={14}/> Bağlı</>}{person.camera&&<Camera size={14}/>} {person.screen&&<MonitorUp size={14}/>}</span>{!person.local&&<div className="participant-audio-controls"><button type="button" aria-label={localMuted?`${person.name} sesini aç`:`${person.name} sesini kapat`} className={localMuted?'local-muted':''} onClick={()=>voice.toggleParticipantLocalMute(person.identity)}>{localMuted?<VolumeX size={14}/>:<Volume2 size={14}/>}</button><input aria-label={`${person.name} ses seviyesi`} type="range" min="0" max="100" step="5" value={volume} onChange={e=>voice.setParticipantVolume(person.identity,Number(e.target.value))}/><small>{localMuted?'Yerel sessiz':`${volume}%`}</small></div>}</div></div>
    })}</div>

    <div className="voice-controls">
      {voice.microphoneTestActive&&<p role="status">Mikrofon testi açık · Kanala test sesi gönderilmiyor.</p>}
      <button className={voice.inputMode==='push_to_talk'?(voice.pushToTalkActive?'control media-on':'control active'):(voice.muted?'control active':'control')} disabled={!voice.canSpeak} onClick={()=>void voice.toggleMute()}>{voice.inputMode==='push_to_talk'?(voice.pushToTalkActive?<Mic size={20}/>:<MicOff size={20}/>):voice.muted?<MicOff size={20}/>:<Mic size={20}/>}<span>{!voice.canSpeak?'Konuşma yetkisi yok':voice.inputMode==='push_to_talk'?(voice.pushToTalkActive?'Konuşuyorsun':pttLabel(voice)):microphoneLabel(voice)}</span></button>
      <button className={voice.deafened?'control active':'control'} onClick={()=>void voice.toggleDeafen()}><Headphones size={20}/><span>{voice.deafened?'Sesi aç':'Sağırlaştır'}</span></button>
      <button className={voice.cameraEnabled?'control media-on':'control'} disabled={!voice.canSpeak} onClick={()=>void voice.toggleCamera()}>{voice.cameraEnabled?<CameraOff size={20}/>:<Camera size={20}/>}<span>{voice.cameraEnabled?'Kamerayı kapat':'Kamerayı aç'}</span></button>
      <button className={voice.screenSharing?'control media-on':'control'} disabled={!voice.canSpeak||voice.screenBusy} onClick={()=>void voice.toggleScreenShare()}>{voice.screenSharing?<ScreenShareOff size={20}/>:<MonitorUp size={20}/>}<span>{voice.screenSharing?'Paylaşımı durdur':'Ekran paylaş'}</span></button>
    </div>
    {voice.inputMode==='push_to_talk'&&voice.canSpeak&&<div className={voice.pushToTalkActive?'ptt-status active':'ptt-status'}><Mic size={14}/><span>{voice.pushToTalkActive?'Bas-konuş aktif · ses gönderiliyor':`${pushToTalkKeyLabel(voice.pushToTalkKey)} tuşunu basılı tutarak konuş`}</span></div>}

    <div className="voice-devices voice-video-devices">
      <label>MİKROFON<select aria-label="Mikrofon cihazı" value={voice.inputDeviceId} onChange={e=>void voice.switchInput(e.target.value)}>{voice.inputDevices.length===0?<option value="">Varsayılan mikrofon</option>:voice.inputDevices.map((device,index)=><option key={device.deviceId} value={device.deviceId}>{deviceName(device,index,'Mikrofon')}</option>)}</select></label>
      <label>HOPARLÖR<select aria-label="Hoparlör cihazı" value={voice.outputDeviceId} onChange={e=>void voice.switchOutput(e.target.value)}>{voice.outputDevices.length===0?<option value="">Varsayılan hoparlör</option>:voice.outputDevices.map((device,index)=><option key={device.deviceId} value={device.deviceId}>{deviceName(device,index,'Hoparlör')}</option>)}</select></label>
      <label>KAMERA<select aria-label="Kamera cihazı" value={voice.cameraDeviceId} onChange={e=>void voice.switchCamera(e.target.value)}>{voice.cameraDevices.length===0?<option value="">Varsayılan kamera</option>:voice.cameraDevices.map((device,index)=><option key={device.deviceId} value={device.deviceId}>{deviceName(device,index,'Kamera')}</option>)}</select></label>
    </div>
  </div>
}

export function VoiceDock({channelName,voice}:{channelName:string;voice:VoiceState}){
  const [channelSlot,setChannelSlot]=useState<HTMLElement|null>(null);
  useEffect(()=>{
    let slot:HTMLDivElement|null=null;
    let attachedTo:Element|null=null;
    const sync=()=>{
      const button=document.querySelector('.flow-group .channel.voice-connected');
      if(button===attachedTo&&((button&&slot?.isConnected)||(!button&&!slot)))return;
      if(slot){slot.remove();slot=null}
      attachedTo=button;
      if(button){
        slot=document.createElement('div');
        slot.className='voice-channel-members-slot';
        button.insertAdjacentElement('afterend',slot);
        setChannelSlot(slot);
      }else setChannelSlot(null);
    };
    sync();
    const observer=new MutationObserver(sync);
    const root=document.querySelector('.channels')||document.body;
    observer.observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
    return()=>{observer.disconnect();slot?.remove()};
  },[voice.channelId]);

  if(!voice.channelId||voice.status==='disconnected')return null;
  const liveCount=voice.participants.filter(person=>person.screen).length;
  return <>
    <div className="voice-dock-shell">
      <div className="voice-dock">
        <div className="voice-dock-copy"><small>{voice.status==='reconnecting'?'Yeniden bağlanıyor…':'Ses bağlı'}</small><b>{channelName||'Ses kanalı'}</b><span>{voice.participants.length} kişi{liveCount?` · ${liveCount} yayın`:''}</span></div>
        <div className="voice-dock-actions"><button aria-label={!voice.canSpeak?'Konuşma yetkisi yok':voice.inputMode==='push_to_talk'?pttLabel(voice):microphoneLabel(voice)} title={voice.inputMode==='push_to_talk'?pttLabel(voice):undefined} disabled={!voice.canSpeak} className={voice.inputMode==='push_to_talk'?(voice.pushToTalkActive?'media-on':'active'):(voice.muted?'active':'')} onClick={()=>void voice.toggleMute()}>{voice.inputMode==='push_to_talk'?(voice.pushToTalkActive?<Mic size={17}/>:<MicOff size={17}/>):voice.muted?<MicOff size={17}/>:<Mic size={17}/>}</button><button aria-label={voice.deafened?'Sesi aç':'Sağırlaştır'} className={voice.deafened?'active':''} onClick={()=>void voice.toggleDeafen()}><Headphones size={17}/></button><button aria-label={voice.cameraEnabled?'Kamerayı kapat':'Kamerayı aç'} disabled={!voice.canSpeak} className={voice.cameraEnabled?'media-on':''} onClick={()=>void voice.toggleCamera()}>{voice.cameraEnabled?<CameraOff size={17}/>:<Camera size={17}/>}</button><button aria-label={voice.screenSharing?'Ekran paylaşımını durdur':'Ekran paylaş'} disabled={!voice.canSpeak} className={voice.screenSharing?'media-on':''} onClick={()=>void voice.toggleScreenShare()}>{voice.screenSharing?<ScreenShareOff size={17}/>:<MonitorUp size={17}/>}</button><button aria-label="Ses bağlantısını kes" onClick={()=>void voice.leave()}><PhoneOff size={17}/></button></div>
      </div>
      {!channelSlot&&<VoiceMemberList voice={voice}/>} 
    </div>
    {channelSlot&&createPortal(<VoiceMemberList voice={voice} embedded/>,channelSlot)}
  </>;
}
