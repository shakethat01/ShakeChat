// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_PREFERENCES } from './preferences';
import { useVoiceRuntime } from './useVoiceRuntime';

const state=vi.hoisted(()=>({rooms:[] as any[],screenPicker:null as null|(()=>Promise<void>), errors:vi.fn(), meter:vi.fn()}));
vi.mock('./api',()=>({api:{voiceToken:vi.fn(async()=>({url:'wss://test',token:'test',canSpeak:true}))}}));
vi.mock('./useLocalMicActivity',()=>({useLocalMicActivity:(track:any)=>{
  state.meter(track);return {available:true,speaking:Boolean(track)};
}}));
// Importing or starting the native hook would reintroduce the second session.
vi.mock('./useNativeVoice',()=>({useNativeVoice:()=>{throw new Error('native handoff must not run')},isDesktopNativeVoiceRuntime:()=>true}));
vi.mock('./noiseGate',()=>({NoiseGateProcessor:class {
  name='shakechat-rnnoise-gate';setSettings=vi.fn();destroy=vi.fn();
}}));
vi.mock('livekit-client',()=>{
  const Source={Microphone:'microphone',Camera:'camera',ScreenShare:'screen'};
  class LocalAudioTrack {
    mediaStreamTrack={id:'published-filtered-track'};
    processor:any;
    applyConstraints=vi.fn(async()=>{});
    getProcessor(){return this.processor}
    setProcessor=vi.fn(async(p:any)=>{this.processor=p});
  }
  class Room {
    handlers=new Map<string,Function[]>();
    remoteParticipants=new Map();
    options:any;
    active:any;
    mic:any;
    camera:any;
    screen:any;
    localParticipant:any;
    connect=vi.fn(async()=>{});
    disconnect=vi.fn(async()=>{});
    startAudio=vi.fn(async()=>{});
    static getLocalDevices=vi.fn(async(kind:string)=>{
      const ids=kind==='audioinput'?['default','mic-2']:kind==='audiooutput'?['default','speaker-2']:['camera'];
      return ids.map(deviceId=>({deviceId,kind,label:deviceId}));
    });
    constructor(options:any){
      this.options=options;
      this.active={audioinput:options.audioCaptureDefaults.deviceId||'default',audiooutput:options.audioOutput?.deviceId||'default',videoinput:'camera'};
      this.localParticipant={
        identity:'me',name:'Me',isLocal:true,isSpeaking:false,isMicrophoneEnabled:false,
        getTrackPublication:(source:string)=>source===Source.Microphone?this.mic:source===Source.Camera?this.camera:this.screen,
        setMicrophoneEnabled:vi.fn(async(enabled:boolean,capture:any)=>{
          if(enabled){
            this.mic ||= {track:new LocalAudioTrack(),isMuted:false};
            if(capture?.deviceId)this.active.audioinput=capture.deviceId.exact;
          }
          if(this.mic)this.mic.isMuted=!enabled;
          this.localParticipant.isMicrophoneEnabled=enabled;
          this.emit(enabled?'TrackUnmuted':'TrackMuted');
          return this.mic;
        }),
        setCameraEnabled:vi.fn(async(enabled:boolean)=>{this.camera=enabled?{track:{},isMuted:false,trackSid:'camera'}:undefined}),
        setScreenShareEnabled:vi.fn(async(enabled:boolean)=>{
          if(state.screenPicker)await state.screenPicker();
          this.screen=enabled?{track:{},isMuted:false,trackSid:'screen'}:undefined;
          return this.screen;
        }),
      };
      state.rooms.push(this);
    }
    on(name:string,fn:Function){this.handlers.set(name,[...(this.handlers.get(name)||[]),fn]);return this}
    emit(name:string,...args:any[]){for(const fn of this.handlers.get(name)||[])fn(...args)}
    getActiveDevice(kind:string){return this.active[kind]}
    switchActiveDevice=vi.fn(async(kind:string,id:string)=>{this.active[kind]=id;return true});
  }
  return {Room,LocalAudioTrack,LocalTrackPublication:class{},RemoteTrackPublication:class{},Participant:class{},TrackPublication:class{},VideoQuality:{HIGH:'high'},Track:{Source,Kind:{Audio:'audio'}},RoomEvent:new Proxy({}, {get:(_,key)=>key})};
});

beforeEach(()=>{
  localStorage.clear();state.rooms=[];state.screenPicker=null;state.errors.mockClear();state.meter.mockClear();
  (window as any).__TAURI_INTERNALS__={};
});
afterEach(()=>{cleanup();delete (window as any).__TAURI_INTERNALS__});
async function join(preferences=DEFAULT_PREFERENCES){
  const hook=renderHook(()=>useVoiceRuntime(true,state.errors,preferences));
  await act(async()=>{await hook.result.current.join('room')});
  return hook;
}

