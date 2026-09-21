import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Hash, Home, MessageCircle, Search, Server as ServerIcon, Volume2, X } from 'lucide-react';
import { api, auth } from './api';
import type { DirectConversation, Server } from './api';

type QuickItem =
  | { key:string; kind:'home'; label:string; subtitle:string }
  | { key:string; kind:'server'; label:string; subtitle:string; serverId:string }
  | { key:string; kind:'channel'; label:string; subtitle:string; serverId:string; channelId:string; channelType:'TEXT'|'VOICE'; groupName?:string|null }
  | { key:string; kind:'dm'; label:string; subtitle:string; conversationId:string; userId?:string };

function normalize(value:string){
  return value.trim().toLocaleLowerCase('tr-TR');
}

function conversationLabel(conversation:DirectConversation){
  if(!conversation.isGroup&&conversation.other)return conversation.other.displayName||conversation.other.username;
  if(conversation.title?.trim())return conversation.title.trim();
  return conversation.members.slice(0,3).map(user=>user.displayName||user.username).join(', ')||'Grup sohbeti';
}

function serverButton(serverId:string,servers:Server[]){
  const buttons=[...document.querySelectorAll<HTMLButtonElement>('.serverbar button.server:not(.add)')];
  return buttons.find(button=>button.dataset.serverId===serverId) || buttons[servers.findIndex(server=>server.id===serverId)] || null;
}

function channelButton(channelId:string,channelName:string,groupName?:string|null){
  const buttons=[...document.querySelectorAll<HTMLButtonElement>('.flow-group button.channel')];
  const byId=buttons.find(button=>button.dataset.channelId===channelId);
  if(byId)return byId;
  const normalizedGroup=normalize(groupName||'');
  const candidates=buttons.filter(button=>normalize(button.querySelector('.flow-name')?.textContent||'')===normalize(channelName));
  if(candidates.length===1)return candidates[0];
  if(normalizedGroup){
    return candidates.find(button=>normalize(button.closest('.flow-group')?.querySelector('.section')?.textContent||'')===normalizedGroup)||null;
  }
  return candidates[0]||null;
}

function dmButton(label:string,userId?:string){
  const rows=[...document.querySelectorAll<HTMLButtonElement>('.social-sidebar .dm-nav')];
  if(userId){
    const byUser=rows.find(row=>row.dataset.userId===userId);
    if(byUser)return byUser;
  }
  const wanted=normalize(label);
  return rows.find(row=>normalize(row.querySelector('b')?.textContent||'')===wanted)||null;
}

async function waitFor<T>(read:()=>T|null,attempts=24,delay=70):Promise<T|null>{
  for(let index=0;index<attempts;index++){
    const value=read();
    if(value)return value;
    await new Promise(resolve=>window.setTimeout(resolve,delay));
  }
  return null;
}

function itemScore(item:QuickItem,query:string){
  if(!query)return 0;
  const label=normalize(item.label);
  const subtitle=normalize(item.subtitle);
  if(label===query)return 0;
  if(label.startsWith(query))return 1;
  if(label.includes(query))return 2;
  if(subtitle.startsWith(query))return 3;
  if(subtitle.includes(query))return 4;
  return 99;
}

function ItemIcon({item}:{item:QuickItem}){
  if(item.kind==='home')return <Home size={17}/>;
  if(item.kind==='server')return <ServerIcon size={17}/>;
  if(item.kind==='dm')return <MessageCircle size={17}/>;
  return item.channelType==='VOICE'?<Volume2 size={17}/>:<Hash size={17}/>;
}

