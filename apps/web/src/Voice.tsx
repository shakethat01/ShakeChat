import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, CameraOff, Focus, Grid2X2, Headphones, Maximize2, Mic, MicOff, MonitorUp, PhoneOff, Radio, ScreenShareOff, Volume2, VolumeX } from 'lucide-react';
import { VoiceParticipant, VoiceVideoTrack } from './useVoice';
import { VoiceInputMode, pushToTalkKeyLabel } from './preferences';

type VoiceState = {
  status:'disconnected'|'connecting'|'connected'|'reconnecting';
  channelId:string;
  participants:VoiceParticipant[];
  videoTracks:VoiceVideoTrack[];
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
  toggleParticipantLocalMute:(identity:string)=>void;
};

type VoiceContextAction = { type:'volume'|'toggle-local-mute'; identity:string; value?:number };

function deviceName(device:MediaDeviceInfo,index:number,prefix:string){return device.label||`${prefix} ${index+1}`}
function pttLabel(voice:VoiceState){return `Bas-konuş · ${pushToTalkKeyLabel(voice.pushToTalkKey)}`}

function VideoTile({item,featured,onToggleFeature}:{item:VoiceVideoTrack;featured:boolean;onToggleFeature:()=>void}){
  const ref=useRef<HTMLVideoElement>(null);
  const shellRef=useRef<HTMLDivElement>(null);
  const [metrics,setMetrics]=useState('');
  useEffect(()=>{
    const element=ref.current;
    const track=item.publication.videoTrack;
    if(!element||!track)return;
    let stopped=false;
    track.attach(element);
    const updateMetrics=async()=>{
      let width=0,height=0,fps=0,bitrate=0,limit='';
      try{
        const report=await track.getRTCStatsReport?.();
        let best:any;
        report?.forEach((stat:any)=>{
          const video=(stat.kind==='video'||stat.mediaType==='video'||(!stat.kind&&!stat.mediaType));
          const wanted=item.local?stat.type==='outbound-rtp':stat.type==='inbound-rtp';
          if(!wanted||stat.isRemote||!video)return;
          const area=(Number(stat.frameWidth)||0)*(Number(stat.frameHeight)||0);
          const bestArea=(Number(best?.frameWidth)||0)*(Number(best?.frameHeight)||0);
          if(!best||area>=bestArea)best=stat;
        });
        if(best){
          width=Math.round(Number(best.frameWidth)||0);
          height=Math.round(Number(best.frameHeight)||0);
          fps=Math.round(Number(best.framesPerSecond)||0);
          bitrate=Math.round((Number(track.currentBitrate)||0)/1000);
          limit=typeof best.qualityLimitationReason==='string'&&best.qualityLimitationReason!=='none'?best.qualityLimitationReason:'';
        }
      }catch{/* Stats are best-effort and browser dependent. */}
      if(!width||!height){
        const settings=track.mediaStreamTrack?.getSettings?.();
        width=Math.round(settings?.width||item.publication.dimensions?.width||0);
        height=Math.round(settings?.height||item.publication.dimensions?.height||0);
        fps=fps||Math.round(settings?.frameRate||0);
      }
      if(stopped)return;
      const parts=[];
      if(width&&height)parts.push(`${width}×${height}${fps?` · ${fps} FPS`:''}`);
      if(bitrate)parts.push(`${bitrate>=1000?(bitrate/1000).toFixed(1)+' Mbps':bitrate+' kbps'}`);
      if(limit)parts.push(`sınır: ${limit}`);
      setMetrics(parts.join(' · '));
    };
    void updateMetrics();
    const timer=window.setInterval(()=>void updateMetrics(),1000);
    return()=>{stopped=true;window.clearInterval(timer);try{track.detach(element)}catch{/* Track may already be unpublished. */}};
  },[item.publication,item.local]);

  async function fullscreen(){
    const shell=shellRef.current;
    if(!shell)return;
    try{
      if(document.fullscreenElement===shell)await document.exitFullscreen();
      else await shell.requestFullscreen();
    }catch{/* Fullscreen support/permission is browser dependent. */}
  }

  return <div ref={shellRef} className={`video-tile ${item.source==='screen'?'screen':''} ${featured?'featured':''}`}>
    <video ref={ref} autoPlay playsInline muted={item.local}/>
    <div className="video-tile-actions">
      <button type="button" aria-label={`${item.name} görüntüsünü ${featured?'ızgaraya döndür':'öne çıkar'}`} title={featured?'Izgaraya döndür':'Öne çıkar'} onClick={onToggleFeature}>{featured?<Grid2X2 size={15}/>:<Focus size={15}/>}</button>
      <button type="button" aria-label={`${item.name} görüntüsünü tam ekran yap`} title="Tam ekran" onClick={()=>void fullscreen()}><Maximize2 size={15}/></button>
    </div>
    <div className="video-label"><span>{item.source==='screen'?<MonitorUp size={14}/>:<Camera size={14}/>}</span><span>{item.name}{item.local?' · Sen':''}{item.source==='screen'?' · Ekran':''}</span>{item.source==='screen'&&<span className="video-live-badge"><Radio size={11}/> CANLI</span>}{metrics&&<small className="video-metrics">{metrics}</small>}</div>
  </div>;
}

