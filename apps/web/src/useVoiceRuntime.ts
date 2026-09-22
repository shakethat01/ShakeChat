import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppPreferences } from './preferences';
import { useNativeVoice, isDesktopNativeVoiceRuntime } from './useNativeVoice';
import { useVoice } from './useVoice';

type MediaAction='camera'|'screen'|null;
type PendingHandoff={
  channelId:string;
  action:MediaAction;
  joinStarted:boolean;
  wasMuted:boolean;
  wasDeafened:boolean;
};

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
  if(desktopMediaMode)return {...webVoice,leave};
  return {
    ...nativeVoice,
    leave,
    toggleCamera:()=>beginDesktopMediaMode('camera'),
    toggleScreenShare:()=>beginDesktopMediaMode('screen'),
  };
}