it('uses RNNoise from the first join and keeps one session, mic and devices through screen/camera changes',async()=>{
  const {result}=await join();
  const room=state.rooms[0];
  const mic=room.mic.track;
  expect(mic.getProcessor().name).toBe('shakechat-rnnoise-gate');
  expect(result.current.muted).toBe(false);
  expect(state.meter).toHaveBeenLastCalledWith(mic.mediaStreamTrack);
  await act(async()=>{await result.current.switchInput('mic-2');await result.current.switchOutput('speaker-2')});
  const microphoneCalls=room.localParticipant.setMicrophoneEnabled.mock.calls.length;
  await act(async()=>{await result.current.toggleScreenShare()});
  await act(async()=>{await result.current.toggleCamera()});
  await act(async()=>{await result.current.toggleScreenShare()});
  expect(state.rooms).toHaveLength(1);
  expect(room.disconnect).not.toHaveBeenCalled();
  expect(room.mic.track).toBe(mic);
  expect(room.localParticipant.setMicrophoneEnabled).toHaveBeenCalledTimes(microphoneCalls);
  expect(result.current.muted).toBe(false);
  expect(result.current.inputDeviceId).toBe('mic-2');
  expect(result.current.outputDeviceId).toBe('speaker-2');
  expect(state.errors).not.toHaveBeenCalled();
});

it('does not reconnect a viewer when a remote participant starts sharing',async()=>{
  const {result}=await join();
  const room=state.rooms[0];
  room.remoteParticipants.set('friend',{identity:'friend',name:'Friend',isLocal:false,isSpeaking:false,isMicrophoneEnabled:true,
    getTrackPublication:(source:string)=>source==='screen'?{track:{},isMuted:false,trackSid:'remote-screen'}:undefined});
  await act(async()=>{room.emit('TrackPublished')});
  expect(result.current.videoTracks).toHaveLength(1);
  expect(room.disconnect).not.toHaveBeenCalled();
  expect(state.rooms).toHaveLength(1);
});

it('does not undo a mute selected while the screen picker is open',async()=>{
  const {result}=await join();
  let finish!:()=>void;
  state.screenPicker=()=>new Promise<void>(resolve=>{finish=resolve});
  let sharing!:Promise<void>;
  act(()=>{sharing=result.current.toggleScreenShare()});
  await act(async()=>{await result.current.toggleMute()});
  await act(async()=>{finish();await sharing});
  expect(result.current.muted).toBe(true);
  expect(state.rooms[0].mic.isMuted).toBe(true);
});

it('does not undo an unmute selected while the screen picker is open',async()=>{
  const {result}=await join();
  await act(async()=>{await result.current.toggleMute()});
  let finish!:()=>void;
  state.screenPicker=()=>new Promise<void>(resolve=>{finish=resolve});
  let sharing!:Promise<void>;
  act(()=>{sharing=result.current.toggleScreenShare()});
  await act(async()=>{await result.current.toggleMute()});
  await act(async()=>{finish();await sharing});
  expect(result.current.muted).toBe(false);
  expect(state.rooms[0].mic.isMuted).toBe(false);
});

it('restores selected devices and explicit mute after leaving and mounting again',async()=>{
  const first=await join();
  await act(async()=>{await first.result.current.switchInput('mic-2');await first.result.current.switchOutput('speaker-2');await first.result.current.toggleMute()});
  first.unmount();
  const second=await join();
  const room=state.rooms[1];
  expect(second.result.current.muted).toBe(true);
  expect(room.localParticipant.setMicrophoneEnabled).not.toHaveBeenCalledWith(true,expect.anything(),expect.anything());
  expect(second.result.current.inputDeviceId).toBe('mic-2');
  expect(second.result.current.outputDeviceId).toBe('speaker-2');
  await act(async()=>{await second.result.current.toggleMute()});
  expect(room.mic.track.getProcessor().name).toBe('shakechat-rnnoise-gate');
});

it('keeps previous device on failed switch and falls back when saved devices are missing',async()=>{
  localStorage.setItem('shakechat.voice-devices.v1',JSON.stringify({audioinput:'unplugged',audiooutput:'unplugged'}));
  const {result}=await join();
  const room=state.rooms[0];
  expect(result.current.inputDeviceId).toBe('default');
  expect(result.current.outputDeviceId).toBe('default');
  room.switchActiveDevice.mockResolvedValueOnce(false);
  await act(async()=>{await result.current.switchInput('mic-2')});
  expect(result.current.inputDeviceId).toBe('default');
  expect(JSON.parse(localStorage.getItem('shakechat.voice-devices.v1')!).audioinput).toBe('');
  expect(state.errors).toHaveBeenCalled();
});

it('attaches RNNoise on the first push-to-talk press, then mutes on release',async()=>{
  const {result}=await join({...DEFAULT_PREFERENCES,voiceInputMode:'push_to_talk'});
  expect(result.current.muted).toBe(true);
  await act(async()=>{window.dispatchEvent(new KeyboardEvent('keydown',{code:DEFAULT_PREFERENCES.pushToTalkKey}))});
  expect(state.rooms[0].mic.track.getProcessor().name).toBe('shakechat-rnnoise-gate');
  expect(result.current.muted).toBe(false);
  await act(async()=>{window.dispatchEvent(new KeyboardEvent('keyup',{code:DEFAULT_PREFERENCES.pushToTalkKey}))});
  expect(result.current.muted).toBe(true);
});
