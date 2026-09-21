import { useEffect, useRef, useState } from 'react';
import { api, Member, Message } from './api';
import { chatSocket } from './socket';

export function mergeMessages(current: Message[], incoming: Message[]) {
  return [...new Map([...current, ...incoming].map(m => [m.id, m])).values()]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

export function useChat(authed: boolean, serverId: string, channelId: string, userId: string, onError: (error: string) => void, onServerRemoved?: (serverId: string, reason: 'left' | 'kicked' | 'banned') => void, onPermissionsChanged?: (serverId: string) => void) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [typingUsers, setTypingUsers] = useState<Record<string, { username: string; expires: number }>>({});
  const [socketOnline, setSocketOnline] = useState(false);
  const [loading, setLoading] = useState(false);
  const selection = useRef(channelId);
  selection.current = channelId;
  const lastTyping = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const onServerRemovedRef = useRef(onServerRemoved);
  onServerRemovedRef.current = onServerRemoved;
  const onPermissionsChangedRef = useRef(onPermissionsChanged);
  onPermissionsChangedRef.current = onPermissionsChanged;

  useEffect(() => {
    if (!authed) return;
    const socket = chatSocket();
    let active = true;
    let generation = 0;
    let recent: Message[] = [];
    setMessages([]); setMembers([]); setTypingUsers({});
    const sync = () => {
      const attempt = ++generation;
      const valid = () => active && generation === attempt;
      setSocketOnline(true);
      if (serverId) socket.timeout(6000).emit('server:join', { serverId }, (err: Error | null, reply: { ok: boolean; members?: Member[]; error?: string }) => {
        if (!valid()) return;
        if (err || !reply?.ok) { onErrorRef.current(reply?.error || 'Üye listesi yüklenemedi.'); return; }
        setMembers(reply.members || []);
      });
      if (!channelId) { socket.emit('channel:leave'); setLoading(false); return; }
      setLoading(true);
      socket.timeout(6000).emit('channel:join', { channelId }, async (err: Error | null, reply: { ok: boolean; error?: string }) => {
        if (!valid()) return;
        if (err || !reply?.ok) { setLoading(false); onErrorRef.current(reply?.error || 'Kanala bağlanılamadı.'); return; }
        // Subscribe before fetching: merge events received while history is in flight.
        try {
          const history = await api.messages(channelId);
          if (valid()) setMessages(previous => mergeMessages(previous, mergeMessages(history, recent)));
        } catch (e) { if (valid()) onErrorRef.current((e as Error).message); }
        finally { if (valid()) setLoading(false); }
      });
    };
    const disconnect = () => {
      generation++;
      setSocketOnline(false); setLoading(false); setTypingUsers({});
      setMembers(previous => previous.map(m => ({ ...m, online: false })));
    };
    const connectionError = (e: Error) => { disconnect(); onErrorRef.current(e.message); };
    const received = (message: Message) => {
      if (message.channelId !== channelId) return;
      recent = mergeMessages(recent, [message]).slice(-100);
      setMessages(previous => mergeMessages(previous, [message]));
      setTypingUsers(previous => { const next = { ...previous }; delete next[message.author.id]; return next; });
    };
    const updated = (data: { channelId: string; message: Message }) => {
      if (data.channelId !== channelId) return;
      recent = mergeMessages(recent, [data.message]).slice(-100);
      setMessages(previous => mergeMessages(previous, [data.message]));
    };
    const deleted = (data: { channelId: string; messageId: string }) => {
      if (data.channelId !== channelId) return;
      recent = recent.filter(message => message.id !== data.messageId);
      setMessages(previous => previous.filter(message => message.id !== data.messageId));
    };
    const typing = (data: { channelId: string; userId: string; username: string; typing: boolean }) => {
      if (data.channelId !== channelId || data.userId === userId) return;
      setTypingUsers(previous => {
        const next = { ...previous };
        if (data.typing) next[data.userId] = { username: data.username, expires: Date.now() + 3500 };
        else delete next[data.userId];
        return next;
      });
    };
    const presence = (data: { serverId: string; userId: string; online: boolean }) => {
      if (data.serverId === serverId) setMembers(previous => previous.map(m => m.id === data.userId ? { ...m, online: data.online } : m));
    };
    const memberJoined = (data: { serverId: string; member: Member }) => {
      if (data.serverId !== serverId) return;
      setMembers(previous => previous.some(member => member.id === data.member.id) ? previous.map(member => member.id === data.member.id ? data.member : member) : [...previous, data.member]);
    };
    const memberRemoved = (data: { serverId: string; userId: string }) => {
      if (data.serverId === serverId) setMembers(previous => previous.filter(member => member.id !== data.userId));
    };
    const serverRemoved = (data: { serverId: string; reason: 'left' | 'kicked' | 'banned' }) => {
      if (data.serverId === serverId) {
        setMessages([]); setMembers([]); setTypingUsers({});
      }
      onServerRemovedRef.current?.(data.serverId, data.reason);
    };
    const permissionsChanged = (data: { serverId: string }) => {
      if (data.serverId !== serverId) return;
      sync();
      onPermissionsChangedRef.current?.(data.serverId);
    };
    const channelRemoved = (data: { serverId: string; channelId: string }) => {
      if (data.serverId !== serverId || data.channelId !== channelId) return;
      setMessages([]); setTypingUsers({});
      onPermissionsChangedRef.current?.(data.serverId);
    };
    const channelUpdated = (data: { serverId: string; channel?: { id?: string } }) => {
      if (data.serverId !== serverId) return;
      onPermissionsChangedRef.current?.(data.serverId);
    };
    socket.on('connect', sync); socket.on('disconnect', disconnect); socket.on('connect_error', connectionError);
    socket.on('message:new', received); socket.on('message:updated', updated); socket.on('message:deleted', deleted); socket.on('typing', typing); socket.on('presence:update', presence);
    socket.on('member:joined', memberJoined); socket.on('member:removed', memberRemoved); socket.on('server:removed', serverRemoved); socket.on('permissions:changed', permissionsChanged); socket.on('channel:removed', channelRemoved); socket.on('channel:updated', channelUpdated);
    if (socket.connected) sync(); else socket.connect();
    const expiry = setInterval(() => setTypingUsers(previous => {
      const entries = Object.entries(previous).filter(([, value]) => value.expires > Date.now());
      return entries.length === Object.keys(previous).length ? previous : Object.fromEntries(entries);
    }), 500);
    return () => {
      active = false; generation++; clearInterval(expiry); clearTimeout(timer.current);
      if (socket.connected) socket.emit('typing', { channelId, typing: false });
      socket.off('connect', sync); socket.off('disconnect', disconnect); socket.off('connect_error', connectionError);
      socket.off('message:new', received); socket.off('message:updated', updated); socket.off('message:deleted', deleted); socket.off('typing', typing); socket.off('presence:update', presence);
      socket.off('member:joined', memberJoined); socket.off('member:removed', memberRemoved); socket.off('server:removed', serverRemoved); socket.off('permissions:changed', permissionsChanged); socket.off('channel:removed', channelRemoved); socket.off('channel:updated', channelUpdated);
    };
  }, [authed, serverId, channelId, userId]);

  function announceTyping(value: string) {
    const socket = chatSocket();
    if (!socket.connected || !channelId) return;
    clearTimeout(timer.current);
    if (!value.trim() || Date.now() - lastTyping.current > 700) {
      socket.emit('typing', { channelId, typing: !!value.trim() });
      lastTyping.current = Date.now();
    }
    timer.current = setTimeout(() => socket.emit('typing', { channelId, typing: false }), 1800);
  }
  function appendSent(message: Message) {
    if (selection.current === message.channelId) setMessages(previous => mergeMessages(previous, [message]));
  }
  return { messages, members, typingUsers: Object.values(typingUsers).map(u => u.username), socketOnline, loading, announceTyping, appendSent };
}
