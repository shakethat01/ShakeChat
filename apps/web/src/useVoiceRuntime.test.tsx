// @vitest-environment jsdom
import { act, cleanup, fireEvent, renderHook, screen as ui, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Room } from 'livekit-client';
import { DEFAULT_PREFERENCES } from './preferences';
import { useVoiceRuntime } from './useVoiceRuntime';
import { acquireMicrophoneTestIsolation, isMicrophoneTestActive } from './microphoneTestIsolation';

const state=vi.hoisted(()=>({rooms:[] as any[],screenPicker:null as null|(()=>Promise<void>), errors:vi.fn(), meter:vi.fn(), sounds:vi.fn(), micError:null as Error|null, native:vi.fn(), token:vi.fn(async()=>({url:'wss://test',token:'test',canSpeak:true}))}));
vi.mock('./voiceNotifications',()=>({playVoiceSound:(...args:any[])=>state.sounds(...args)}));
vi.mock('./api',()=>({api:{voiceToken:state.token},API_ORIGIN:'https://test',auth:{token:()=> 'session'}}));
vi.mock('@tauri-apps/api/core',()=>({invoke:(...args:any[])=>state.native(...args)}));
vi.mock('./useLocalMicActivity',()=>({useLocalMicActivity:(track:any)=>{
  state.meter(track);return {available:true,speaking:Boolean(track)};
}}));
// Importing or starting the native hook would reintroduce the second session.
vi.mock('./useNativeVoice',()=>({useNativeVoice:()=>{throw new Error('native handoff must not run')},isDesktopNativeVoiceRuntime:()=>true}));
vi.mock('./noiseGate',()=>({NoiseGateProcessor:class {
  name='shakechat-rnnoise-gate';setSettings=vi.fn();destroy=vi.fn();
}}));
vi.mock('livekit-client',()=>{
  const Source={Microphone:'microphone',Camera:'camera',ScreenShare:'screen',ScreenShareAudio:'screen_audio'};
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
    screenAudio:any;
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
        identity:'me',name:'Me',isLocal:true,isSpeaking:false,isMicrophoneEnabled:false,publishData:vi.fn(async()=>{}),
        getTrackPublication:(source:string)=>source===Source.Microphone?this.mic:source===Source.Camera?this.camera:source===Source.ScreenShareAudio?this.screenAudio:this.screen,
        setMicrophoneEnabled:vi.fn(async(enabled:boolean,capture:any)=>{
          if(enabled){
            if(state.micError)throw state.micError;
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
          if (enabled) {
            const audio:any = { isMuted:false, isUpstreamPaused:false };
            audio.pauseUpstream=vi.fn(async()=>{audio.isUpstreamPaused=true});
            audio.resumeUpstream=vi.fn(async()=>{audio.isUpstreamPaused=false});
            this.screenAudio=audio;
          } else this.screenAudio=undefined;
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
  vi.clearAllMocks();vi.spyOn(Room,'getLocalDevices');
  localStorage.clear();state.rooms=[];state.screenPicker=null;state.errors.mockClear();state.meter.mockClear();state.sounds.mockClear();
  state.micError=null;state.token.mockResolvedValue({url:'wss://test',token:'test',canSpeak:true});
  state.native.mockReset();
  state.native.mockImplementation(async(command:string)=>command==='native_screen_sources'?[{id:'1',title:'Ekran 1',kind:'screen'}]:undefined);
  (window as any).__TAURI_INTERNALS__={};
  HTMLDialogElement.prototype.showModal=vi.fn(function(this:HTMLDialogElement){this.open=true});HTMLDialogElement.prototype.close=vi.fn(function(this:HTMLDialogElement){this.open=false});
  vi.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(()=>{});
});
const testReleases:(()=>Promise<void>)[]=[];
afterEach(async()=>{for(const release of testReleases.splice(0))await act(async()=>{await release()});cleanup();await act(async()=>{await Promise.resolve()});vi.restoreAllMocks();vi.unstubAllGlobals();delete (window as any).__TAURI_INTERNALS__});
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

function addRemote(room:any, identity='friend') {
  const screen:any={source:'screen',isMuted:false,trackSid:`${identity}-screen`,setSubscribed:vi.fn(),isSubscribed:false};
  const audio:any={source:'screen_audio',isMuted:false,trackSid:`${identity}-audio`,setSubscribed:vi.fn()};
  const mic:any={source:'microphone',isMuted:false,trackSid:`${identity}-mic`,setSubscribed:vi.fn()};
  const publications=[screen,audio,mic];
  const participant={identity,name:identity,isLocal:false,isSpeaking:false,isMicrophoneEnabled:true,trackPublications:new Map(publications.map(pub=>[pub.trackSid,pub])),getTrackPublication:(source:string)=>publications.find(pub=>pub.source===source)};
  room.remoteParticipants.set(identity,participant);
  return {screen,audio,mic,participant};
}

it('discovers a screen without subscribing or reconnecting until the viewer opts in',async()=>{
  const {result}=await join();const room=state.rooms[0];const remote=addRemote(room);
  await act(async()=>{room.emit('TrackPublished',remote.screen,remote.participant)});
  expect(room.connect).toHaveBeenCalledWith('wss://test','test',{autoSubscribe:false});
  expect(result.current.availableScreens).toHaveLength(1);
  expect(result.current.videoTracks).toHaveLength(0);
  expect(remote.screen.setSubscribed).toHaveBeenLastCalledWith(false);
  expect(remote.audio.setSubscribed).toHaveBeenLastCalledWith(false);
  expect(remote.mic.setSubscribed).toHaveBeenLastCalledWith(true);
  await act(async()=>{result.current.setScreenWatching('friend',true)});
  expect(remote.screen.setSubscribed).toHaveBeenLastCalledWith(true);
  expect(remote.audio.setSubscribed).toHaveBeenLastCalledWith(true);
  expect(room.disconnect).not.toHaveBeenCalled();expect(state.rooms).toHaveLength(1);
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
  expect(JSON.parse(localStorage.getItem('shakechat.voice-devices.v1')!).audioinput).toBe('unplugged');
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

async function beginTest() {
  let release!:()=>Promise<void>;
  await act(async()=>{release=await acquireMicrophoneTestIsolation()});
  testReleases.push(release);
  return release;
}

it('isolates the mic and system-loopback monitor, then restores both without rejoining',async()=>{
  const {result}=await join();
  const room=state.rooms[0];
  await act(async()=>{await result.current.toggleScreenShare()});
  const video=room.screen;
  const release=await beginTest();
  expect(room.mic.isMuted).toBe(true);
  expect(room.screenAudio.isUpstreamPaused).toBe(true);
  expect(room.screen).toBe(video);
  expect(result.current.microphoneTestActive).toBe(true);
  await act(async()=>{await result.current.switchInput('mic-2');await result.current.toggleMute();await result.current.toggleMute()});
  expect(room.mic.isMuted).toBe(true);
  await act(async()=>{await release()});
  expect(room.mic.isMuted).toBe(false);
  expect(room.screenAudio.isUpstreamPaused).toBe(false);
  expect(result.current.inputDeviceId).toBe('mic-2');
  expect(room.disconnect).not.toHaveBeenCalled();
});

it('keeps an explicit mute selected during a test and never reopens after deafen',async()=>{
  const {result}=await join();
  const room=state.rooms[0];
  let release=await beginTest();
  await act(async()=>{await result.current.toggleMute();await release()});
  expect(room.mic.isMuted).toBe(true);
  await act(async()=>{await result.current.toggleMute()});
  release=await beginTest();
  await act(async()=>{await result.current.toggleDeafen();await release()});
  expect(room.mic.isMuted).toBe(true);
});

it('blocks PTT and a new screen share during an isolated test',async()=>{
  const {result}=await join({...DEFAULT_PREFERENCES,voiceInputMode:'push_to_talk'});
  const release=await beginTest();
  await act(async()=>{window.dispatchEvent(new KeyboardEvent('keydown',{code:DEFAULT_PREFERENCES.pushToTalkKey}));await result.current.toggleScreenShare()});
  const room=state.rooms[0];
  expect(room.localParticipant.isMicrophoneEnabled).toBe(false);
  expect(room.localParticipant.setScreenShareEnabled).not.toHaveBeenCalled();
  await act(async()=>{await release()});
  expect(room.localParticipant.isMicrophoneEnabled).toBe(false);
});

it('does not start a test while the screen picker can publish a new system-audio track',async()=>{
  const {result}=await join();
  let finish!:()=>void;
  state.screenPicker=()=>new Promise<void>(resolve=>{finish=resolve});
  let sharing!:Promise<void>;
  act(()=>{sharing=result.current.toggleScreenShare()});
  await act(async()=>{await expect(acquireMicrophoneTestIsolation()).rejects.toThrow('seçimini bitirdikten')});
  expect(isMicrophoneTestActive()).toBe(false);
  await act(async()=>{finish();await sharing});
});

it('serializes rapid device switches and rolls back a failed acquisition before the next one',async()=>{
  const {result}=await join();
  const room=state.rooms[0];
  let finish!:()=>void;
  const entered:string[]=[];
  room.switchActiveDevice.mockImplementation(async(kind:string,id:string)=>{
    entered.push(id);
    if(entered.length===1){await new Promise<void>(resolve=>{finish=resolve});throw new Error('device lost')}
    room.active[kind]=id;return true;
  });
  let first!:Promise<void>,second!:Promise<void>;
  await act(async()=>{first=result.current.switchInput('mic-2');second=result.current.switchInput('default');await Promise.resolve()});
  expect(entered).toEqual(['mic-2']);
  await act(async()=>{finish();await first;await second});
  expect(entered).toEqual(['mic-2','default','default']);
  expect(result.current.inputDeviceId).toBe('default');
  expect(room.localParticipant.isMicrophoneEnabled).toBe(true);
  expect(room.disconnect).not.toHaveBeenCalled();
});

function remoteAudio(id:string) {
  const element=document.createElement('audio');
  return {kind:'audio',sid:id,attach:vi.fn(()=>element),detach:vi.fn(),setVolume:vi.fn(),element};
}

it('controls mic and stream gain separately, deduplicates playback and preserves gain across deafen',async()=>{
  const {result}=await join();
  const room=state.rooms[0];
  const mic=remoteAudio('mic'),stream=remoteAudio('stream');
  addRemote(room,'bob');
  await act(async()=>{result.current.setScreenWatching('bob',true)});
  await act(async()=>{
    room.emit('TrackSubscribed',mic,{trackSid:'mic',source:'microphone'},{identity:'bob'});
    room.emit('TrackSubscribed',stream,{trackSid:'stream',source:'screen_audio'},{identity:'bob'});
    room.emit('TrackSubscribed',stream,{trackSid:'stream',source:'screen_audio'},{identity:'bob'});
    result.current.setParticipantVolume('bob',25);result.current.setScreenVolume('bob',65);
  });
  expect(stream.attach).toHaveBeenCalledTimes(1);
  expect(mic.setVolume).toHaveBeenLastCalledWith(.25);
  expect(stream.setVolume).toHaveBeenLastCalledWith(.65);
  await act(async()=>{result.current.toggleParticipantLocalMute('bob')});
  expect(mic.setVolume).toHaveBeenLastCalledWith(0);
  expect(stream.setVolume).toHaveBeenLastCalledWith(.65);
  await act(async()=>{await result.current.toggleDeafen()});
  expect(stream.setVolume).toHaveBeenLastCalledWith(0);
  await act(async()=>{await result.current.toggleDeafen()});
  expect(mic.setVolume).toHaveBeenLastCalledWith(0);
  expect(stream.setVolume).toHaveBeenLastCalledWith(.65);
  await act(async()=>{result.current.toggleScreenLocalMute('bob');result.current.toggleParticipantLocalMute('bob')});
  expect(mic.setVolume).toHaveBeenLastCalledWith(.25);
  expect(stream.setVolume).toHaveBeenLastCalledWith(0);
  await act(async()=>{await result.current.leave()});
  expect(mic.detach).toHaveBeenCalledTimes(1);
  expect(stream.detach).toHaveBeenCalledTimes(1);
  expect(document.body.contains(stream.element)).toBe(false);
});

it('does not mute or stop a published screen-audio track when the publisher mutes or deafens',async()=>{
  const {result}=await join();
  await act(async()=>{await result.current.toggleScreenShare()});
  const room=state.rooms[0],audio=room.screenAudio,video=room.screen;
  await act(async()=>{await result.current.toggleMute()});
  await act(async()=>{await result.current.toggleDeafen()});
  expect(audio.pauseUpstream).not.toHaveBeenCalled();
  expect(audio.isMuted).toBe(false);
  expect(room.screen).toBe(video);
});


it('stops both stream tracks immediately and rejects late audio after stop watching',async()=>{
  const {result}=await join();const room=state.rooms[0],remote=addRemote(room,'bob'),audio=remoteAudio('stream');
  await act(async()=>{result.current.setScreenWatching('bob',true);room.emit('TrackSubscribed',audio,remote.audio,remote.participant)});
  expect(document.body.contains(audio.element)).toBe(true);
  await act(async()=>{result.current.setScreenWatching('bob',false)});
  expect(remote.screen.setSubscribed).toHaveBeenLastCalledWith(false);
  expect(remote.audio.setSubscribed).toHaveBeenLastCalledWith(false);
  expect(document.body.contains(audio.element)).toBe(false);
  await act(async()=>{room.emit('TrackSubscribed',audio,remote.audio,remote.participant)});
  expect(audio.attach).toHaveBeenCalledTimes(1);
  expect(result.current.watchingScreens).toEqual([]);
});

it('counts each actual viewer once and ignores messages for an old screen',async()=>{
  const {result}=await join();const room=state.rooms[0];
  await act(async()=>{await result.current.toggleScreenShare()});
  const remote=addRemote(room,'bob');state.sounds.mockClear();
  const emit=(data:any)=>room.emit('DataReceived',new TextEncoder().encode(JSON.stringify(data)),remote.participant,undefined,'shakechat.watch.v1');
  await act(async()=>{emit({type:'watch',sid:'old-screen',watching:true});emit({type:'watch',sid:'screen',watching:true});emit({type:'watch',sid:'screen',watching:true})});
  expect(result.current.screenViewers).toEqual(['bob']);
  expect(state.sounds).toHaveBeenCalledTimes(1);expect(state.sounds.mock.calls[0][0]).toBe('viewer');
  await act(async()=>{emit({type:'watch',sid:'screen',watching:false})});
  expect(result.current.screenViewers).toEqual([]);
});

it('retains selected devices when enumeration is temporarily empty',async()=>{
  localStorage.setItem('shakechat.voice-devices.v1',JSON.stringify({audioinput:'mic-2',audiooutput:'speaker-2'}));
  const get=vi.spyOn(Room,'getLocalDevices').mockResolvedValue([]);
  const first=await join();expect(first.result.current.status).toBe('connected');
  expect(JSON.parse(localStorage.getItem('shakechat.voice-devices.v1')!)).toEqual({audioinput:'mic-2',audiooutput:'speaker-2'});
  first.unmount();get.mockRestore();
  const second=await join();expect(second.result.current.inputDeviceId).toBe('mic-2');expect(second.result.current.outputDeviceId).toBe('speaker-2');
});

it('disables duplicate browser noise suppression while RNNoise stays enabled',async()=>{
  await join();const room=state.rooms[0];
  expect(room.options.audioCaptureDefaults.noiseSuppression).toBe(false);
  expect(room.mic.track.applyConstraints).toHaveBeenLastCalledWith({echoCancellation:true,noiseSuppression:false,autoGainControl:false});
  expect(room.mic.track.getProcessor().name).toBe('shakechat-rnnoise-gate');
});


it('keeps an authorized member listening after microphone permission denial and retries in the same room',async()=>{
  state.micError=new DOMException('Permission denied','NotAllowedError');
  const {result}=await join();const room=state.rooms[0];
  expect(result.current.status).toBe('connected');
  expect(result.current.microphonePermissionDenied).toBe(true);
  expect(result.current.muted).toBe(true);
  expect(room.startAudio).toHaveBeenCalled();expect(room.disconnect).not.toHaveBeenCalled();
  expect(Room.getLocalDevices).not.toHaveBeenCalledWith('audioinput',true);
  state.micError=null;
  await act(async()=>{await result.current.toggleMute()});
  expect(result.current.muted).toBe(false);expect(result.current.microphoneError).toBe('');
  expect(state.rooms).toHaveLength(1);
});

it('does not ask listen-only members for microphone permission or grant them publishing',async()=>{
  state.token.mockResolvedValueOnce({url:'wss://test',token:'test',canSpeak:false});
  const {result}=await join();const room=state.rooms[0];
  expect(result.current.status).toBe('connected');expect(result.current.canSpeak).toBe(false);
  expect(room.localParticipant.setMicrophoneEnabled).not.toHaveBeenCalled();
  expect(Room.getLocalDevices).not.toHaveBeenCalledWith('audioinput',true);
  await act(async()=>{await result.current.toggleMute()});
  expect(room.localParticipant.isMicrophoneEnabled).toBe(false);
});

it('still rejects a server-side channel permission denial',async()=>{
  state.token.mockRejectedValueOnce(new Error('Bu ses kanalına bağlanma yetkin yok.'));
  const {result}=await join();
  expect(result.current.status).toBe('disconnected');expect(state.rooms).toHaveLength(0);
  expect(state.errors).toHaveBeenCalledWith('Bu ses kanalına bağlanma yetkin yok.');
});

it('survives unavailable device enumeration without clearing the saved device choice',async()=>{
  vi.spyOn(Room,'getLocalDevices').mockRejectedValue(new DOMException('Permission denied','NotAllowedError'));
  localStorage.setItem('shakechat.voice-devices.v1',JSON.stringify({audioinput:'mic-2',audiooutput:'speaker-2'}));
  state.micError=new DOMException('Permission denied','NotAllowedError');
  const {result}=await join();
  expect(result.current.status).toBe('connected');
  expect(JSON.parse(localStorage.getItem('shakechat.voice-devices.v1')!).audioinput).toBe('mic-2');
});

it('merges native publishers for browser viewers and preserves separate microphone/stream volume',async()=>{
  const {result}=await join();const room=state.rooms[0];
  const bob=addRemote(room,'bob'),native=addRemote(room,'screen:bob');
  room.remoteParticipants.get('bob').getTrackPublication=(source:string)=>source==='microphone'?bob.mic:undefined;
  await act(async()=>{room.emit('TrackPublished',native.screen,native.participant)});
  expect(result.current.participants.map(p=>p.identity)).toEqual(['me','bob']);
  expect(result.current.availableScreens[0].identity).toBe('bob');
  expect(native.audio.setSubscribed).toHaveBeenLastCalledWith(false);
  const mic=remoteAudio('mic'),audio=remoteAudio('native');
  await act(async()=>{
    result.current.setScreenWatching('bob',true);
    room.emit('TrackSubscribed',mic,bob.mic,bob.participant);
    room.emit('TrackSubscribed',audio,native.audio,native.participant);
    result.current.setParticipantVolume('bob',25);result.current.setScreenVolume('bob',65);
  });
  expect(native.audio.setSubscribed).toHaveBeenLastCalledWith(true);
  expect(mic.setVolume).toHaveBeenLastCalledWith(.25);expect(audio.setVolume).toHaveBeenLastCalledWith(.65);
  await act(async()=>{result.current.setScreenWatching('bob',false)});
  expect(native.audio.setSubscribed).toHaveBeenLastCalledWith(false);expect(audio.detach).toHaveBeenCalledTimes(1);
});

it('previews native video without ever subscribing to or playing its own system audio',async()=>{
  const {result}=await join();const room=state.rooms[0],native=addRemote(room,'screen:me'),audio=remoteAudio('self');
  native.screen.track={};state.sounds.mockClear();
  await act(async()=>{room.emit('ParticipantConnected',native.participant);room.emit('TrackPublished',native.screen,native.participant)});
  expect(native.screen.setSubscribed).toHaveBeenLastCalledWith(true);
  expect(native.audio.setSubscribed).toHaveBeenLastCalledWith(false);
  expect(result.current.videoTracks[0]).toMatchObject({identity:'me',local:true,native:true});
  await act(async()=>{room.emit('TrackSubscribed',audio,native.audio,native.participant)});
  expect(audio.attach).not.toHaveBeenCalled();
  expect(state.sounds.mock.calls.filter(call=>call[0]==='join')).toHaveLength(0);
});

it('routes native viewer notifications to the owner, validates the SID and never counts the preview',async()=>{
  const {result}=await join();const room=state.rooms[0];
  const native=addRemote(room,'screen:me'),bob=addRemote(room,'bob');
  await act(async()=>{room.emit('TrackPublished',native.screen,native.participant)});
  state.sounds.mockClear();
  const emit=(participant:any,sid:string)=>room.emit('DataReceived',new TextEncoder().encode(JSON.stringify({type:'watch',sid,watching:true})),participant,undefined,'shakechat.watch.v1');
  await act(async()=>{emit(native.participant,native.screen.trackSid);emit(bob.participant,'stale');emit(bob.participant,native.screen.trackSid);emit(bob.participant,native.screen.trackSid)});
  expect(result.current.screenViewers).toEqual(['bob']);expect(state.sounds).toHaveBeenCalledTimes(1);
  const other=addRemote(room,'screen:other');
  await act(async()=>{room.emit('TrackPublished',other.screen,other.participant)});
  await act(async()=>{result.current.setScreenWatching('other',true);room.emit('TrackSubscribed',{kind:'video'},other.screen,other.participant)});
  const last=room.localParticipant.publishData.mock.calls.at(-1);
  expect(last[1].destinationIdentities).toEqual(['other']);
  expect(JSON.parse(new TextDecoder().decode(last[0]))).toMatchObject({sid:other.screen.trackSid,watching:true});
});

async function joinDesktop(){
  (window as any).__TAURI_INTERNALS__={invoke:vi.fn()};
  vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({url:'wss://test',token:'native-token'})})));
  return join();
}
async function startNative(result:any){
  let sharing!:Promise<void>;
  await act(async()=>{sharing=result.current.toggleScreenShare();await Promise.resolve()});
  await ui.findByRole('button',{name:/Ekran 1/});
  await act(async()=>{fireEvent.click(ui.getByRole('button',{name:/Ekran 1/}));await sharing});
}

it('waits for both native audio and microphone isolation before starting a test',async()=>{
  const {result}=await joinDesktop();await startNative(result);
  expect(result.current.screenSharing).toBe(true);
  let finish!:()=>void;const invoked=state.native.getMockImplementation()!;
  state.native.mockImplementation((command:string,args:any)=>command==='native_screen_audio_pause'&&args.paused?new Promise<void>(resolve=>{finish=resolve}):invoked(command,args));
  let isolation!:Promise<()=>Promise<void>>,completed=false;
  await act(async()=>{isolation=acquireMicrophoneTestIsolation().then(release=>{completed=true;testReleases.push(release);return release});await Promise.resolve()});
  expect(completed).toBe(false);expect(state.rooms[0].mic.isMuted).toBe(true);
  await act(async()=>{finish();await isolation});
  expect(completed).toBe(true);expect(result.current.screenSharing).toBe(true);
  await act(async()=>{await (await isolation)()});
  expect(state.native).toHaveBeenCalledWith('native_screen_audio_pause',{paused:false});
});

it('blocks microphone monitoring if native audio cannot be isolated',async()=>{
  const {result}=await joinDesktop();await startNative(result);
  state.native.mockImplementation(async(command:string,args:any)=>{if(command==='native_screen_audio_pause'&&args.paused)throw new Error('audio pause failed')});
  await act(async()=>{await expect(acquireMicrophoneTestIsolation()).rejects.toThrow('audio pause failed')});
  expect(isMicrophoneTestActive()).toBe(false);
});

it('cancels an open native picker when leaving the voice channel',async()=>{
  const {result}=await joinDesktop();let sharing!:Promise<void>;
  await act(async()=>{sharing=result.current.toggleScreenShare();await Promise.resolve()});
  await ui.findByRole('button',{name:/Ekran 1/});
  await act(async()=>{await result.current.leave();await sharing});
  expect(document.querySelector('dialog')).toBeNull();
  expect(state.native.mock.calls.some(call=>call[0]==='native_screen_start')).toBe(false);
  expect(result.current.screenSharing).toBe(false);
});

it('cleans up a native start that completes after leaving and rejects duplicate starts',async()=>{
  const {result}=await joinDesktop();let finish!:()=>void;
  const invoked=state.native.getMockImplementation()!;
  state.native.mockImplementation((command:string,args:any)=>command==='native_screen_start'?new Promise<void>(resolve=>{finish=resolve}):invoked(command,args));
  let sharing!:Promise<void>,leaving!:Promise<void>;
  await act(async()=>{sharing=result.current.toggleScreenShare();await result.current.toggleScreenShare()});
  await ui.findByRole('button',{name:/Ekran 1/});
  await act(async()=>{fireEvent.click(ui.getByRole('button',{name:/Ekran 1/}));await Promise.resolve()});
  await waitFor(()=>expect(finish).toBeTypeOf('function'));
  act(()=>{leaving=result.current.leave()});
  await act(async()=>{finish();await sharing;await leaving});
  expect(state.native.mock.calls.filter(call=>call[0]==='native_screen_start')).toHaveLength(1);
  expect(state.native.mock.calls.at(-1)?.[0]).toBe('native_screen_stop');
  expect(result.current.screenSharing).toBe(false);expect(result.current.status).toBe('disconnected');
});

it('updates native quality in place and preserves previous settings if the update fails',async()=>{
  const {result}=await joinDesktop();await startNative(result);
  await act(async()=>{await result.current.changeScreenSettings({height:720,fps:30})});
  expect(state.native).toHaveBeenCalledWith('native_screen_update',expect.objectContaining({height:720,fps:30}));
  expect(state.native.mock.calls.filter(call=>call[0]==='native_screen_start')).toHaveLength(1);
  expect(state.rooms[0].disconnect).not.toHaveBeenCalled();
  state.native.mockRejectedValueOnce(new Error('source lost'));
  await act(async()=>{await result.current.changeScreenSettings({height:1440,fps:60})});
  expect(result.current.screenSettings).toEqual({height:720,fps:30});expect(result.current.screenSharing).toBe(true);
});
