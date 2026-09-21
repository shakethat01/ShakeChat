// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state=vi.hoisted(()=>({handlers:new Map<string,Set<(...args:any[])=>void>>(),connected:true,history:vi.fn(),sent:[] as any[]}));
const socket={
 get connected(){return state.connected},
 on(name:string,fn:(...args:any[])=>void){if(!state.handlers.has(name))state.handlers.set(name,new Set());state.handlers.get(name)!.add(fn);return socket},
 off(name:string,fn:(...args:any[])=>void){state.handlers.get(name)?.delete(fn);return socket},
 timeout(){return socket},
 emit(name:string,data:any,callback?:any){state.sent.push({name,data});if(callback)callback(null,name==='server:join'?{ok:true,members:[]}:{ok:true});return socket},
 connect(){state.connected=true;fire('connect')},
};
vi.mock('./socket',()=>({chatSocket:()=>socket}));
vi.mock('./api',()=>({api:{messages:(id:string)=>state.history(id)}}));
import { mergeMessages, useChat } from './useChat';
const message=(id:string,channelId='one')=>({id,channelId,content:id,createdAt:'2026-09-09T10:00:00.000Z',author:{id:'bob',username:'bob'}});
function fire(name:string,...args:any[]){for(const fn of state.handlers.get(name)||[])fn(...args)}
afterEach(()=>{cleanup();vi.useRealTimers()});
beforeEach(()=>{state.handlers.clear();state.sent=[];state.connected=true;state.history.mockReset().mockResolvedValue([])});
describe('realtime frontend state',()=>{
 it('merges duplicate HTTP/event responses and retains messages received during loading',async()=>{
  let finish!:(v:any)=>void;state.history.mockImplementation(()=>new Promise(resolve=>{finish=resolve}));
  const {result}=renderHook(()=>useChat(true,'server','one','alice',()=>{}));
  act(()=>fire('message:new',message('live')));await act(async()=>finish([message('history')]));
  act(()=>result.current.appendSent(message('live')));
  expect(result.current.messages.map(m=>m.id)).toEqual(['history','live']);
 });
 it('discards stale history and send responses after channel switch',async()=>{
  let finish!:(v:any)=>void;state.history.mockImplementation((id:string)=>id==='one'?new Promise(resolve=>{finish=resolve}):Promise.resolve([message('right','two')]));
  const {result,rerender}=renderHook(({channel})=>useChat(true,'server',channel,'alice',()=>{}),{initialProps:{channel:'one'}});
  rerender({channel:'two'});await waitFor(()=>expect(result.current.messages).toHaveLength(1));
  await act(async()=>finish([message('wrong')]));act(()=>result.current.appendSent(message('late-send')));
  expect(result.current.messages.map(m=>m.id)).toEqual(['right']);
 });
 it('rejoins and fetches missed history on reconnect',async()=>{
  const {result}=renderHook(()=>useChat(true,'server','one','alice',()=>{}));await waitFor(()=>expect(result.current.loading).toBe(false));
  act(()=>{state.connected=false;fire('disconnect')});state.history.mockResolvedValue([message('offline-message')]);
  act(()=>{state.connected=true;fire('connect')});await waitFor(()=>expect(result.current.messages.map(m=>m.id)).toContain('offline-message'));
  expect(state.sent.filter(e=>e.name==='channel:join')).toHaveLength(2);
 });
 it('expires typing locally when stop event is lost; ignores own typing',async()=>{
  vi.useFakeTimers();const {result}=renderHook(()=>useChat(true,'server','one','alice',()=>{}));
  await act(async()=>{});
  act(()=>{fire('typing',{channelId:'one',userId:'alice',username:'alice',typing:true});fire('typing',{channelId:'one',userId:'bob',username:'bob',typing:true})});
  expect(result.current.typingUsers).toEqual(['bob']);act(()=>vi.advanceTimersByTime(4000));expect(result.current.typingUsers).toEqual([]);
 });

 it('removes a message when moderation deletion arrives in realtime',async()=>{
  state.history.mockResolvedValue([message('gone')]);const {result}=renderHook(()=>useChat(true,'server','one','alice',()=>{}));await waitFor(()=>expect(result.current.messages).toHaveLength(1));
  act(()=>fire('message:deleted',{channelId:'one',messageId:'gone'}));expect(result.current.messages).toEqual([]);
 });
 it('resyncs and notifies the app when permissions change',async()=>{
  const changed=vi.fn();renderHook(()=>useChat(true,'server','one','alice',()=>{},undefined,changed));await act(async()=>{});const before=state.sent.filter(e=>e.name==='server:join').length;
  act(()=>fire('permissions:changed',{serverId:'server'}));await waitFor(()=>expect(changed).toHaveBeenCalledWith('server'));expect(state.sent.filter(e=>e.name==='server:join').length).toBeGreaterThan(before);
 });
 it('updates member list from realtime join/remove events',async()=>{
  const {result}=renderHook(()=>useChat(true,'server','one','alice',()=>{}));await act(async()=>{});
  act(()=>fire('member:joined',{serverId:'server',member:{id:'bob',username:'bob',role:'MEMBER',online:true}}));
  expect(result.current.members.map(m=>m.id)).toContain('bob');
  act(()=>fire('member:removed',{serverId:'server',userId:'bob',reason:'kicked'}));
  expect(result.current.members.map(m=>m.id)).not.toContain('bob');
 });
 it('notifies the app when the current user is removed from a server',async()=>{
  const removed=vi.fn();renderHook(()=>useChat(true,'server','one','alice',()=>{},removed));await act(async()=>{});
  act(()=>fire('server:removed',{serverId:'server',reason:'kicked'}));
  expect(removed).toHaveBeenCalledWith('server','kicked');
 });
 it('sorts messages and deduplicates by ID',()=>{expect(mergeMessages([message('b')],[message('a'),message('b')]).map(m=>m.id)).toEqual(['a','b'])});
});
