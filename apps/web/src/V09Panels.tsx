import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Bell, BellOff, ChevronDown, ChevronUp, CircleDot, Hash, Layers3, Lock, Search, Sparkles, Unlock, Volume2, X } from 'lucide-react';
import { api, Channel, ProfileMode, SearchMessageResult, Server, User } from './api';

export function MessageText({ content, currentUsername }:{content:string;currentUsername?:string}) {
  const parts = content.split(/(@[A-Za-z0-9_.-]{3,32})/g);
  return <>{parts.map((part,index)=>{
    if (!part.startsWith('@')) return <span key={index}>{part}</span>;
    const username = part.slice(1);
    const mine = !!currentUsername && username.toLocaleLowerCase('tr-TR') === currentUsername.toLocaleLowerCase('tr-TR');
    return <span key={index} className={mine?'mention-chip mention-self':'mention-chip'}>{part}</span>;
  })}</>;
}

export function profileModeLabel(mode?:ProfileMode){
  if(mode==='FOCUS')return 'Rahatsız etmeyin';
  if(mode==='AWAY')return 'Boşta';
  return 'Çevrimiçi';
}

export function ProfileModal({user,notificationsEnabled,onToggleNotifications,onClose,onSaved}:{
  user:User;notificationsEnabled:boolean;onToggleNotifications:()=>Promise<void>;onClose:()=>void;onSaved:(user:User)=>void;
}){
  const dialog=useRef<HTMLDialogElement>(null);
  const [displayName,setDisplayName]=useState(user.displayName||'');
  const [avatarUrl,setAvatarUrl]=useState(user.avatarUrl||'');
  const [statusText,setStatusText]=useState(user.statusText||'');
  const [profileMode,setProfileMode]=useState<ProfileMode>(user.profileMode||'AVAILABLE');
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  useEffect(()=>{dialog.current?.showModal()},[]);
  async function save(e:FormEvent){e.preventDefault();if(busy)return;setBusy(true);setError('');try{const updated=await api.updateMe({displayName,avatarUrl,statusText,profileMode});onSaved(updated);onClose()}catch(err){setError((err as Error).message)}finally{setBusy(false)}}
  return <dialog ref={dialog} className="modal-backdrop v09-dialog" aria-labelledby="profile-title" onCancel={e=>{e.preventDefault();onClose()}}>
    <form className="profile-panel" onSubmit={save}>
      <div className="panel-kicker"><Sparkles size={15}/> KİŞİSEL KART</div>
      <div className="modal-head"><div><h2 id="profile-title">Profilini düzenle</h2><p>ShakeChat içindeki görünen kimliğin. Kullanıcı adın değişmez.</p></div><button type="button" className="icon-btn" aria-label="Kapat" onClick={onClose}><X size={20}/></button></div>
      <div className="profile-preview"><div className="profile-preview-avatar">{avatarUrl?<img src={avatarUrl} alt=""/>:(displayName||user.username).slice(0,2).toUpperCase()}</div><div><b>{displayName||user.username}</b><span>@{user.username}</span><small>{statusText||profileModeLabel(profileMode)}</small></div></div>
      <div className="profile-fields">
        <label>GÖRÜNEN AD<input value={displayName} maxLength={48} onChange={e=>setDisplayName(e.target.value)} placeholder={user.username}/></label>
        <label>DURUM<select value={profileMode} onChange={e=>setProfileMode(e.target.value as ProfileMode)}><option value="AVAILABLE">Çevrimiçi</option><option value="AWAY">Boşta</option><option value="FOCUS">Rahatsız etmeyin</option></select></label>
        <label className="wide">KISA DURUM<input value={statusText} maxLength={96} onChange={e=>setStatusText(e.target.value)} placeholder="Örn. BDO'dayım, ses kanalındayım"/></label>
        <label className="wide">AVATAR BAĞLANTISI<input value={avatarUrl} maxLength={500} onChange={e=>setAvatarUrl(e.target.value)} placeholder="https://..."/></label>
      </div>
      <button type="button" className="notification-setting" onClick={()=>void onToggleNotifications()}>{notificationsEnabled?<Bell size={18}/>:<BellOff size={18}/>}<span><b>Masaüstü bildirimleri</b><small>{notificationsEnabled?'Açık · başka sekmedeyken yeni mesajları gösterir':'Kapalı · istersen tarayıcı izniyle açabilirsin'}</small></span><i>{notificationsEnabled?'AÇIK':'KAPALI'}</i></button>
      {error&&<div className="error banner">{error}</div>}
      <div className="modal-actions"><button type="button" className="ghost" onClick={onClose}>Vazgeç</button><button className="primary" disabled={busy}>{busy?'Kaydediliyor…':'Profili kaydet'}</button></div>
    </form>
  </dialog>;
}

