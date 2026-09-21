import { useEffect, useMemo, useRef, useState } from 'react';
import { Ban, Clock3, Copy, MessageCircle, ShieldAlert, UserMinus, UserPlus, UserRound, Volume2, X } from 'lucide-react';
import { api, BlockedUser, DirectConversation, Friend, FriendRequests, Member, Permission, Server, User } from './api';

type ResolvedTarget = {
  user: User;
  member?: Member;
};

type MenuState = {
  x: number;
  y: number;
  target: ResolvedTarget;
  server?: Server;
  permissions: Permission[];
};

type MemberRow = Awaited<ReturnType<typeof api.members>>[number];

function memberFromRow(row: MemberRow): Member {
  return {
    ...row.user,
    role: row.role,
    roles: row.roles,
    joinedAt: row.joinedAt,
    messageRestrictedUntil: row.messageRestrictedUntil,
    messageRestrictionReason: row.messageRestrictionReason,
    online: false,
  };
}

function nameOf(user: User) {
  return user.displayName?.trim() || user.username;
}

function normalize(value?: string | null) {
  return (value || '').trim().replace(/\s+·\s+Sen$/i, '').replace(/^@/, '').toLocaleLowerCase('tr-TR');
}

function roleText(member?: Member) {
  if (!member) return 'ShakeChat kullanıcısı';
  if (member.roles?.length) return member.roles.map(role => role.name).join(' · ');
  if (member.role === 'OWNER') return 'Alan sahibi';
  if (member.role === 'ADMIN') return 'Yönetici';
  if (member.role === 'MODERATOR') return 'Moderatör';
  return 'Üye';
}

function extractTargetName(element: Element) {
  if (element.matches('.messages article')) return element.querySelector('.msg-meta b')?.textContent || '';
  if (element.matches('.group-member-list > div')) return element.querySelector('span')?.textContent || '';
  if (element.matches('.dm-profile')) return element.querySelector('h3')?.textContent || '';
  if (element.matches('.dm-nav')) return element.querySelector('b')?.textContent || '';
  return element.querySelector('b')?.textContent || '';
}

function supportedTarget(start: EventTarget | null) {
  if (!(start instanceof Element)) return null;
  return start.closest('.members .member,.members .group-member-list>div,.members .dm-profile,.messages article,.friends-home .social-row,.social-sidebar .dm-nav');
}

