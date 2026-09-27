// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MicrophoneTest } from './MicrophoneTestSettingsBridge';
import { isMicrophoneTestActive, registerMicrophoneTestIsolation } from './microphoneTestIsolation';

vi.mock('./noiseGate',()=>({NoiseGateProcessor:class {
  processedTrack={id:'test-output'};
  init=vi.fn(async()=>{});destroy=vi.fn(async()=>{});setSettings=vi.fn();
}}));

let unregister=()=>{};
let capture:ReturnType<typeof vi.fn>;
let stop:ReturnType<typeof vi.fn>;
let contextCreated:ReturnType<typeof vi.fn>;
const graphNode=()=>({connect:vi.fn(),disconnect:vi.fn()});
beforeEach(()=>{
  localStorage.clear();
  stop=vi.fn();
  const track={label:'Test microphone',stop,applyConstraints:vi.fn(async()=>{})};
  capture=vi.fn(async()=>({getTracks:()=>[track],getAudioTracks:()=>[track]}));
  Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:capture}});
  contextCreated=vi.fn();
  vi.stubGlobal('AudioContext',class {
    state='running';
    constructor(){contextCreated()}
    close=vi.fn(async()=>{this.state='closed'});
    createMediaStreamSource=()=>graphNode();
    createAnalyser=()=>({...graphNode(),fftSize:512,smoothingTimeConstant:0,getFloatTimeDomainData:(samples:Float32Array)=>samples.fill(0)});
  });
  vi.stubGlobal('MediaStream',class {constructor(public tracks:unknown[]){} });
  vi.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(()=>{});
  vi.spyOn(HTMLMediaElement.prototype,'play').mockResolvedValue();
});
afterEach(async()=>{
  cleanup();
  await waitFor(()=>expect(isMicrophoneTestActive()).toBe(false));
  unregister();vi.restoreAllMocks();vi.unstubAllGlobals();
});

it('waits for room isolation before capturing and stops monitor/capture before restoring transmission',async()=>{
  let isolated!:()=>void;
  const pending=new Promise<void>(resolve=>{isolated=resolve});
  const order:string[]=[];
  const reconcile=vi.fn(async()=>{
    if(isMicrophoneTestActive()){order.push('isolate');await pending;}
    else {
      order.push(stop.mock.calls.length>0?'restore-after-stop':'restore-before-stop');
      order.push(document.querySelector('audio')?.srcObject?'monitor-still-live':'monitor-stopped');
    }
  });
  unregister=registerMicrophoneTestIsolation(reconcile);
  render(<MicrophoneTest/>);
  fireEvent.click(screen.getByRole('button',{name:'Mikrofon testini başlat'}));
  await waitFor(()=>expect(reconcile).toHaveBeenCalledTimes(1));
  expect(capture).not.toHaveBeenCalled();
  isolated();
  await screen.findByRole('button',{name:'Testi durdur'});
  fireEvent.click(screen.getByRole('checkbox'));
  await waitFor(()=>expect(document.querySelector('audio')?.srcObject).toBeTruthy());
  fireEvent.click(screen.getByRole('button',{name:'Testi durdur'}));
  await waitFor(()=>expect(isMicrophoneTestActive()).toBe(false));
  expect(order).toEqual(['isolate','restore-after-stop','monitor-stopped']);
});

it('stops a capture returned after settings were closed, without creating a late audio graph',async()=>{
  let finish!: (value:any)=>void;
  capture.mockImplementation(()=>new Promise(resolve=>{finish=resolve}));
  unregister=registerMicrophoneTestIsolation(async()=>{});
  const view=render(<MicrophoneTest/>);
  fireEvent.click(screen.getByRole('button',{name:'Mikrofon testini başlat'}));
  await waitFor(()=>expect(capture).toHaveBeenCalled());
  view.unmount();
  finish({getTracks:()=>[{stop}],getAudioTracks:()=>[{stop}]});
  await waitFor(()=>expect(stop).toHaveBeenCalledTimes(1));
  expect(contextCreated).not.toHaveBeenCalled();
});

it('releases isolation and allows retry when microphone permission is denied',async()=>{
  capture.mockRejectedValue(new Error('Mikrofon izni reddedildi'));
  unregister=registerMicrophoneTestIsolation(async()=>{});
  render(<MicrophoneTest/>);
  fireEvent.click(screen.getByRole('button',{name:'Mikrofon testini başlat'}));
  await screen.findByText('Mikrofon izni reddedildi');
  expect(isMicrophoneTestActive()).toBe(false);
  expect((screen.getByRole('button',{name:'Mikrofon testini başlat'}) as HTMLButtonElement).disabled).toBe(false);
});
