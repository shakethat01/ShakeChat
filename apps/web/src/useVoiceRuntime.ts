import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppPreferences } from './preferences';
import { useNativeVoice, isDesktopNativeVoiceRuntime } from './useNativeVoice';
import { useVoice, type VoiceParticipant } from './useVoice';

type MediaAction='camera'|'screen'|null;
type PendingHandoff={
  channelId:string;
  action:MediaAction;
  joinStarted:boolean;
  wasMuted:boolean;
  wasDeafened:boolean;
};

type LocalMicActivity={speaking:boolean;available:boolean};

function normalizeDeviceLabel(value:string){
  return value.toLocaleLowerCase().replace(/^(default|communications)\s*[-:]\s*/,'').replace(/[^a-z0-9çğıöşü]+/g,' ').trim();
}

function useDesktopLocalMicActivity(active:boolean,preferredLabel:string,thresholdDb:number,preferences:AppPreferences):LocalMicActivity{
  const [activity,setActivity]=useState<LocalMicActivity>({speaking:false,available:false});

  useEffect(()=>{
    if(!active||typeof navigator==='undefined'||!navigator.mediaDevices?.getUserMedia){
      setActivity({speaking:false,available:!active});
      return;
    }

    let disposed=false;
    let stream:MediaStream|null=null;
    let context:AudioContext|null=null;
    let timer:number|null=null;

    const stopStream=(target:MediaStream|null)=>{
      for(const track of target?.getTracks()||[])track.stop();
    };

    const audioConstraints=(deviceId?:string):MediaTrackConstraints=>({
      echoCancellation:preferences.echoCancellation,
      noiseSuppression:preferences.noiseSuppression,
      autoGainControl:preferences.autoGainControl,
      ...(deviceId?{deviceId:{exact:deviceId}}:{}),
    });

    const start=async()=>{
      try{
        // This second capture is meter-only. Native WASAPI/libwebrtc still owns the
        // actual voice path; no audio from this stream is published or played back.
        stream=await navigator.mediaDevices.getUserMedia({audio:audioConstraints(),video:false});
        if(disposed){stopStream(stream);return;}

        const wanted=normalizeDeviceLabel(preferredLabel);
        if(wanted){
          const devices=await navigator.mediaDevices.enumerateDevices();
          const matched=devices.find(device=>{
            if(device.kind!=='audioinput'||!device.deviceId||!device.label)return false;
            const candidate=normalizeDeviceLabel(device.label);
            return candidate===wanted||candidate.includes(wanted)||wanted.includes(candidate);
          });
          const currentId=stream.getAudioTracks()[0]?.getSettings().deviceId;
          if(matched&&matched.deviceId!==currentId){
            stopStream(stream);
            stream=await navigator.mediaDevices.getUserMedia({audio:audioConstraints(matched.deviceId),video:false});
            if(disposed){stopStream(stream);return;}
          }
        }

        const AudioContextCtor=window.AudioContext;
        context=new AudioContextCtor({latencyHint:'interactive'});
        if(context.state==='suspended')await context.resume().catch(()=>undefined);
        if(disposed){stopStream(stream);void context.close();return;}

        const source=context.createMediaStreamSource(stream);
        const analyser=context.createAnalyser();
        analyser.fftSize=256;
        analyser.smoothingTimeConstant=0;
        source.connect(analyser);
        const samples=new Float32Array(analyser.fftSize);
        let speaking=false;
        let quietSince=0;
        setActivity({speaking:false,available:true});

        timer=window.setInterval(()=>{
          if(disposed)return;
          analyser.getFloatTimeDomainData(samples);
          let sum=0;
          for(const sample of samples)sum+=sample*sample;
          const rms=Math.sqrt(sum/samples.length);
          const db=20*Math.log10(Math.max(rms,1e-7));
          const above=db>=thresholdDb;
          const now=performance.now();

          if(above){
            quietSince=0;
            if(!speaking){speaking=true;setActivity({speaking:true,available:true});}
            return;
          }
          if(!speaking)return;
          if(!quietSince)quietSince=now;
          if(now-quietSince>=70){
            speaking=false;
            quietSince=0;
            setActivity({speaking:false,available:true});
          }
        },15);
      }catch(error){
        console.warn('[desktop:voice] direct local mic meter unavailable; using LiveKit speaking state as fallback',error);
        if(!disposed)setActivity({speaking:false,available:false});
      }
    };

    void start();
    return()=>{
      disposed=true;
      if(timer!==null)window.clearInterval(timer);
      stopStream(stream);
      if(context)void context.close();
    };
  },[active,preferredLabel,preferences.autoGainControl,preferences.echoCancellation,preferences.noiseSuppression,thresholdDb]);

  return activity;
}

/**
 * One UI, two media engines:
 * - Browser build: LiveKit JS/WebRTC for audio + camera + screen share.
 * - Tauri desktop audio-only: Rust + native libwebrtc PlatformAudio/WASAPI.
 * - Tauri desktop with video/screen: transparently hands the same room to the
 *   full WebRTC media engine because WebView2 can capture/render video while
 *   the current native Rust voice bridge is audio-only.
 *
 * We never keep two room connections with the same identity alive at once.
 */
