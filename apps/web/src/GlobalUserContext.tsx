import { useEffect, useMemo, useRef, useState } from 'react';
import { Ban, Clock3, Copy, MessageCircle, Mic, MicOff, Radio, ShieldAlert, UserMinus, UserPlus, UserRound, Volume2, VolumeX, X } from 'lucide-react';
import { api, auth, BlockedUser, DirectConversation, Friend, FriendRequests, Member, Permission, Server, User } from './api';

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
  voiceIdentity?: string;
};

type VoiceContextParticipant = {
  identity:string;
  name:string;
  local:boolean;
  speaking:boolean;
  muted:boolean;
  camera:boolean;
  screen:boolean;
};

type VoiceSnapshot = {
  participants:VoiceContextParticipant[];
  participantVolumes:Record<string,number>;
  locallyMutedParticipants:string[];
};

type BaseSnapshot = {
  user:User;
  servers:Server[];
  friends:Friend[];
  requests:FriendRequests;
  blocked:BlockedUser[];
  dms:DirectConversation[];
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

function profileModeText(user:User){
  if(user.profileMode==='FOCUS')return 'Rahatsız etmeyin';
  if(user.profileMode==='AWAY')return 'Boşta';
  return 'Çevrimiçi';
}

function extractTargetName(element: Element) {
  if (element.matches('.voice-dock-member')) return element.querySelector('.voice-dock-member-copy b')?.textContent || '';
  if (element.matches('.messages article')) return element.querySelector('.msg-meta b')?.textContent || '';
  if (element.matches('.group-member-list > div')) return element.querySelector('span')?.textContent || '';
  if (element.matches('.dm-profile')) return element.querySelector('h3')?.textContent || '';
  if (element.matches('.dm-nav')) return element.querySelector('b')?.textContent || '';
  return element.querySelector('b')?.textContent || '';
}

function supportedTarget(start: EventTarget | null) {
  if (!(start instanceof Element)) return null;
  return start.closest('.voice-dock-member,.members .member,.members .group-member-list>div,.members .dm-profile,.messages article,.friends-home .social-row,.social-sidebar .dm-nav');
}

function usersFromSnapshot(snapshot:BaseSnapshot){
  const map=new Map<string,User>();
  const add=(user?:User|null)=>{if(user)map.set(user.id,user)};
  add(snapshot.user);
  snapshot.friends.forEach(add);
  snapshot.requests.incoming.forEach(item=>add(item.user));
  snapshot.requests.outgoing.forEach(item=>add(item.user));
  snapshot.blocked.forEach(item=>add(item.user));
  snapshot.dms.forEach(conversation=>{conversation.members.forEach(add);add(conversation.other)});
  return [...map.values()];
}

export function GlobalUserContext() {
  const [me, setMe] = useState<User | null>(null);
  const [servers, setServers] = useState<Server[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [requests, setRequests] = useState<FriendRequests>({ incoming: [], outgoing: [] });
  const [blocked, setBlocked] = useState<BlockedUser[]>([]);
  const [dms, setDms] = useState<DirectConversation[]>([]);
  const [serverMembers, setServerMembers] = useState<Member[]>([]);
  const [voiceSnapshot,setVoiceSnapshot]=useState<VoiceSnapshot>({participants:[],participantVolumes:{},locallyMutedParticipants:[]});
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

  async function refreshBase():Promise<BaseSnapshot|undefined> {
    if(!auth.token())return undefined;
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
      return {user,servers:serverList,friends:friendList,requests:requestList,blocked:blockedList,dms:conversations};
    } catch {
      // The main app owns session/error handling. Context UI should never block it.
      return undefined;
    }
  }

  function activeServerFromDom(list: Server[] = servers) {
    const title = document.querySelector('.space-header span')?.textContent?.trim();
    if (title) {
      const active=list.find(server => server.name === title);
      if(active)return active;
    }
    const voiceTitle=document.querySelector('.voice-dock-copy b')?.textContent?.trim();
    if(voiceTitle?.includes(' / ')){
      const serverName=voiceTitle.split(' / ')[0]?.trim();
      const voiceServer=list.find(server=>server.name===serverName);
      if(voiceServer)return voiceServer;
    }
    return undefined;
  }

  async function loadActiveServerContext(listOverride?:Server[]) {
    let list = listOverride?.length ? listOverride : servers;
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

  function resolveByLabel(label: string, members: Member[], extraUsers:User[]=baseUsers) {
    const wanted = normalize(label);
    if (!wanted) return undefined;
    const candidates = new Map<string, User>();
    const add = (user: User) => candidates.set(user.id, user);
    extraUsers.forEach(add);
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
    if(auth.token())void refreshBase();
    const socialRefresh = () => {if(auth.token())void refreshBase()};
    const visibilityRefresh=()=>{if(document.visibilityState==='visible'&&auth.token())void refreshBase()};
    window.addEventListener('focus', socialRefresh);
    document.addEventListener('visibilitychange',visibilityRefresh);
    return () => {
      window.removeEventListener('focus', socialRefresh);
      document.removeEventListener('visibilitychange',visibilityRefresh);
      if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    };
  }, []);

  useEffect(()=>{
    const snapshot=(event:Event)=>{
      const detail=(event as CustomEvent<VoiceSnapshot>).detail;
      if(detail)setVoiceSnapshot(detail);
    };
    window.addEventListener('shakechat:voice-snapshot',snapshot as EventListener);
    return()=>window.removeEventListener('shakechat:voice-snapshot',snapshot as EventListener);
  },[]);

  useEffect(() => {
    const onContextMenu = async (event: MouseEvent) => {
      const targetElement = supportedTarget(event.target);
      if (!targetElement || !auth.token()) return;
      const label = extractTargetName(targetElement);
      const directUserId=(targetElement as HTMLElement).dataset.userId;
      const voiceIdentity=(targetElement as HTMLElement).dataset.voiceUserId;
      if (!label && !directUserId && !voiceIdentity) return;
      event.preventDefault();
      event.stopPropagation();
      const fresh=(!me||!servers.length||!baseUsers.length)?await refreshBase():undefined;
      const fallbackUsers=fresh?usersFromSnapshot(fresh):baseUsers;
      const context = await loadActiveServerContext(fresh?.servers);
      const resolvedId=voiceIdentity||directUserId;
      const user = resolvedId
        ? (context.members.find(item=>item.id===resolvedId)||fallbackUsers.find(item=>item.id===resolvedId))
        : resolveByLabel(label, context.members, fallbackUsers);
      if (!user) {
        showNotice('Kullanıcı eşleştirilemedi. Profil adı benzersiz olmayabilir.');
        return;
      }
      const member = context.members.find(item => item.id === user.id);
      const width = 304;
      const height = voiceIdentity ? 620 : 470;
      const pad = 10;
      const x = Math.max(pad, Math.min(event.clientX, window.innerWidth - width - pad));
      const y = Math.max(pad, Math.min(event.clientY, window.innerHeight - height - pad));
      setMenu({ x, y, target: { user, member }, server: context.server, permissions: context.permissions, voiceIdentity });
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
  }, [me, servers, baseUsers, serverMembers]);

  const target = menu?.target.user;
  const isSelf = !!target && target.id === me?.id;
  const friend = target ? friends.find(item => item.id === target.id) : undefined;
  const blockedEntry = target ? blocked.find(item => item.user.id === target.id) : undefined;
  const incoming = target ? requests.incoming.find(item => item.user.id === target.id) : undefined;
  const outgoing = target ? requests.outgoing.find(item => item.user.id === target.id) : undefined;
  const existingDm = target ? dms.some(conversation => !conversation.isGroup && conversation.other?.id === target.id) : false;
  const canDirectMessage = !!target && !isSelf && !blockedEntry && (!!friend || !!menu?.target.member || existingDm);
  const isOwner = !!menu?.target.member && menu.target.member.role === 'OWNER';
  const canAdmin = (permission: Permission) => !!menu && (menu.permissions.includes('ADMINISTRATOR') || menu.permissions.includes(permission));
  const canKick = !isSelf && !isOwner && canAdmin('KICK_MEMBERS');
  const canBan = !isSelf && !isOwner && canAdmin('BAN_MEMBERS');
  const canTimeout = !isSelf && !isOwner && canAdmin('MODERATE_MEMBERS');
  const voiceParticipant=menu?.voiceIdentity?voiceSnapshot.participants.find(person=>person.identity===menu.voiceIdentity):undefined;
  const voiceVolume=voiceParticipant?(voiceSnapshot.participantVolumes[voiceParticipant.identity]??100):100;
  const voiceLocallyMuted=voiceParticipant?voiceSnapshot.locallyMutedParticipants.includes(voiceParticipant.identity):false;
  const profileCanDm = !!profile && profile.user.id !== me?.id && !blocked.some(item=>item.user.id===profile.user.id) && (
    friends.some(item=>item.id===profile.user.id) ||
    !!profile.member ||
    dms.some(conversation=>!conversation.isGroup && conversation.other?.id===profile.user.id)
  );

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

  function sendVoiceAction(type:'volume'|'toggle-local-mute',identity:string,value?:number){
    setVoiceSnapshot(previous=>{
      if(type==='volume'&&typeof value==='number')return {...previous,participantVolumes:{...previous.participantVolumes,[identity]:value}};
      const muted=previous.locallyMutedParticipants.includes(identity);
      return {...previous,locallyMutedParticipants:muted?previous.locallyMutedParticipants.filter(item=>item!==identity):[...previous.locallyMutedParticipants,identity]};
    });
    window.dispatchEvent(new CustomEvent('shakechat:voice-action',{detail:{type,identity,value}}));
  }

  async function openDm(user: User) {
    try {
      await api.openDm(user.id);
      await refreshBase();
      setMenu(null);
      setProfile(null);
      (document.querySelector('.home') as HTMLButtonElement | null)?.click();
      const label = nameOf(user);
      for (let i = 0; i < 14; i++) {
        await new Promise(resolve => window.setTimeout(resolve, 90));
        const rows = [...document.querySelectorAll('.dm-nav')] as HTMLElement[];
        const row = rows.find(item => item.dataset.userId===user.id || normalize(item.querySelector('b')?.textContent) === normalize(label) || normalize(item.querySelector('b')?.textContent) === normalize(user.username));
        if (row) { row.click(); break; }
      }
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

  const voiceStateText=voiceParticipant?(voiceParticipant.screen?'Yayın yapıyor':voiceParticipant.speaking?'Konuşuyor':voiceParticipant.muted?'Mikrofon kapalı':'Ses kanalında'):'';

  return <>
    {menu && target && <div className="global-user-menu" role="menu" aria-label={`${nameOf(target)} kullanıcı menüsü`} style={{ left: menu.x, top: menu.y }} onPointerDown={event => event.stopPropagation()} onContextMenu={event => event.preventDefault()}>
      <div className="global-user-menu-head">
        <div className="global-user-avatar">{target.avatarUrl ? <img src={target.avatarUrl} alt=""/> : nameOf(target).slice(0,2).toUpperCase()}</div>
        <div><b>{nameOf(target)}{isSelf ? ' · Sen' : ''}</b><small>@{target.username}</small><span>{menu.target.member ? roleText(menu.target.member) : (target.statusText || profileModeText(target))}{voiceStateText?` · ${voiceStateText}`:''}</span></div>
      </div>
      <button type="button" onClick={() => { setProfile(menu.target); setMenu(null); }}><UserRound size={16}/><span><b>Profili görüntüle</b><small>Kullanıcı kartını aç</small></span></button>

      {voiceParticipant&&<><div className="global-user-menu-separator"><span>SES KONTROLLERİ</span></div>{voiceParticipant.local?<div className="global-user-menu-note"><Mic size={15}/><span>Bu sensin. Mikrofon, kulaklık, kamera ve yayın kontrollerin alt ses çubuğunda.</span></div>:<><button type="button" className={voiceLocallyMuted?'voice-context-mute active':'voice-context-mute'} onClick={()=>sendVoiceAction('toggle-local-mute',voiceParticipant.identity)}>{voiceLocallyMuted?<Volume2 size={16}/>:<VolumeX size={16}/>}<span><b>{voiceLocallyMuted?'Yerel sesi aç':'Yerel sessize al'}</b><small>Sadece senin tarafında uygulanır</small></span></button><label className="global-user-volume"><span>SES SEVİYESİ <b>{voiceVolume}%</b></span><input aria-label={`${voiceParticipant.name} ses seviyesi hızlı menü`} type="range" min="0" max="100" step="5" value={voiceVolume} onChange={event=>sendVoiceAction('volume',voiceParticipant.identity,Number(event.target.value))}/></label><div className="global-user-volume-presets" aria-label="Hızlı ses seviyeleri">{[25,50,75,100].map(value=><button key={value} type="button" className={voiceVolume===value?'active':''} onClick={()=>sendVoiceAction('volume',voiceParticipant.identity,value)}>{value}%</button>)}</div><div className="global-voice-state">{voiceParticipant.screen?<><Radio size={13}/> LIVE · ekran paylaşıyor</>:voiceParticipant.muted?<><MicOff size={13}/> Mikrofon kapalı</>:voiceParticipant.speaking?<><Mic size={13}/> Konuşuyor</>:<><Mic size={13}/> Ses kanalında</>}</div></>}</>}

      {canDirectMessage && <button type="button" onClick={() => void openDm(target)}><MessageCircle size={16}/><span><b>Özel mesaj</b><small>{friend?'DM sohbetini aç':menu?.target.member?'Aynı sunucudan DM aç':'DM sohbetini aç'}</small></span></button>}
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
        <div className="global-profile-copy"><h3>{nameOf(profile.user)}</h3><p>@{profile.user.username}</p><span>{profile.user.statusText || profileModeText(profile.user)}</span></div>
        <div className="global-profile-info"><div><small>DURUM</small><b className={`global-presence ${profile.user.profileMode||'AVAILABLE'}`}>{profileModeText(profile.user)}</b></div>{profile.member && <div><small>SUNUCU ROLÜ</small><b>{roleText(profile.member)}</b></div>}{profile.member?.joinedAt && <div><small>KATILMA</small><b>{new Date(profile.member.joinedAt).toLocaleDateString('tr-TR')}</b></div>}</div>
        <div className="global-profile-actions">{profileCanDm && <button className="primary" onClick={() => void openDm(profile.user)}><MessageCircle size={16}/> Mesaj gönder</button>}<button onClick={() => void copyUserId(profile.user)}><Copy size={16}/> ID kopyala</button></div>
      </section>
    </div>}

    {notice && <div className="global-user-toast"><Volume2 size={15}/>{notice}</div>}
  </>;
}
