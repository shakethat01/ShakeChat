import { useEffect, useRef } from 'react';
import { api, auth } from './api';
import type { Server, User } from './api';

function normalize(value?: string | null) {
  return (value || '')
    .trim()
    .replace(/\s+·\s+Sen$/i, '')
    .replace(/^@/, '')
    .toLocaleLowerCase('tr-TR');
}

function displayName(user: User) {
  return user.displayName?.trim() || user.username;
}

function serverButtons() {
  return [...document.querySelectorAll<HTMLButtonElement>('.serverbar button.server:not(.add)')];
}

function activeServer(servers: Server[]) {
  const active = document.querySelector<HTMLButtonElement>('.serverbar button.server.active');
  const explicit = active?.dataset.serverId;
  if (explicit) {
    const byId = servers.find(server => server.id === explicit);
    if (byId) return byId;
  }
  const title = active?.getAttribute('title')?.trim() || document.querySelector<HTMLElement>('.space-header span')?.textContent?.trim() || '';
  return servers.find(server => server.name === title);
}

function groupLabel(channel: Server['channels'][number]) {
  return (channel.groupName?.trim() || (channel.type === 'VOICE' ? 'Ses Alanı' : 'Sohbet')).toLocaleUpperCase('tr-TR');
}

function targetLabel(element: Element) {
  if (element.matches('.messages article')) return element.querySelector('.msg-meta b')?.textContent || '';
  if (element.matches('.group-member-list > div')) return element.querySelector('span')?.textContent || '';
  if (element.matches('.dm-profile')) return element.querySelector('h3')?.textContent || '';
  return element.querySelector('b')?.textContent || '';
}

function resolveUser(label: string, users: User[]) {
  const wanted = normalize(label);
  if (!wanted) return undefined;
  const usernameMatch = users.find(user => normalize(user.username) === wanted);
  if (usernameMatch) return usernameMatch;
  const displayMatches = users.filter(user => normalize(displayName(user)) === wanted);
  return displayMatches.length === 1 ? displayMatches[0] : undefined;
}

export function DomIdentityBridge() {
  const serversRef = useRef<Server[]>([]);
  const usersRef = useRef<User[]>([]);
  const refreshBusy = useRef(false);
  const refreshTimer = useRef<number | null>(null);
  const lastRefresh = useRef(0);

  function decorate() {
    const servers = serversRef.current;
    const buttons = serverButtons();
    buttons.forEach((button, index) => {
      const label = (button.getAttribute('title') || button.getAttribute('aria-label') || '').trim();
      const server = servers[index] || servers.find(item => item.name === label);
      if (server) button.dataset.serverId = server.id;
    });

    const current = activeServer(servers);
    if (current) {
      document.querySelectorAll<HTMLButtonElement>('.flow-group button.channel').forEach(button => {
        if (button.dataset.channelId && current.channels.some(channel => channel.id === button.dataset.channelId)) return;
        const name = button.querySelector('.flow-name')?.textContent?.trim() || '';
        const group = button.closest('.flow-group')?.querySelector<HTMLElement>(':scope > .section')?.textContent?.trim().toLocaleUpperCase('tr-TR') || '';
        const candidates = current.channels.filter(channel => channel.name === name);
        const channel = candidates.length === 1 ? candidates[0] : candidates.find(item => groupLabel(item) === group);
        if (channel) button.dataset.channelId = channel.id;
      });

      document.querySelectorAll<HTMLElement>('.flow-group > .section').forEach(section => {
        section.dataset.serverId = current.id;
        section.dataset.groupLabel = section.textContent?.trim().toLocaleUpperCase('tr-TR') || '';
      });
    }

    const users = usersRef.current;
    if (!users.length) return;
    document.querySelectorAll<HTMLElement>('.members .member,.members .group-member-list>div,.members .dm-profile,.messages article').forEach(element => {
      if (element.dataset.userId) return;
      const user = resolveUser(targetLabel(element), users);
      if (user) element.dataset.userId = user.id;
    });
  }

  async function refresh() {
    if (!auth.token() || refreshBusy.current) return;
    refreshBusy.current = true;
    try {
      const [me, servers, friends, requests, dms] = await Promise.all([
        api.me(),
        api.servers(),
        api.friends(),
        api.friendRequests(),
        api.dms(),
      ]);
      serversRef.current = servers;
      const current = activeServer(servers);
      const rows = current ? await api.members(current.id).catch(() => []) : [];
      const users = new Map<string, User>();
      const add = (user?: User | null) => { if (user) users.set(user.id, user); };
      add(me);
      friends.forEach(add);
      requests.incoming.forEach(item => add(item.user));
      requests.outgoing.forEach(item => add(item.user));
      dms.forEach(conversation => { conversation.members.forEach(add); add(conversation.other); });
      rows.forEach(row => add(row.user));
      usersRef.current = [...users.values()];
      lastRefresh.current = Date.now();
      decorate();
    } catch {
      // Identity decoration is best-effort and must never interrupt the app.
    } finally {
      refreshBusy.current = false;
    }
  }

  function scheduleRefresh(delay = 140) {
    if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
    refreshTimer.current = window.setTimeout(() => void refresh(), delay);
  }

  useEffect(() => {
    void refresh();

    const click = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('.serverbar button.server:not(.add)')) scheduleRefresh(90);
    };
    const focus = () => {
      if (Date.now() - lastRefresh.current > 2500) scheduleRefresh(40);
      else decorate();
    };
    document.addEventListener('click', click, true);
    window.addEventListener('focus', focus);

    const root = document.querySelector('.app-shell') || document.body;
    const observer = new MutationObserver(() => {
      decorate();
      const unresolved = document.querySelector('.members .member:not([data-user-id]),.messages article:not([data-user-id])');
      if (unresolved && Date.now() - lastRefresh.current > 1800) scheduleRefresh(180);
    });
    observer.observe(root, { subtree: true, childList: true });

    return () => {
      observer.disconnect();
      document.removeEventListener('click', click, true);
      window.removeEventListener('focus', focus);
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
    };
  }, []);

  return null;
}