export function GlobalUserContext() {
  const [me, setMe] = useState<User | null>(null);
  const [servers, setServers] = useState<Server[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [requests, setRequests] = useState<FriendRequests>({ incoming: [], outgoing: [] });
  const [blocked, setBlocked] = useState<BlockedUser[]>([]);
  const [dms, setDms] = useState<DirectConversation[]>([]);
  const [serverMembers, setServerMembers] = useState<Member[]>([]);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [profile, setProfile] = useState<ResolvedTarget | null>(null);
  const [notice, setNotice] = useState('');
  const noticeTimer = useRef<number | null>(null);

  const baseUsers = useMemo(() => {
    const map = new Map<string, User>();
    const add = (user?: User | null) => { if (user) map.set(user.id, user); };
    add(me);
    friends.forEach(add);
    requests.incoming.forEach(item => add(item.user));
    requests.outgoing.forEach(item => add(item.user));
    blocked.forEach(item => add(item.user));
    dms.forEach(conversation => {
      conversation.members.forEach(add);
      add(conversation.other);
    });
    serverMembers.forEach(add);
    return [...map.values()];
  }, [me, friends, requests, blocked, dms, serverMembers]);

  async function refreshBase() {
    try {
      const [user, serverList, friendList, requestList, blockedList, conversations] = await Promise.all([
        api.me(), api.servers(), api.friends(), api.friendRequests(), api.blockedUsers(), api.dms(),
      ]);
      setMe(user);
      setServers(serverList);
      setFriends(friendList);
      setRequests(requestList);
      setBlocked(blockedList);
      setDms(conversations);
    } catch {
      // The main app owns session/error handling. Context UI should never block it.
    }
  }

  function activeServerFromDom(list: Server[] = servers) {
    const title = document.querySelector('.space-header span')?.textContent?.trim();
    if (!title) return undefined;
    return list.find(server => server.name === title);
  }

  async function loadActiveServerContext() {
    let list = servers;
    if (!list.length) {
      try { list = await api.servers(); setServers(list); } catch { return { server: undefined, members: [] as Member[], permissions: [] as Permission[] }; }
    }
    const server = activeServerFromDom(list);
    if (!server) return { server: undefined, members: [] as Member[], permissions: [] as Permission[] };
    try {
      const [rows, permissionResult] = await Promise.all([
        api.members(server.id),
        api.myPermissions(server.id),
      ]);
      const members = rows.map(memberFromRow);
      setServerMembers(members);
      return { server, members, permissions: permissionResult.permissions };
    } catch {
      return { server, members: serverMembers, permissions: [] as Permission[] };
    }
  }

  function resolveByLabel(label: string, members: Member[]) {
    const wanted = normalize(label);
    if (!wanted) return undefined;
    const candidates = new Map<string, User>();
    const add = (user: User) => candidates.set(user.id, user);
    baseUsers.forEach(add);
    members.forEach(add);
    const exactUsername = [...candidates.values()].find(user => normalize(user.username) === wanted);
    if (exactUsername) return exactUsername;
    const displayMatches = [...candidates.values()].filter(user => normalize(nameOf(user)) === wanted);
    return displayMatches.length === 1 ? displayMatches[0] : undefined;
  }

  function showNotice(message: string) {
    setNotice(message);
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(''), 3200);
  }

  useEffect(() => {
    void refreshBase();
    const socialRefresh = () => void refreshBase();
    window.addEventListener('focus', socialRefresh);
    return () => {
      window.removeEventListener('focus', socialRefresh);
      if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    };
  }, []);

  useEffect(() => {
    const onContextMenu = async (event: MouseEvent) => {
      const targetElement = supportedTarget(event.target);
      if (!targetElement) return;
      const label = extractTargetName(targetElement);
      if (!label) return;
      event.preventDefault();
      event.stopPropagation();
      const context = await loadActiveServerContext();
      const user = resolveByLabel(label, context.members);
      if (!user) {
        showNotice('Kullanıcı eşleştirilemedi. Profil adı benzersiz olmayabilir.');
        return;
      }
      const member = context.members.find(item => item.id === user.id);
      const width = 292;
      const height = 430;
      const pad = 10;
      const x = Math.max(pad, Math.min(event.clientX, window.innerWidth - width - pad));
      const y = Math.max(pad, Math.min(event.clientY, window.innerHeight - height - pad));
      setMenu({ x, y, target: { user, member }, server: context.server, permissions: context.permissions });
    };
    const close = () => setMenu(null);
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { setMenu(null); setProfile(null); } };
    document.addEventListener('contextmenu', onContextMenu, true);
    window.addEventListener('pointerdown', close);
    window.addEventListener('blur', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('contextmenu', onContextMenu, true);
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('blur', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('keydown', key);
    };
  }, [servers, baseUsers, serverMembers]);

  const target = menu?.target.user;
  const isSelf = !!target && target.id === me?.id;
  const friend = target ? friends.find(item => item.id === target.id) : undefined;
  const blockedEntry = target ? blocked.find(item => item.user.id === target.id) : undefined;
  const incoming = target ? requests.incoming.find(item => item.user.id === target.id) : undefined;
  const outgoing = target ? requests.outgoing.find(item => item.user.id === target.id) : undefined;
  const isOwner = !!menu?.target.member && menu.target.member.role === 'OWNER';
  const canAdmin = (permission: Permission) => !!menu && (menu.permissions.includes('ADMINISTRATOR') || menu.permissions.includes(permission));
  const canKick = !isSelf && !isOwner && canAdmin('KICK_MEMBERS');
  const canBan = !isSelf && !isOwner && canAdmin('BAN_MEMBERS');
  const canTimeout = !isSelf && !isOwner && canAdmin('MODERATE_MEMBERS');

  async function doAction(action: () => Promise<unknown>, success: string) {
    try {
      await action();
      setMenu(null);
      showNotice(success);
      await refreshBase();
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'İşlem başarısız.');
    }
  }

  async function openDm(user: User) {
    try {
      await api.openDm(user.id);
      await refreshBase();
      (document.querySelector('.home') as HTMLButtonElement | null)?.click();
      const label = nameOf(user);
      for (let i = 0; i < 14; i++) {
        await new Promise(resolve => window.setTimeout(resolve, 90));
        const rows = [...document.querySelectorAll('.dm-nav')] as HTMLElement[];
        const row = rows.find(item => normalize(item.querySelector('b')?.textContent) === normalize(label) || normalize(item.querySelector('b')?.textContent) === normalize(user.username));
        if (row) { row.click(); break; }
      }
      setMenu(null);
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'Özel mesaj açılamadı.');
    }
  }

  async function copyUserId(user: User) {
    try {
      await navigator.clipboard.writeText(user.id);
      setMenu(null);
      showNotice('Kullanıcı ID kopyalandı.');
    } catch { showNotice('Pano erişimi yok.'); }
  }

  async function moderate(kind: 'kick' | 'ban' | 'timeout') {
    if (!menu?.server || !target) return;
    const serverId = menu.server.id;
    if (kind === 'kick') {
      if (!confirm(`${nameOf(target)} sunucudan çıkarılsın mı?`)) return;
      await doAction(() => api.kickMember(serverId, target.id), `${nameOf(target)} sunucudan çıkarıldı.`);
      return;
    }
    if (kind === 'ban') {
      if (!confirm(`${nameOf(target)} sunucudan yasaklansın mı?`)) return;
      const reason = prompt('Yasaklama nedeni (isteğe bağlı)', '') ?? undefined;
      await doAction(() => api.banMember(serverId, target.id, reason), `${nameOf(target)} yasaklandı.`);
      return;
    }
    const raw = prompt('Kaç dakika yazamasın? (1–10080)', '60');
    if (raw === null) return;
    const minutes = Math.trunc(Number(raw));
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 10080) { showNotice('Süre 1–10080 dakika arasında olmalı.'); return; }
    const reason = prompt('Kısıtlama nedeni (isteğe bağlı)', '') ?? undefined;
    await doAction(() => api.restrictMemberMessages(serverId, target.id, minutes, reason), `${nameOf(target)} ${minutes} dakika kısıtlandı.`);
  }

  return <>
    {menu && target && <div className="global-user-menu" role="menu" aria-label={`${nameOf(target)} kullanıcı menüsü`} style={{ left: menu.x, top: menu.y }} onPointerDown={event => event.stopPropagation()} onContextMenu={event => event.preventDefault()}>
      <div className="global-user-menu-head">
        <div className="global-user-avatar">{target.avatarUrl ? <img src={target.avatarUrl} alt=""/> : nameOf(target).slice(0,2).toUpperCase()}</div>
        <div><b>{nameOf(target)}{isSelf ? ' · Sen' : ''}</b><small>@{target.username}</small><span>{menu.target.member ? roleText(menu.target.member) : (target.statusText || 'ShakeChat kullanıcısı')}</span></div>
      </div>
      <button type="button" onClick={() => { setProfile(menu.target); setMenu(null); }}><UserRound size={16}/><span><b>Profili görüntüle</b><small>Kullanıcı kartını aç</small></span></button>
      {!isSelf && friend && <button type="button" onClick={() => void openDm(target)}><MessageCircle size={16}/><span><b>Özel mesaj</b><small>DM sohbetini aç</small></span></button>}
      {!isSelf && incoming && <button type="button" onClick={() => void doAction(() => api.acceptFriendRequest(incoming.id), 'Arkadaşlık isteği kabul edildi.')}><UserPlus size={16}/><span><b>Arkadaşlığı kabul et</b><small>Bekleyen isteği onayla</small></span></button>}
      {!isSelf && !friend && !incoming && !outgoing && !blockedEntry && <button type="button" onClick={() => void doAction(() => api.sendFriendRequest(target.username), 'Arkadaşlık isteği gönderildi.')}><UserPlus size={16}/><span><b>Arkadaş ekle</b><small>@{target.username}</small></span></button>}
      {!isSelf && outgoing && <button type="button" disabled><UserPlus size={16}/><span><b>İstek gönderildi</b><small>Yanıt bekleniyor</small></span></button>}
      {!isSelf && friend && <button type="button" onClick={() => void doAction(() => api.removeFriend(target.id), 'Arkadaşlıktan çıkarıldı.')}><UserMinus size={16}/><span><b>Arkadaşlıktan çıkar</b><small>DM geçmişi silinmez</small></span></button>}
      {!isSelf && <button type="button" className={blockedEntry ? '' : 'warning-item'} onClick={() => void doAction(() => blockedEntry ? api.unblockUser(target.id) : api.blockUser(target.id), blockedEntry ? 'Engel kaldırıldı.' : 'Kullanıcı engellendi.')}><ShieldAlert size={16}/><span><b>{blockedEntry ? 'Engeli kaldır' : 'Kullanıcıyı engelle'}</b><small>{blockedEntry ? 'İletişime tekrar izin ver' : 'Yeni iletişimi engelle'}</small></span></button>}
      {(canTimeout || canKick || canBan) && <div className="global-user-menu-separator"><span>MODERASYON</span></div>}
      {canTimeout && <button type="button" className="moderation-item" onClick={() => void moderate('timeout')}><Clock3 size={16}/><span><b>Süreli kısıtla</b><small>Mesaj yazmasını geçici durdur</small></span></button>}
      {canKick && <button type="button" className="moderation-item" onClick={() => void moderate('kick')}><UserMinus size={16}/><span><b>Sunucudan çıkar</b><small>Tekrar davetle katılabilir</small></span></button>}
      {canBan && <button type="button" className="danger-item" onClick={() => void moderate('ban')}><Ban size={16}/><span><b>Yasakla</b><small>Sunucu erişimini kapat</small></span></button>}
      <div className="global-user-menu-separator"/>
      <button type="button" onClick={() => void copyUserId(target)}><Copy size={16}/><span><b>Kullanıcı ID kopyala</b><small>{target.id.slice(0,8)}…</small></span></button>
    </div>}

    {profile && <div className="global-profile-backdrop" onMouseDown={event => { if (event.currentTarget === event.target) setProfile(null); }}>
      <section className="global-profile-card" role="dialog" aria-modal="true" aria-label={`${nameOf(profile.user)} profili`}>
        <button className="global-profile-close" aria-label="Profil kartını kapat" onClick={() => setProfile(null)}><X size={18}/></button>
        <div className="global-profile-banner"/>
        <div className="global-profile-avatar">{profile.user.avatarUrl ? <img src={profile.user.avatarUrl} alt=""/> : nameOf(profile.user).slice(0,2).toUpperCase()}</div>
        <div className="global-profile-copy"><h3>{nameOf(profile.user)}</h3><p>@{profile.user.username}</p><span>{profile.user.statusText || 'ShakeChat kullanıcısı'}</span></div>
        <div className="global-profile-info"><div><small>DURUM</small><b>{profile.user.profileMode === 'FOCUS' ? 'Rahatsız etmeyin' : profile.user.profileMode === 'AWAY' ? 'Boşta' : 'Çevrimiçi / müsait'}</b></div>{profile.member && <div><small>SUNUCU ROLÜ</small><b>{roleText(profile.member)}</b></div>}{profile.member?.joinedAt && <div><small>KATILMA</small><b>{new Date(profile.member.joinedAt).toLocaleDateString('tr-TR')}</b></div>}</div>
        <div className="global-profile-actions">{profile.user.id !== me?.id && friends.some(item => item.id === profile.user.id) && <button className="primary" onClick={() => void openDm(profile.user)}><MessageCircle size={16}/> Mesaj gönder</button>}<button onClick={() => void copyUserId(profile.user)}><Copy size={16}/> ID kopyala</button></div>
      </section>
    </div>}

    {notice && <div className="global-user-toast"><Volume2 size={15}/>{notice}</div>}
  </>;
}
