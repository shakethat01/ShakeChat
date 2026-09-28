import { useEffect, useState } from 'react';
import { api, type VoiceRosterChannel } from './api';
import { chatSocket } from './socket';

export function useVoiceRoster(serverId: string, enabled: boolean) {
  const [channels, setChannels] = useState<Record<string, VoiceRosterChannel>>({});
  useEffect(() => {
    setChannels({});
    if (!enabled || !serverId) return;
    let active = true, generation = 0;
    let controller: AbortController | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      const attempt = ++generation;
      controller?.abort(); controller = new AbortController();
      if (timer) clearTimeout(timer);
      try {
        const result = await api.voiceRoster(serverId, controller.signal);
        if (active && attempt === generation) setChannels(previous => Object.fromEntries(result.channels.map(row => [row.channelId, !row.available && previous[row.channelId] ? { ...previous[row.channelId], available: false } : row])));
      } catch {
        if (active && attempt === generation) setChannels(previous => Object.fromEntries(Object.entries(previous).map(([id, row]) => [id, { ...row, available: false }])));
      } finally {
        if (active && attempt === generation) timer = setTimeout(refresh, document.hidden ? 10000 : 3000);
      }
    };
    const socket = chatSocket();
    const permissions = (data: { serverId: string }) => { if (data.serverId === serverId) { setChannels({}); void refresh(); } };
    const focus = () => { if (!document.hidden) void refresh(); };
    socket.on('permissions:changed', permissions);
    socket.on('connect', focus);
    window.addEventListener('focus', focus); document.addEventListener('visibilitychange', focus);
    void refresh();
    return () => { active = false; controller?.abort(); clearTimeout(timer); socket.off('permissions:changed', permissions); socket.off('connect', focus); window.removeEventListener('focus', focus); document.removeEventListener('visibilitychange', focus); };
  }, [serverId, enabled]);
  return channels;
}