export function QuickSwitcher(){
  const [appReady,setAppReady]=useState(false);
  const [open,setOpen]=useState(false);
  const [query,setQuery]=useState('');
  const [servers,setServers]=useState<Server[]>([]);
  const [dms,setDms]=useState<DirectConversation[]>([]);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [selected,setSelected]=useState(0);
  const inputRef=useRef<HTMLInputElement>(null);

  useEffect(()=>{
    const sync=()=>setAppReady(!!document.querySelector('.app-shell')&&!!auth.token());
    sync();
    const observer=new MutationObserver(sync);
    observer.observe(document.getElementById('root')||document.body,{childList:true,subtree:true});
    window.addEventListener('focus',sync);
    return()=>{observer.disconnect();window.removeEventListener('focus',sync)};
  },[]);

  useEffect(()=>{
    const key=(event:KeyboardEvent)=>{
      if(!appReady)return;
      if((event.ctrlKey||event.metaKey)&&event.key.toLocaleLowerCase('tr-TR')==='k'){
        event.preventDefault();
        setOpen(value=>!value);
      }else if(event.key==='Escape')setOpen(false);
    };
    window.addEventListener('keydown',key);
    return()=>window.removeEventListener('keydown',key);
  },[appReady]);

  useEffect(()=>{
    if(!open)return;
    let cancelled=false;
    setLoading(true);
    setError('');
    Promise.all([api.servers(),api.dms()])
      .then(([serverList,conversationList])=>{
        if(cancelled)return;
        setServers(serverList);
        setDms(conversationList);
      })
      .catch(err=>{if(!cancelled)setError(err instanceof Error?err.message:'Hızlı geçiş verileri alınamadı.')})
      .finally(()=>{if(!cancelled)setLoading(false)});
    window.requestAnimationFrame(()=>inputRef.current?.focus());
    return()=>{cancelled=true};
  },[open]);

  const items=useMemo<QuickItem[]>(()=>{
    const next:QuickItem[]=[{key:'home',kind:'home',label:'Arkadaşlar ve özel mesajlar',subtitle:'Ana alan'}];
    for(const server of servers){
      next.push({key:`server:${server.id}`,kind:'server',label:server.name,subtitle:'Alan',serverId:server.id});
      for(const channel of server.channels){
        next.push({
          key:`channel:${channel.id}`,
          kind:'channel',
          label:channel.name,
          subtitle:`${server.name} · ${channel.type==='VOICE'?'Ses':'Metin'}${channel.groupName?` · ${channel.groupName}`:''}`,
          serverId:server.id,
          channelId:channel.id,
          channelType:channel.type,
          groupName:channel.groupName,
        });
      }
    }
    for(const conversation of dms){
      next.push({
        key:`dm:${conversation.id}`,
        kind:'dm',
        label:conversationLabel(conversation),
        subtitle:conversation.isGroup?`Grup DM · ${conversation.members.length} kişi`:'Özel mesaj',
        conversationId:conversation.id,
        userId:!conversation.isGroup?conversation.other?.id:undefined,
      });
    }
    return next;
  },[servers,dms]);

  const results=useMemo(()=>{
    const q=normalize(query);
    return items
      .map((item,index)=>({item,index,score:itemScore(item,q)}))
      .filter(entry=>entry.score<99)
      .sort((a,b)=>a.score-b.score||a.index-b.index)
      .slice(0,14)
      .map(entry=>entry.item);
  },[items,query]);

  useEffect(()=>{setSelected(0)},[query,open]);
  useEffect(()=>{if(selected>=results.length)setSelected(Math.max(0,results.length-1))},[results.length,selected]);

  async function activate(item:QuickItem){
    setError('');
    if(item.kind==='home'){
      document.querySelector<HTMLButtonElement>('.serverbar button.home')?.click();
      setOpen(false);
      return;
    }
    if(item.kind==='server'){
      const button=serverButton(item.serverId,servers);
      if(!button){setError('Alan düğmesi bulunamadı.');return}
      button.click();
      setOpen(false);
      return;
    }
    if(item.kind==='channel'){
      const parent=serverButton(item.serverId,servers);
      if(!parent){setError('Kanalın alanı bulunamadı.');return}
      parent.click();
      const button=await waitFor(()=>channelButton(item.channelId,item.label,item.groupName));
      if(!button){setError('Kanal görünür hale gelmedi.');return}
      button.click();
      setOpen(false);
      return;
    }
    document.querySelector<HTMLButtonElement>('.serverbar button.home')?.click();
    const button=await waitFor(()=>dmButton(item.label,item.userId));
    if(!button){setError('Özel mesaj satırı bulunamadı.');return}
    button.click();
    setOpen(false);
  }

  function onKeyDown(event:ReactKeyboardEvent<HTMLInputElement>){
    if(event.key==='ArrowDown'){
      event.preventDefault();
      setSelected(value=>results.length?(value+1)%results.length:0);
    }else if(event.key==='ArrowUp'){
      event.preventDefault();
      setSelected(value=>results.length?(value-1+results.length)%results.length:0);
    }else if(event.key==='Enter'&&results[selected]){
      event.preventDefault();
      void activate(results[selected]);
    }else if(event.key==='Escape'){
      event.preventDefault();
      setOpen(false);
    }
  }

  if(!appReady)return null;

  return <>
    <button type="button" className="quick-switcher-launcher" title="Hızlı geçiş · Ctrl+K" aria-label="Hızlı geçişi aç" onClick={()=>setOpen(true)}><Search size={15}/><kbd>K</kbd></button>
    {open&&<div className="quick-switcher-backdrop" role="presentation" onMouseDown={event=>{if(event.currentTarget===event.target)setOpen(false)}}>
      <section className="quick-switcher-panel" role="dialog" aria-modal="true" aria-label="Hızlı geçiş">
        <header><div><b>Hızlı Geçiş</b><span>Alan, akış veya özel mesaja atla</span></div><button type="button" aria-label="Kapat" onClick={()=>setOpen(false)}><X size={17}/></button></header>
        <label className="quick-switcher-search"><Search size={18}/><input ref={inputRef} value={query} onChange={event=>setQuery(event.target.value)} onKeyDown={onKeyDown} placeholder="Bir alan, akış veya kişi ara…" autoComplete="off"/><kbd>Ctrl K</kbd></label>
        {error&&<div className="quick-switcher-error">{error}</div>}
        <div className="quick-switcher-results" role="listbox" aria-label="Hızlı geçiş sonuçları">
          {loading?<div className="quick-switcher-empty">Alanlar hazırlanıyor…</div>:results.length===0?<div className="quick-switcher-empty">Eşleşen bir yer yok.</div>:results.map((item,index)=><button key={item.key} type="button" role="option" aria-selected={selected===index} className={selected===index?'quick-switcher-item selected':'quick-switcher-item'} onMouseEnter={()=>setSelected(index)} onClick={()=>void activate(item)}><span className="quick-switcher-icon"><ItemIcon item={item}/></span><span className="quick-switcher-copy"><b>{item.label}</b><small>{item.subtitle}</small></span><span className="quick-switcher-kind">{item.kind==='channel'?(item.channelType==='VOICE'?'SES':'AKIŞ'):item.kind==='dm'?'DM':item.kind==='server'?'ALAN':'ANA'}</span></button>)}
        </div>
        <footer><span><kbd>↑</kbd><kbd>↓</kbd> seç</span><span><kbd>Enter</kbd> aç</span><span><kbd>Esc</kbd> kapat</span></footer>
      </section>
    </div>}
  </>;
}