export function SearchPanel({serverId,onClose,onPick}:{serverId:string;onClose:()=>void;onPick:(result:SearchMessageResult)=>void}){
  const dialog=useRef<HTMLDialogElement>(null);const input=useRef<HTMLInputElement>(null);
  const [query,setQuery]=useState('');const [results,setResults]=useState<SearchMessageResult[]>([]);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  useEffect(()=>{dialog.current?.showModal();setTimeout(()=>input.current?.focus(),0)},[]);
  async function search(e?:FormEvent){e?.preventDefault();const q=query.trim();if(q.length<2)return;setBusy(true);setError('');try{setResults(await api.searchMessages(serverId,q))}catch(err){setError((err as Error).message)}finally{setBusy(false)}}
  return <dialog ref={dialog} className="modal-backdrop v09-dialog" aria-labelledby="search-title" onCancel={e=>{e.preventDefault();onClose()}}>
    <div className="search-panel"><div className="modal-head"><div><div className="panel-kicker"><Search size={15}/> AKIŞ İÇİ ARAMA</div><h2 id="search-title">Mesaj bul</h2><p>Bu alandaki erişebildiğin yazı akışlarında ara.</p></div><button className="icon-btn" aria-label="Kapat" onClick={onClose}><X size={20}/></button></div>
      <form className="search-box" onSubmit={search}><Search size={19}/><input ref={input} value={query} onChange={e=>setQuery(e.target.value)} placeholder="En az 2 karakter yaz…" maxLength={80}/><button disabled={busy||query.trim().length<2}>{busy?'Aranıyor…':'Ara'}</button></form>
      {error&&<div className="error banner">{error}</div>}
      <div className="search-results">{!busy&&query.trim().length>=2&&results.length===0?<div className="search-empty">Sonuç yok.</div>:results.map(result=><button key={result.id} className="search-result" onClick={()=>onPick(result)}><div className="search-result-top"><span><Hash size={13}/>{result.channel.name}</span><time>{new Date(result.createdAt).toLocaleString('tr-TR')}</time></div><b>{result.author.displayName||result.author.username}</b><p>{result.content.slice(0,260)}</p></button>)}</div>
    </div>
  </dialog>;
}

