// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useLocalMicActivity } from './useLocalMicActivity';

let level=0;
let contexts:any[]=[];
class FakeContext {
  state='running';
  source={connect:vi.fn(),disconnect:vi.fn()};
  close=vi.fn(async()=>{this.state='closed'});
  resume=vi.fn(async()=>{this.state='running'});
  constructor(){contexts.push(this)}
  createMediaStreamSource=vi.fn(()=>this.source);
  createAnalyser(){return {fftSize:256,smoothingTimeConstant:0,getFloatTimeDomainData:(buffer:Float32Array)=>buffer.fill(level)}}
}
function microphone(){return Object.assign(new EventTarget(),{readyState:'live',enabled:true,muted:false,stop:vi.fn()}) as unknown as MediaStreamTrack}
beforeEach(()=>{
  vi.useFakeTimers();level=0;contexts=[];
  vi.stubGlobal('AudioContext',FakeContext);
  vi.stubGlobal('MediaStream',class {constructor(public tracks:MediaStreamTrack[]){} });
});
afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals()});

it('meters the existing track with a short hold and never stops capture on cleanup',async()=>{
  const track=microphone();
  const {result,unmount}=renderHook(()=>useLocalMicActivity(track,-48));
  await act(async()=>{});
  expect(result.current.available).toBe(true);
  expect(contexts[0].createMediaStreamSource.mock.calls[0][0].tracks).toEqual([track]);
  level=0.1;
  act(()=>{vi.advanceTimersByTime(15)});
  expect(result.current.speaking).toBe(true);
  level=0;
  act(()=>{vi.advanceTimersByTime(60)});
  expect(result.current.speaking).toBe(true);
  act(()=>{vi.advanceTimersByTime(15)});
  expect(result.current.speaking).toBe(false);
  unmount();
  expect(track.stop).not.toHaveBeenCalled();
  expect(contexts[0].close).toHaveBeenCalledTimes(1);
});

it('releases the old meter on device change and exposes fallback when the new track ends',async()=>{
  const first=microphone();const second=microphone();
  const {result,rerender}=renderHook(({track})=>useLocalMicActivity(track,-48),{initialProps:{track:first}});
  await act(async()=>{});
  rerender({track:second});
  await act(async()=>{});
  expect(contexts[0].close).toHaveBeenCalledTimes(1);
  expect(first.stop).not.toHaveBeenCalled();
  expect(contexts[1].createMediaStreamSource.mock.calls[0][0].tracks).toEqual([second]);
  act(()=>{second.dispatchEvent(new Event('ended'))});
  expect(result.current).toEqual({available:false,speaking:false});
  expect(second.stop).not.toHaveBeenCalled();
});
