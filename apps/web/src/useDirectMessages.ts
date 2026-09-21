import { useEffect, useRef, useState } from 'react';
import { api, DirectMessage } from './api';
import { chatSocket } from './socket';

export function mergeDirectMessages(current: DirectMessage[], incoming: DirectMessage[]) {
  return [...new Map([...current, ...incoming].map(message => [message.id, message])).values()]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

export function useDirectMessages(authed: boolean, conversationId: string, userId: string, onError: (message: string) => void) {
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [typingUsers, setTypingUsers] = useState<Record<string, { username: string; expires: number }>>({});
  const [loading, setLoading] = useState(false);
  const selection = useRef(conversationId);
  selection.current = conversationId;
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastTyping = useRef(0);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    if (!authed) return;
    const socket = chatSocket();
    let active = true;
    let generation = 0;
    let recent: DirectMessage[] = [];
    setMessages([]);
    setTypingUsers({});

    const sync = () => {
      const attempt = ++generation;
      const valid = () => active && generation === attempt;
      if (!conversationId) { socket.emit('dm:leave'); setLoading(false); return; }
      setLoading(true);
      socket.timeout(6000).emit('dm:join', { conversationId }, async (err: Error | null, reply: { ok: boolean; error?: string }) => {
        if (!valid()) return;
        if (err || !reply?.ok) { setLoading(false); onErrorRef.current(reply?.error || 'Özel mesaja bağlanılamadı.'); return; }
        try {
          const history = await api.dmMessages(conversationId);
          if (valid()) setMessages(previous => mergeDirectMessages(previous, mergeDirectMessages(history, recent)));
        } catch (error) { if (valid()) onErrorRef.current((error as Error).message); }
        finally { if (valid()) setLoading(false); }
      });
    };

    const disconnect = () => { generation++; setLoading(false); setTypingUsers({}); };
    const received = (message: DirectMessage) => {
      if (message.conversationId !== conversationId) return;
      recent = mergeDirectMessages(recent, [message]).slice(-100);
      setMessages(previous => mergeDirectMessages(previous, [message]));
      setTypingUsers(previous => { const next = { ...previous }; delete next[message.author.id]; return next; });
    };
    const typing = (data: { conversationId: string; userId: string; username: string; typing: boolean }) => {
      if (data.conversationId !== conversationId || data.userId === userId) return;
      setTypingUsers(previous => {
        const next = { ...previous };
        if (data.typing) next[data.userId] = { username: data.username, expires: Date.now() + 3500 };
        else delete next[data.userId];
        return next;
      });
    };
    const updated = (data: { conversationId: string; message: DirectMessage }) => {
      if (data.conversationId !== conversationId) return;
      setMessages(previous => mergeDirectMessages(previous.filter(message => message.id !== data.message.id), [data.message]));
    };
    const deleted = (data: { conversationId: string; messageId: string }) => {
      if (data.conversationId !== conversationId) return;
      setMessages(previous => previous.filter(message => message.id !== data.messageId));
    };

    socket.on('connect', sync);
    socket.on('disconnect', disconnect);
    socket.on('dm:new', received);
    socket.on('dm:updated', updated);
    socket.on('dm:deleted', deleted);
    socket.on('dm:typing', typing);
    if (socket.connected) sync(); else socket.connect();
    const expiry = setInterval(() => setTypingUsers(previous => {
      const entries = Object.entries(previous).filter(([, value]) => value.expires > Date.now());
      return entries.length === Object.keys(previous).length ? previous : Object.fromEntries(entries);
    }), 500);

    return () => {
      active = false; generation++; clearInterval(expiry); clearTimeout(timer.current);
      if (socket.connected && conversationId) socket.emit('dm:typing', { conversationId, typing: false });
      socket.off('connect', sync); socket.off('disconnect', disconnect); socket.off('dm:new', received); socket.off('dm:updated', updated); socket.off('dm:deleted', deleted); socket.off('dm:typing', typing);
    };
  }, [authed, conversationId, userId]);

  function announceTyping(value: string) {
    const socket = chatSocket();
    if (!socket.connected || !conversationId) return;
    clearTimeout(timer.current);
    if (!value.trim() || Date.now() - lastTyping.current > 700) {
      socket.emit('dm:typing', { conversationId, typing: !!value.trim() });
      lastTyping.current = Date.now();
    }
    timer.current = setTimeout(() => socket.emit('dm:typing', { conversationId, typing: false }), 1800);
  }

  function appendSent(message: DirectMessage) {
    if (selection.current === message.conversationId) setMessages(previous => mergeDirectMessages(previous, [message]));
  }

  return { messages, typingUsers: Object.values(typingUsers).map(user => user.username), loading, announceTyping, appendSent };
}