export function useVoiceRuntime(enabled:boolean,onError:(message:string)=>void,preferences:AppPreferences){
  const native=isDesktopNativeVoiceRuntime();
  const [desktopMediaMode,setDesktopMediaMode]=useState(false);
  const handoffRef=useRef<PendingHandoff|null>(null);
  const webVoice=useVoice(enabled&&(!native||desktopMediaMode),onError,preferences);
  const nativeVoice=useNativeVoice(enabled&&native&&!desktopMediaMode,onError,preferences);

  const activeVoice=desktopMediaMode?webVoice:nativeVoice;
  const selectedInputLabel=activeVoice.inputDevices.find(device=>device.deviceId===activeVoice.inputDeviceId)?.label||'';
  const localMeterActive=native&&enabled&&activeVoice.status==='connected'&&activeVoice.canSpeak&&!activeVoice.muted;
  const localActivity=useDesktopLocalMicActivity(localMeterActive,selectedInputLabel,preferences.noiseGateThreshold,preferences);

  const patchLocalSpeaking=useCallback((participants:VoiceParticipant[])=>participants.map(participant=>{
    if(!participant.local)return participant;
    if(!localMeterActive)return {...participant,speaking:false};
    return {...participant,speaking:localActivity.available?localActivity.speaking:participant.speaking};
  }),[localActivity.available,localActivity.speaking,localMeterActive]);

  const beginDesktopMediaMode=useCallback(async(action:MediaAction)=>{
    if(!native){
      if(action==='camera')await webVoice.toggleCamera();
      else if(action==='screen')await webVoice.toggleScreenShare();
      return;
    }
    if(desktopMediaMode){
      if(action==='camera')await webVoice.toggleCamera();
      else if(action==='screen')await webVoice.toggleScreenShare();
      return;
    }
    if(handoffRef.current)return;
    const channelId=nativeVoice.channelId;
    if(!channelId||nativeVoice.status==='disconnected'){
      onError('Önce bir ses kanalına bağlan.');
      return;
    }
    handoffRef.current={
      channelId,
      action,
      joinStarted:false,
      wasMuted:nativeVoice.muted,
      wasDeafened:nativeVoice.deafened,
    };
    // LiveKit identities are unique inside a room. Close the native connection
    // first, then reconnect with the full media engine to avoid duplicate/kick races.
    await nativeVoice.leave();
    setDesktopMediaMode(true);
  },[desktopMediaMode,native,nativeVoice.channelId,nativeVoice.deafened,nativeVoice.leave,nativeVoice.muted,nativeVoice.status,onError,webVoice.toggleCamera,webVoice.toggleScreenShare]);

  useEffect(()=>{
    if(!native||!desktopMediaMode)return;
    const pending=handoffRef.current;
    if(!pending)return;
    if(!pending.joinStarted){
      pending.joinStarted=true;
      void webVoice.join(pending.channelId);
      return;
    }
    if(webVoice.status!=='connected'||webVoice.channelId!==pending.channelId)return;
    handoffRef.current=null;
    void (async()=>{
      // Preserve the user's privacy state across the engine handoff.
      if(pending.wasDeafened&&!webVoice.deafened)await webVoice.toggleDeafen();
      else if(pending.wasMuted&&!webVoice.muted)await webVoice.toggleMute();
      if(pending.action==='camera')await webVoice.toggleCamera();
      else if(pending.action==='screen')await webVoice.toggleScreenShare();
    })();
  },[desktopMediaMode,native,webVoice.channelId,webVoice.deafened,webVoice.join,webVoice.muted,webVoice.status,webVoice.toggleCamera,webVoice.toggleDeafen,webVoice.toggleMute,webVoice.toggleScreenShare]);

  // Native audio knows when a remote participant publishes camera/screen tracks,
  // but it cannot render them. Switch once so incoming streams appear automatically.
  const remoteMediaActive=nativeVoice.participants.some(participant=>!participant.local&&(participant.camera||participant.screen));
  useEffect(()=>{
    if(native&&!desktopMediaMode&&nativeVoice.status==='connected'&&remoteMediaActive&&!handoffRef.current){
      void beginDesktopMediaMode(null);
    }
  },[beginDesktopMediaMode,desktopMediaMode,native,nativeVoice.status,remoteMediaActive]);

  const leave=useCallback(async()=>{
    handoffRef.current=null;
    if(!native){await webVoice.leave();return;}
    if(desktopMediaMode){
      await webVoice.leave();
      setDesktopMediaMode(false);
    }else{
      await nativeVoice.leave();
    }
  },[desktopMediaMode,native,nativeVoice.leave,webVoice.leave]);

  useEffect(()=>{
    if(!enabled){
      handoffRef.current=null;
      if(desktopMediaMode)setDesktopMediaMode(false);
    }
  },[desktopMediaMode,enabled]);

  if(!native)return webVoice;
  if(desktopMediaMode)return {...webVoice,participants:patchLocalSpeaking(webVoice.participants),leave};
  return {
    ...nativeVoice,
    participants:patchLocalSpeaking(nativeVoice.participants),
    leave,
    toggleCamera:()=>beginDesktopMediaMode('camera'),
    toggleScreenShare:()=>beginDesktopMediaMode('screen'),
  };
}