function VoiceMemberList({voice,embedded=false}:{voice:VoiceState;embedded?:boolean}){
  useEffect(()=>{
    window.dispatchEvent(new CustomEvent('shakechat:voice-snapshot',{detail:{
      participants:voice.participants.map(person=>({identity:person.identity,name:person.name,local:person.local,speaking:person.speaking,muted:person.muted,camera:person.camera,screen:person.screen})),
      participantVolumes:voice.participantVolumes,
      locallyMutedParticipants:voice.locallyMutedParticipants,
    }}));
  },[voice.participants,voice.participantVolumes,voice.locallyMutedParticipants]);

  useEffect(()=>{
    const action=(event:Event)=>{
      const detail=(event as CustomEvent<VoiceContextAction>).detail;
      if(!detail||!voice.participants.some(person=>person.identity===detail.identity&&!person.local))return;
      if(detail.type==='toggle-local-mute')voice.toggleParticipantLocalMute(detail.identity);
      else if(detail.type==='volume'&&typeof detail.value==='number')voice.setParticipantVolume(detail.identity,detail.value);
    };
    window.addEventListener('shakechat:voice-action',action as EventListener);
    return()=>window.removeEventListener('shakechat:voice-action',action as EventListener);
  },[voice.participants,voice.setParticipantVolume,voice.toggleParticipantLocalMute]);

  return <div className={embedded?'voice-dock-members channel-voice-members':'voice-dock-members'} aria-label="Ses kanalındaki kullanıcılar">{voice.participants.map(person=>{
    const localMuted=voice.locallyMutedParticipants.includes(person.identity);
    return <div className={`voice-dock-member ${person.speaking&&!localMuted?'speaking':''} ${person.screen?'streaming':''}`} key={person.identity} data-voice-user-id={person.identity} data-voice-user-name={person.name} title={person.local?'Ses kanalındasın':'Sağ tık: kullanıcı ve ses kontrolleri'}>
      <div className="voice-dock-avatar">{person.name.slice(0,2).toUpperCase()}</div>
      <div className="voice-dock-member-copy"><b>{person.name}{person.local?' · Sen':''}</b><small>{person.speaking&&!localMuted?'Konuşuyor':person.muted?'Mikrofon kapalı':'Ses kanalında'}</small></div>
      <div className="voice-dock-member-state">{person.screen&&<span className="voice-live-badge compact"><Radio size={10}/> LIVE</span>}{localMuted?<VolumeX size={14}/>:person.muted?<MicOff size={14}/>:<Mic size={14}/>}</div>
    </div>;
  })}</div>;
}

