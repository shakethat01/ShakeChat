// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state=vi.hoisted(()=>({handlers:new Map<string,Set<(...args:any[])=>void>>(),connected:true,history:vi.fn(),sent:[] as any[]}));
const socket={
 get connected(){return state.connected},
 on(name:string,fn:(...args:any[])=>void){if(!state.handlers.has(name))state.handlers.set(name,new Set());state.handlers.get(name)!.add(fn);return socket},
 off(name:string,fn:(...args:any[])=>void){state.handlers.get(name)?.delete(fn);return socket},
 timeout(){return socket},
 emit(name:string,data:any,callback?:any){state.sent.push({name,data});if(callback)callback(null,{ok:true});return socket},
 connect(){state.connected=true;fire('connect')},
};
vi.mock('./socket',()=>({chatSocket:()=>socket}));
vi.mock('./api',()=>({api:{dmMessages:(id:string)=>state.history(id)}}));
import { mergeDirectMessages, useDirectMessages } from './useDirectMessages';
const message=(id:string,conversationId='dm1')=>({id,conversationId,content:id,createdAt:'2026-09-09T10:00:00.000Z',author:{id:'bob',username:'bob'}});
function fire(name:string,...args:any[]){for(const fn of state.handlers.get(name)||[])fn(...args)}
afterEach(()=>{cleanup();vi.useRealTimers()});
beforeEach(()=>{state.handlers.clear();state.sent=[];state.connected=true;state.history.mockReset().mockResolvedValue([])});

it('joins the selected DM and merges realtime/history without duplicates',async()=>{
 let finish!:(value:any)=>void;state.history.mockImplementation(()=>new Promise(resolve=>{finish=resolve}));
 const {result}=renderHook(()=>useDirectMessages(true,'dm1','alice',()=>{}));
 act(()=>fire('dm:new',message('live')));await act(async()=>finish([message('history')]));act(()=>result.current.appendSent(message('live')));
 expect(result.current.messages.map(item=>item.id)).toEqual(['history','live']);expect(state.sent.some(event=>event.name==='dm:join')).toBe(true);
});

it('ignores messages from another conversation and reloads after reconnect',async()=>{
 const {result}=renderHook(()=>useDirectMessages(true,'dm1','alice',()=>{}));await waitFor(()=>expect(result.current.loading).toBe(false));
 act(()=>fire('dm:new',message('wrong','dm2')));expect(result.current.messages).toHaveLength(0);
 state.connected=false;act(()=>fire('disconnect'));state.history.mockResolvedValue([message('missed')]);state.connected=true;act(()=>fire('connect'));
 await waitFor(()=>expect(result.current.messages.map(item=>item.id)).toContain('missed'));
});

it('expires DM typing locally and deduplicates by id',async()=>{
 vi.useFakeTimers();const {result}=renderHook(()=>useDirectMessages(true,'dm1','alice',()=>{}));await act(async()=>{});
 act(()=>{fire('dm:typing',{conversationId:'dm1',userId:'alice',username:'alice',typing:true});fire('dm:typing',{conversationId:'dm1',userId:'bob',username:'bob',typing:true})});
 expect(result.current.typingUsers).toEqual(['bob']);act(()=>vi.advanceTimersByTime(4000));expect(result.current.typingUsers).toEqual([]);
 expect(mergeDirectMessages([message('b')],[message('a'),message('b')]).map(item=>item.id)).toEqual(['a','b']);
});