type DraftMap=Record<string,string>;
export function ChannelOrganizer({server,onChanged}:{server:Server;onChanged:()=>Promise<void>|void}){
  const ordered=useMemo(()=>[...server.channels].sort((a,b)=>a.position-b.position),[server.channels]);
  const [drafts,setDrafts]=useState<DraftMap>(()=>Object.fromEntries(server.channels.map(channel=>[channel.id,channel.groupName||''])));
  const [busy,setBusy]=useState('');const [error,setError]=useState('');
  useEffect(()=>setDrafts(Object.fromEntries(server.channels.map(channel=>[channel.id,channel.groupName||'']))),[server.channels]);
  async function saveGroup(channel:Channel){if(busy)return;setBusy(`group:${channel.id}`);setError('');try{await api.updateChannel(server.id,channel.id,{groupName:drafts[channel.id]||''});await onChanged()}catch(err){setError((err as Error).message)}finally{setBusy('')}}
  async function saveSlowMode(channel:Channel,slowModeSeconds:number){if(busy||channel.type!=='TEXT')return;setBusy(`slow:${channel.id}`);setError('');try{await api.updateChannel(server.id,channel.id,{slowModeSeconds});await onChanged()}catch(err){setError((err as Error).message)}finally{setBusy('')}}
  async function toggleLock(channel:Channel){if(busy||channel.type!=='TEXT')return;setBusy(`lock:${channel.id}`);setError('');try{await api.updateChannel(server.id,channel.id,{isLocked:!channel.isLocked});await onChanged()}catch(err){setError((err as Error).message)}finally{setBusy('')}}
  async function move(channel:Channel,delta:number){const index=ordered.findIndex(item=>item.id===channel.id);const next=index+delta;if(next<0||next>=ordered.length||busy)return;setBusy(`move:${channel.id}`);setError('');try{await api.updateChannel(server.id,channel.id,{position:next});await onChanged()}catch(err){setError((err as Error).message)}finally{setBusy('')}}
  return <div className="flow-organizer"><div className="flow-organizer-note"><Layers3 size={18}/><div><b>Akış düzeni</b><span>Akışları sırala, bölüm etiketlerini düzenle, mesaj aralığını belirle veya gerektiğinde yazmayı kilitle.</span></div></div>{error&&<div className="error banner">{error}</div>}
    <div className="flow-organizer-list">{ordered.map((channel,index)=><div className="flow-organizer-row" key={channel.id}><div className="flow-kind">{channel.type==='VOICE'?<Volume2 size={17}/>:<Hash size={17}/>}<span><b>{channel.name}</b><small>{channel.type==='VOICE'?'Ses akışı':'Yazı akışı'}</small></span></div><label>BÖLÜM<input value={drafts[channel.id]??''} maxLength={40} placeholder={channel.type==='VOICE'?'Ses Alanı':'Sohbet'} onChange={e=>setDrafts(previous=>({...previous,[channel.id]:e.target.value}))} onBlur={()=>void saveGroup(channel)}/></label>{channel.type==='TEXT'?<><label>MESAJ ARALIĞI<select aria-label={`${channel.name} yavaş mod`} value={channel.slowModeSeconds||0} disabled={!!busy} onChange={e=>void saveSlowMode(channel,Number(e.target.value))}><option value={0}>Kapalı</option><option value={5}>5 sn</option><option value={10}>10 sn</option><option value={30}>30 sn</option><option value={60}>1 dk</option><option value={120}>2 dk</option><option value={300}>5 dk</option><option value={600}>10 dk</option></select></label><button type="button" className={channel.isLocked?'flow-lock active':'flow-lock'} aria-label={`${channel.name} ${channel.isLocked?'kilidini aç':'kilitle'}`} disabled={!!busy} onClick={()=>void toggleLock(channel)}>{channel.isLocked?<Unlock size={16}/>:<Lock size={16}/>}<span>{channel.isLocked?'Kilidi aç':'Kilitle'}</span></button></>:<div className="flow-slow-disabled"><small>Yavaş mod / kilit</small><span>Ses akışında kullanılmaz</span></div>}<div className="flow-move"><button aria-label={`${channel.name} yukarı taşı`} disabled={index===0||!!busy} onClick={()=>void move(channel,-1)}><ChevronUp size={17}/></button><button aria-label={`${channel.name} aşağı taşı`} disabled={index===ordered.length-1||!!busy} onClick={()=>void move(channel,1)}><ChevronDown size={17}/></button></div></div>)}</div>
  </div>;
}

export function ProfileModeDot({mode}:{mode?:ProfileMode}){return <span className={`profile-mode-dot ${mode||'AVAILABLE'}`} title={profileModeLabel(mode)}><CircleDot size={11}/></span>}
