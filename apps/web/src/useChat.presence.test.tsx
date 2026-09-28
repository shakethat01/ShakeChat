// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  handlers: new Map<string, Set<(...args: any[]) => void>>(),
  connected: true,
  members: [{ id: 'bob', username: 'bob', role: 'MEMBER', online: true }],
}));

function fire(name: string, ...args: any[]) {
  for (const fn of state.handlers.get(name) || []) fn(...args);
}

const socket = {
  get connected() { return state.connected; },
  on(name: string, fn: (...args: any[]) => void) {
    if (!state.handlers.has(name)) state.handlers.set(name, new Set());
    state.handlers.get(name)!.add(fn);
    return socket;
  },
  off(name: string, fn: (...args: any[]) => void) {
    state.handlers.get(name)?.delete(fn);
    return socket;
  },
  timeout() { return socket; },
  emit(name: string, _data?: any, callback?: any) {
    if (callback) callback(null, name === 'server:join' ? { ok: true, members: state.members } : { ok: true });
    return socket;
  },
  connect() { state.connected = true; fire('connect'); },
};

vi.mock('./socket', () => ({ chatSocket: () => socket }));
vi.mock('./api', () => ({ api: { messages: vi.fn(async () => []) } }));

import { useChat } from './useChat';

beforeEach(() => {
  vi.useFakeTimers();
  state.handlers.clear();
  state.connected = true;
  state.members = [{ id: 'bob', username: 'bob', role: 'MEMBER', online: true }];
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it('keeps last known presence during a brief socket reconnect', async () => {
  const { result } = renderHook(() => useChat(true, 'server', 'one', 'alice', () => {}));
  await act(async () => { await Promise.resolve(); });
  expect(result.current.members[0]?.online).toBe(true);

  act(() => { state.connected = false; fire('disconnect'); });
  expect(result.current.socketOnline).toBe(false);
  expect(result.current.members[0]?.online).toBe(true);

  act(() => { vi.advanceTimersByTime(3000); state.connected = true; fire('connect'); });
  await act(async () => { await Promise.resolve(); });
  act(() => { vi.advanceTimersByTime(6000); });
  expect(result.current.members[0]?.online).toBe(true);
});

it('marks members offline when the realtime connection stays down', async () => {
  const { result } = renderHook(() => useChat(true, 'server', 'one', 'alice', () => {}));
  await act(async () => { await Promise.resolve(); });
  expect(result.current.members[0]?.online).toBe(true);

  act(() => { state.connected = false; fire('disconnect'); vi.advanceTimersByTime(8000); });
  expect(result.current.members[0]?.online).toBe(false);
});