export function VoicePanel({channelId,channelName,voice}:{channelId:string;channelName:string;voice:VoiceState}){
  const [featuredId,setFeaturedId]=useState('');
  const active=voice.channelId===channelId&&voice.status!=='disconnected';
  useEffect(()=>{if(featuredId&&!voice.videoTracks.some(track=>track.id===featuredId))setFeaturedId('')},[featuredId,voice.videoTracks]);
  if(!active)return <div className="voice-stage empty"><Volume2 size={46}/><h2>{channelName}</h2><p>Bu ses kanalına katılarak arkadaşlarınla konuşabilir, kamera veya ekran paylaşabilirsin.</p><button className="primary voice-join" onClick={()=>void voice.join(channelId)} disabled={voice.status==='connecting'}>{voice.status==='connecting'?'Bağlanıyor…':'Ses kanalına katıl'}</button></div>;
  const screens=voice.videoTracks.filter(track=>track.source==='screen');
  const cameras=voice.videoTracks.filter(track=>track.source==='camera');
  const liveCount=voice.participants.filter(person=>person.screen).length;
  const videos=[...screens,...cameras].sort((a,b)=>Number(b.id===featuredId)-Number(a.id===featuredId));
  return <div className="voice-stage">
    <div className="voice-hero"><div><span className={`voice-status-dot ${voice.status==='connected'?'on':''}`}/><small>{voice.status==='reconnecting'?'Yeniden bağlanıyor':'SES & VİDEO BAĞLANTISI'}</small><h2>{channelName}</h2><p>{voice.participants.length} kişi bağlı{liveCount?` · ${liveCount} yayın canlı`:voice.videoTracks.length?` · ${voice.videoTracks.length} görüntü`:''}</p></div><button className="danger-btn" onClick={()=>void voice.leave()}><PhoneOff size={18}/> Bağlantıyı kes</button></div>

    {voice.videoTracks.length>0&&<>
      <div className="stream-toolbar"><div><Radio size={15}/><span><b>CANLI YAYINLAR</b><small>{screens.length?`${screens.length} ekran paylaşımı`:''}{screens.length&&cameras.length?' · ':''}{cameras.length?`${cameras.length} kamera`:''}</small></span></div>{featuredId&&<button type="button" onClick={()=>setFeaturedId('')}><Grid2X2 size={14}/> Izgaraya dön</button>}</div>
      <div className={`video-stage ${featuredId?'has-featured':''}`} aria-label="Canlı görüntüler">{videos.map(item=><VideoTile key={item.id} item={item} featured={item.id===featuredId} onToggleFeature={()=>setFeaturedId(current=>current===item.id?'':item.id)}/>)}</div>
    </>}

    <div className="voice-grid">{voice.participants.map(person=>{
      const localMuted=voice.locallyMutedParticipants.includes(person.identity);
      const volume=voice.participantVolumes[person.identity]??100;
      return <div className={`voice-person ${person.speaking&&!localMuted?'speaking':''} ${person.screen?'streaming':''}`} key={person.identity}><div className="voice-avatar">{person.name.slice(0,2).toUpperCase()}</div><div className="voice-person-main"><div className="voice-person-title"><b>{person.name}{person.local?' · Sen':''}</b>{person.screen&&<span className="voice-live-badge"><Radio size={11}/> YAYIN</span>}</div><span>{person.muted?<><MicOff size={14}/> Sessiz</>:person.speaking?<><Mic size={14}/> Konuşuyor</>:<><Mic size={14}/> Bağlı</>}{person.camera&&<Camera size={14}/>} {person.screen&&<MonitorUp size={14}/>}</span>{!person.local&&<div className="participant-audio-controls"><button type="button" aria-label={localMuted?`${person.name} sesini aç`:`${person.name} sesini kapat`} className={localMuted?'local-muted':''} onClick={()=>voice.toggleParticipantLocalMute(person.identity)}>{localMuted?<VolumeX size={14}/>:<Volume2 size={14}/>}</button><input aria-label={`${person.name} ses seviyesi`} type="range" min="0" max="100" step="5" value={volume} onChange={e=>voice.setParticipantVolume(person.identity,Number(e.target.value))}/><small>{localMuted?'Yerel sessiz':`${volume}%`}</small></div>}</div></div>
    })}</div>

    <div className="voice-controls">
      <button className={voice.inputMode==='push_to_talk'?(voice.pushToTalkActive?'control media-on':'control active'):(voice.muted?'control active':'control')} disabled={!voice.canSpeak} onClick={()=>void voice.toggleMute()}>{voice.inputMode==='push_to_talk'?(voice.pushToTalkActive?<Mic size={20}/>:<MicOff size={20}/>):voice.muted?<MicOff size={20}/>:<Mic size={20}/>}<span>{!voice.canSpeak?'Konuşma yetkisi yok':voice.inputMode==='push_to_talk'?(voice.pushToTalkActive?'Konuşuyorsun':pttLabel(voice)):(voice.muted?'Mikrofonu aç':'Mikrofonu kapat')}</span></button>
      <button className={voice.deafened?'control active':'control'} onClick={()=>void voice.toggleDeafen()}><Headphones size={20}/><span>{voice.deafened?'Sesi aç':'Sağırlaştır'}</span></button>
      <button className={voice.cameraEnabled?'control media-on':'control'} disabled={!voice.canSpeak} onClick={()=>void voice.toggleCamera()}>{voice.cameraEnabled?<CameraOff size={20}/>:<Camera size={20}/>}<span>{voice.cameraEnabled?'Kamerayı kapat':'Kamerayı aç'}</span></button>
      <button className={voice.screenSharing?'control media-on':'control'} disabled={!voice.canSpeak} onClick={()=>void voice.toggleScreenShare()}>{voice.screenSharing?<ScreenShareOff size={20}/>:<MonitorUp size={20}/>}<span>{voice.screenSharing?'Paylaşımı durdur':'Ekran paylaş'}</span></button>
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
        <div className="voice-dock-actions"><button aria-label={!voice.canSpeak?'Konuşma yetkisi yok':voice.inputMode==='push_to_talk'?pttLabel(voice):(voice.muted?'Mikrofonu aç':'Mikrofonu kapat')} title={voice.inputMode==='push_to_talk'?pttLabel(voice):undefined} disabled={!voice.canSpeak} className={voice.inputMode==='push_to_talk'?(voice.pushToTalkActive?'media-on':'active'):(voice.muted?'active':'')} onClick={()=>void voice.toggleMute()}>{voice.inputMode==='push_to_talk'?(voice.pushToTalkActive?<Mic size={17}/>:<MicOff size={17}/>):voice.muted?<MicOff size={17}/>:<Mic size={17}/>}</button><button aria-label={voice.deafened?'Sesi aç':'Sağırlaştır'} className={voice.deafened?'active':''} onClick={()=>void voice.toggleDeafen()}><Headphones size={17}/></button><button aria-label={voice.cameraEnabled?'Kamerayı kapat':'Kamerayı aç'} disabled={!voice.canSpeak} className={voice.cameraEnabled?'media-on':''} onClick={()=>void voice.toggleCamera()}>{voice.cameraEnabled?<CameraOff size={17}/>:<Camera size={17}/>}</button><button aria-label={voice.screenSharing?'Ekran paylaşımını durdur':'Ekran paylaş'} disabled={!voice.canSpeak} className={voice.screenSharing?'media-on':''} onClick={()=>void voice.toggleScreenShare()}>{voice.screenSharing?<ScreenShareOff size={17}/>:<MonitorUp size={17}/>}</button><button aria-label="Ses bağlantısını kes" onClick={()=>void voice.leave()}><PhoneOff size={17}/></button></div>
      </div>
      {!channelSlot&&<VoiceMemberList voice={voice}/>} 
    </div>
    {channelSlot&&createPortal(<VoiceMemberList voice={voice} embedded/>,channelSlot)}
  </>;
}
