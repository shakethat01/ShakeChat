import { useEffect, useRef, useState } from 'react';
import { CheckCheck, ChevronRight, Edit3, Hash, Lock, Settings, Trash2, Unlock, Volume2 } from 'lucide-react';
import { api, Channel, Permission, Server } from './api';

type MenuState =
  | { kind:'server'; x:number; y:number; server:Server; permissions:Permission[] }
  | { kind:'group'; x:number; y:number; server:Server; groupLabel:string; groupName:string; channels:Channel[]; permissions:Permission[]; collapsed:boolean }
  | { kind:'channel'; x:number; y:number; server:Server; channel:Channel; permissions:Permission[] };

type DragState = { serverId:string; channelId:string } | null;
const COLLAPSED_KEY='shakechat.sidebar-collapsed.v23';

function hasPermission(permissions:Permission[], permission:Permission){
  return permissions.includes('ADMINISTRATOR') || permissions.includes(permission);
}

function clampMenuPoint(x:number,y:number,width=292,height=430){
  const pad=10;
  return {
    x:Math.max(pad,Math.min(x,window.innerWidth-width-pad)),
    y:Math.max(pad,Math.min(y,window.innerHeight-height-pad)),
  };
}

function serverButtons(){
  return [...document.querySelectorAll<HTMLButtonElement>('.serverbar button.server:not(.add)')];
}

function resolveServerFromButton(button:HTMLButtonElement, servers:Server[]){
  const buttons=serverButtons();
  const index=buttons.indexOf(button);
  if(index>=0 && servers[index]) return servers[index];
  const label=(button.getAttribute('title')||button.getAttribute('aria-label')||'').trim();
  return servers.find(server=>server.name===label);
}

function activeServer(servers:Server[]){
  const active=document.querySelector<HTMLButtonElement>('.serverbar button.server.active');
  return active ? resolveServerFromButton(active,servers) : undefined;
}

function normalizedGroup(channel:Channel){
  return (channel.groupName?.trim() || (channel.type==='VOICE'?'Ses Alanı':'Sohbet')).toLocaleUpperCase('tr-TR');
}

function prettifyGroupLabel(label:string){
  return label.toLocaleLowerCase('tr-TR').split(/\s+/).filter(Boolean).map(word=>word.charAt(0).toLocaleUpperCase('tr-TR')+word.slice(1)).join(' ');
}

function groupNameForLabel(server:Server,label:string){
  return server.channels.find(channel=>normalizedGroup(channel)===label && channel.groupName?.trim())?.groupName?.trim() || prettifyGroupLabel(label);
}

function dropGroupName(server:Server,label:string,source:Channel){
  const ownDefault=source.type==='VOICE'?'SES ALANI':'SOHBET';
  const hasExplicit=server.channels.some(channel=>normalizedGroup(channel)===label && !!channel.groupName?.trim());
  return label===ownDefault&&!hasExplicit ? '' : groupNameForLabel(server,label);
}

function groupLabelFromSection(section:HTMLElement){
  return section.textContent?.trim().toLocaleUpperCase('tr-TR')||'';
}

function resolveChannelFromButton(button:HTMLButtonElement, server?:Server){
  if(!server)return undefined;
  const name=button.querySelector('.flow-name')?.textContent?.trim() || '';
  if(!name)return undefined;
  const group=button.closest('.flow-group')?.querySelector('.section')?.textContent?.trim().toLocaleUpperCase('tr-TR') || '';
  const candidates=server.channels.filter(channel=>channel.name===name);
  if(candidates.length===1)return candidates[0];
  return candidates.find(channel=>normalizedGroup(channel)===group) || candidates[0];
}

function clickLater(selector:string,delay=60){
  window.setTimeout(()=>document.querySelector<HTMLButtonElement>(selector)?.click(),delay);
}

function loadCollapsedGroups(){
  try{
    const parsed=JSON.parse(localStorage.getItem(COLLAPSED_KEY)||'{}');
    return parsed && typeof parsed==='object' ? parsed as Record<string,boolean> : {};
  }catch{return {} as Record<string,boolean>}
}

function collapsedKey(serverId:string,label:string){return `${serverId}:${label}`}

export function SidebarInteractions(){
  const [servers,setServers]=useState<Server[]>([]);
  const [menu,setMenu]=useState<MenuState|null>(null);
  const [notice,setNotice]=useState('');
  const noticeTimer=useRef<number|null>(null);
  const serversRef=useRef<Server[]>([]);
  const manageServerRef=useRef<string>('');
  const dragRef=useRef<DragState>(null);
  const collapsedRef=useRef<Record<string,boolean>>(loadCollapsedGroups());

  function showNotice(message:string){
    setNotice(message);
    if(noticeTimer.current)window.clearTimeout(noticeTimer.current);
    noticeTimer.current=window.setTimeout(()=>setNotice(''),3200);
  }

  function isGroupCollapsed(serverId:string,label:string){return !!collapsedRef.current[collapsedKey(serverId,label)]}

  function applyGroupState(server?:Server){
    if(!server)return;
    document.querySelectorAll<HTMLElement>('.flow-group').forEach(group=>{
      const section=group.querySelector<HTMLElement>(':scope > .section');
      const label=section?groupLabelFromSection(section):'';
      if(!section||!label)return;
      const collapsed=isGroupCollapsed(server.id,label);
      const hasUnread=!!group.querySelector(':scope > button.channel .unread-badge');
      group.classList.add('sidebar-collapsible');
      group.classList.toggle('sidebar-collapsed',collapsed);
      group.classList.toggle('sidebar-group-unread',hasUnread);
      section.setAttribute('role','button');
      section.tabIndex=0;
      section.setAttribute('aria-expanded',String(!collapsed));
      section.title=collapsed?'Kategoriyi aç':'Kategoriyi daralt';
    });
  }

  function markFirstUnread(){
    document.querySelectorAll('.channel.sidebar-first-unread').forEach(node=>node.classList.remove('sidebar-first-unread'));
    const first=[...document.querySelectorAll<HTMLButtonElement>('.flow-group button.channel')]
      .find(button=>!!button.querySelector('.unread-badge')&&!button.closest('.flow-group')?.classList.contains('sidebar-collapsed'));
    first?.classList.add('sidebar-first-unread');
  }

  function setGroupCollapsed(server:Server,label:string,collapsed:boolean){
    const key=collapsedKey(server.id,label);
    if(collapsed)collapsedRef.current[key]=true; else delete collapsedRef.current[key];
    try{localStorage.setItem(COLLAPSED_KEY,JSON.stringify(collapsedRef.current))}catch{/* Local storage may be unavailable. */}
    applyGroupState(server);
    markFirstUnread();
  }

  async function refreshServers(){
    try{
      const list=await api.servers();
      serversRef.current=list;
      setServers(list);
      const current=activeServer(list);
      manageServerRef.current='';
      if(current){
        const result=await api.myPermissions(current.id).catch(()=>({permissions:[] as Permission[]}));
        manageServerRef.current=hasPermission(result.permissions,'MANAGE_CHANNELS')?current.id:'';
        applyGroupState(current);
        markFirstUnread();
      }
    }catch{/* Main app owns auth/error state. */}
  }

  async function refreshAndReload(message:string){
    showNotice(message);
    await refreshServers();
    window.setTimeout(()=>window.location.reload(),260);
  }

  useEffect(()=>{
    void refreshServers();
    const focus=()=>void refreshServers();
    const click=(event:MouseEvent)=>{
      const target=event.target instanceof Element?event.target:null;
      const serverButton=target?.closest('.serverbar button.server:not(.add)');
      if(serverButton){window.setTimeout(()=>void refreshServers(),80);return}
      const section=target?.closest<HTMLElement>('.flow-group > .section');
      if(!section || event.button!==0)return;
      const server=activeServer(serversRef.current);
      const label=groupLabelFromSection(section);
      if(!server||!label)return;
      setGroupCollapsed(server,label,!isGroupCollapsed(server.id,label));
    };
    const key=(event:KeyboardEvent)=>{
      if(event.key!=='Enter'&&event.key!==' ')return;
      const target=event.target instanceof Element?event.target:null;
      const section=target?.closest<HTMLElement>('.flow-group > .section');
      if(!section)return;
      const server=activeServer(serversRef.current);
      const label=groupLabelFromSection(section);
      if(!server||!label)return;
      event.preventDefault();
      setGroupCollapsed(server,label,!isGroupCollapsed(server.id,label));
    };
    window.addEventListener('focus',focus);
    document.addEventListener('click',click,true);
    document.addEventListener('keydown',key,true);
    return()=>{
      window.removeEventListener('focus',focus);
      document.removeEventListener('click',click,true);
      document.removeEventListener('keydown',key,true);
      if(noticeTimer.current)window.clearTimeout(noticeTimer.current);
    };
  },[]);

  useEffect(()=>{
    const decorateSidebar=()=>{
      const current=activeServer(serversRef.current);
      const canManage=!!current && manageServerRef.current===current.id;
      document.querySelectorAll<HTMLButtonElement>('.flow-group button.channel').forEach(button=>{
        button.draggable=canManage;
        button.classList.toggle('channel-draggable',canManage);
      });
      applyGroupState(current);
      markFirstUnread();
    };
    decorateSidebar();
    const root=document.querySelector('.channel-list')||document.body;
    const observer=new MutationObserver(decorateSidebar);
    observer.observe(root,{subtree:true,childList:true});
    return()=>observer.disconnect();
  },[servers]);

  useEffect(()=>{
    const onContext=async(event:MouseEvent)=>{
      const element=event.target instanceof Element?event.target:null;
      if(!element)return;
      const serverButton=element.closest<HTMLButtonElement>('.serverbar button.server:not(.add)');
      const groupSection=element.closest<HTMLElement>('.flow-group > .section');
      const channelButton=element.closest<HTMLButtonElement>('.flow-group button.channel');
      if(!serverButton&&!groupSection&&!channelButton)return;
      event.preventDefault();
      event.stopPropagation();

      let list=serversRef.current;
      if(!list.length){
        try{list=await api.servers();serversRef.current=list;setServers(list)}catch{return}
      }
      if(serverButton){
        const server=resolveServerFromButton(serverButton,list);
        if(!server)return;
        const permissions=(await api.myPermissions(server.id).catch(()=>({permissions:[] as Permission[]}))).permissions;
        const point=clampMenuPoint(event.clientX,event.clientY,292,370);
        setMenu({kind:'server',...point,server,permissions});
        return;
      }
      const server=activeServer(list);
      if(!server)return;
      if(groupSection){
        const groupLabel=groupLabelFromSection(groupSection);
        if(!groupLabel)return;
        const channels=server.channels.filter(channel=>normalizedGroup(channel)===groupLabel);
        const permissions=(await api.myPermissions(server.id).catch(()=>({permissions:[] as Permission[]}))).permissions;
        const point=clampMenuPoint(event.clientX,event.clientY,300,430);
        setMenu({kind:'group',...point,server,groupLabel,groupName:groupNameForLabel(server,groupLabel),channels,permissions,collapsed:isGroupCollapsed(server.id,groupLabel)});
        return;
      }
      const channel=resolveChannelFromButton(channelButton!,server);
      if(!channel)return;
      const permissions=(await api.myPermissions(server.id,channel.id).catch(()=>({permissions:[] as Permission[]}))).permissions;
      const point=clampMenuPoint(event.clientX,event.clientY,300,480);
      setMenu({kind:'channel',...point,server,channel,permissions});
    };
    const close=()=>setMenu(null);
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape')setMenu(null)};
    document.addEventListener('contextmenu',onContext,true);
    window.addEventListener('pointerdown',close);
    window.addEventListener('blur',close);
    window.addEventListener('scroll',close,true);
    window.addEventListener('keydown',key);
    return()=>{
      document.removeEventListener('contextmenu',onContext,true);
      window.removeEventListener('pointerdown',close);
      window.removeEventListener('blur',close);
      window.removeEventListener('scroll',close,true);
      window.removeEventListener('keydown',key);
    };
  },[]);

  useEffect(()=>{
    const clearTargets=()=>{
      document.querySelectorAll('.channel-drop-target').forEach(node=>node.classList.remove('channel-drop-target'));
      document.querySelectorAll('.group-drop-target').forEach(node=>node.classList.remove('group-drop-target'));
    };
    const onDragStart=(event:DragEvent)=>{
      const button=event.target instanceof Element?event.target.closest<HTMLButtonElement>('.flow-group button.channel'):null;
      if(!button||!button.draggable)return;
      const server=activeServer(serversRef.current);
      const channel=resolveChannelFromButton(button,server);
      if(!server||!channel||manageServerRef.current!==server.id){event.preventDefault();return}
      dragRef.current={serverId:server.id,channelId:channel.id};
      button.classList.add('channel-dragging');
      event.dataTransfer?.setData('text/plain',channel.id);
      if(event.dataTransfer)event.dataTransfer.effectAllowed='move';
    };
    const onDragOver=(event:DragEvent)=>{
      if(!dragRef.current)return;
      const element=event.target instanceof Element?event.target:null;
      const target=element?.closest<HTMLButtonElement>('.flow-group button.channel');
      const groupSection=element?.closest<HTMLElement>('.flow-group > .section');
      if(!target&&!groupSection)return;
      event.preventDefault();
      clearTargets();
      if(target)target.classList.add('channel-drop-target');
      else groupSection?.classList.add('group-drop-target');
      if(event.dataTransfer)event.dataTransfer.dropEffect='move';
    };
    const onDrop=async(event:DragEvent)=>{
      const element=event.target instanceof Element?event.target:null;
      const targetButton=element?.closest<HTMLButtonElement>('.flow-group button.channel')||null;
      const groupSection=element?.closest<HTMLElement>('.flow-group > .section')||null;
      const drag=dragRef.current;
      dragRef.current=null;
      clearTargets();
      document.querySelectorAll('.channel-dragging').forEach(node=>node.classList.remove('channel-dragging'));
      if((!targetButton&&!groupSection)||!drag)return;
      event.preventDefault();
      const server=serversRef.current.find(item=>item.id===drag.serverId);
      const source=server?.channels.find(item=>item.id===drag.channelId);
      if(!server||!source)return;
      try{
        if(groupSection){
          const label=groupLabelFromSection(groupSection);
          if(!label)return;
          const targetChannels=server.channels.filter(channel=>normalizedGroup(channel)===label && channel.id!==source.id);
          const position=targetChannels.length?Math.max(...targetChannels.map(channel=>channel.position))+1:source.position;
          await api.updateChannel(server.id,source.id,{position,groupName:dropGroupName(server,label,source)});
          await refreshAndReload(`${source.name} → ${prettifyGroupLabel(label)} taşındı.`);
          return;
        }
        const target=resolveChannelFromButton(targetButton!,server);
        if(!target||source.id===target.id)return;
        const targetGroupName=target.groupName?.trim() || (source.type===target.type ? '' : prettifyGroupLabel(normalizedGroup(target)));
        await api.updateChannel(server.id,source.id,{position:target.position,groupName:targetGroupName});
        await refreshAndReload(`${source.name} taşındı.`);
      }catch(error){showNotice(error instanceof Error?error.message:'Akış taşınamadı.')}
    };
    const onDragEnd=()=>{
      dragRef.current=null;
      clearTargets();
      document.querySelectorAll('.channel-dragging').forEach(node=>node.classList.remove('channel-dragging'));
    };
    document.addEventListener('dragstart',onDragStart,true);
    document.addEventListener('dragover',onDragOver,true);
    document.addEventListener('drop',onDrop,true);
    document.addEventListener('dragend',onDragEnd,true);
    return()=>{
      document.removeEventListener('dragstart',onDragStart,true);
      document.removeEventListener('dragover',onDragOver,true);
      document.removeEventListener('drop',onDrop,true);
      document.removeEventListener('dragend',onDragEnd,true);
    };
  },[]);

  async function openServer(server:Server,after?:()=>void){
    const list=serversRef.current;
    const index=list.findIndex(item=>item.id===server.id);
    const button=serverButtons()[index] || serverButtons().find(item=>(item.title||'')===server.name);
    button?.click();
    setMenu(null);
    if(after)window.setTimeout(after,80);
  }

  async function markServerRead(server:Server){
    try{
      const textChannels=server.channels.filter(channel=>channel.type==='TEXT');
      await Promise.all(textChannels.map(channel=>api.markChannelRead(channel.id).catch(()=>undefined)));
      await refreshAndReload('Sunucudaki okunmamışlar temizlendi.');
    }catch(error){showNotice(error instanceof Error?error.message:'Okunmamışlar temizlenemedi.')}
  }

  async function markGroupRead(group:Extract<MenuState,{kind:'group'}>){
    try{
      const textChannels=group.channels.filter(channel=>channel.type==='TEXT');
      await Promise.all(textChannels.map(channel=>api.markChannelRead(channel.id).catch(()=>undefined)));
      await refreshAndReload(`${group.groupName} okundu işaretlendi.`);
    }catch(error){showNotice(error instanceof Error?error.message:'Kategori okunmuş işaretlenemedi.')}
  }

  async function createInGroup(group:Extract<MenuState,{kind:'group'}>,type:'TEXT'|'VOICE'){
    const name=prompt(`${group.groupName} içinde yeni ${type==='VOICE'?'ses':'metin'} akışının adı`,'');
    if(name===null||!name.trim())return;
    try{
      await api.createChannel(group.server.id,name.trim(),type,group.groupName);
      await refreshAndReload(`${name.trim()} oluşturuldu.`);
    }catch(error){showNotice(error instanceof Error?error.message:'Akış oluşturulamadı.')}
  }

  async function renameGroup(group:Extract<MenuState,{kind:'group'}>){
    const next=prompt('Kategori adını değiştir. Boş bırakırsan kanallar varsayılan kategorilerine döner.',group.groupName);
    if(next===null)return;
    const nextName=next.trim();
    try{
      await Promise.all(group.channels.map(channel=>api.updateChannel(group.server.id,channel.id,{groupName:nextName})));
      await refreshAndReload(nextName?`Kategori ${nextName} olarak değiştirildi.`:'Kategori varsayılana döndürüldü.');
    }catch(error){showNotice(error instanceof Error?error.message:'Kategori adı değiştirilemedi.')}
  }

  async function renameChannel(server:Server,channel:Channel){
    const next=prompt('Akış adını değiştir',channel.name);
    if(next===null||!next.trim()||next.trim()===channel.name)return;
    try{await api.updateChannel(server.id,channel.id,{name:next.trim()});await refreshAndReload('Akış adı güncellendi.')}catch(error){showNotice(error instanceof Error?error.message:'Akış adı değiştirilemedi.')}
  }

  async function changeGroup(server:Server,channel:Channel){
    const next=prompt('Bölüm adı (boş bırakırsan varsayılan bölüme döner)',channel.groupName||'');
    if(next===null)return;
    try{await api.updateChannel(server.id,channel.id,{groupName:next.trim()});await refreshAndReload('Akış bölümü güncellendi.')}catch(error){showNotice(error instanceof Error?error.message:'Bölüm değiştirilemedi.')}
  }

  async function moveChannel(server:Server,channel:Channel,delta:number){
    const ordered=[...server.channels].sort((a,b)=>a.position-b.position);
    const index=ordered.findIndex(item=>item.id===channel.id);
    const next=index+delta;
    if(index<0||next<0||next>=ordered.length)return;
    try{await api.updateChannel(server.id,channel.id,{position:next});await refreshAndReload(delta<0?'Akış yukarı taşındı.':'Akış aşağı taşındı.')}catch(error){showNotice(error instanceof Error?error.message:'Akış taşınamadı.')}
  }

  async function toggleLock(server:Server,channel:Channel){
    if(channel.type!=='TEXT')return;
    try{await api.updateChannel(server.id,channel.id,{isLocked:!channel.isLocked});await refreshAndReload(channel.isLocked?'Akış kilidi açıldı.':'Akış kilitlendi.')}catch(error){showNotice(error instanceof Error?error.message:'Akış kilidi değiştirilemedi.')}
  }

  async function deleteChannel(server:Server,channel:Channel){
    if(!confirm(`${channel.name} akışı silinsin mi? İçindeki mesajlar da kalıcı olarak silinir.`))return;
    try{await api.deleteChannel(server.id,channel.id);await refreshAndReload('Akış silindi.')}catch(error){showNotice(error instanceof Error?error.message:'Akış silinemedi.')}
  }

  const canManage=menu?hasPermission(menu.permissions,'MANAGE_CHANNELS'):false;
  return <>
    {menu?.kind==='server'&&<div className="sidebar-context-menu" role="menu" style={{left:menu.x,top:menu.y}} onPointerDown={event=>event.stopPropagation()} onContextMenu={event=>event.preventDefault()}>
      <div className="sidebar-context-head"><div className="sidebar-context-server-icon">{menu.server.name.slice(0,2).toUpperCase()}</div><div><b>{menu.server.name}</b><small>{menu.server.channels.length} akış</small></div></div>
      <button onClick={()=>void openServer(menu.server)}><Settings size={16}/><span><b>Sunucuyu aç</b><small>Bu alanı öne getir</small></span></button>
      <button onClick={()=>void openServer(menu.server,()=>clickLater('.space-head-actions button[title="Sunucu ayarları"]',0))}><Settings size={16}/><span><b>Sunucu ayarları</b><small>Üyeler, roller, davetler ve izinler</small></span></button>
      <button onClick={()=>void markServerRead(menu.server)}><CheckCheck size={16}/><span><b>Okundu işaretle</b><small>Bu sunucudaki yazı akışlarını temizle</small></span></button>
      {canManage&&<div className="sidebar-context-separator"><span>YENİ AKIŞ</span></div>}
      {canManage&&<button onClick={()=>void openServer(menu.server,()=>clickLater('.flow-create-row button[title="Metin kanalı oluştur"]',0))}><Hash size={16}/><span><b>Metin kanalı oluştur</b><small>Yeni yazılı sohbet aç</small></span></button>}
      {canManage&&<button onClick={()=>void openServer(menu.server,()=>clickLater('.flow-create-row button[title="Ses kanalı oluştur"]',0))}><Volume2 size={16}/><span><b>Ses kanalı oluştur</b><small>Yeni ses alanı aç</small></span></button>}
    </div>}

    {menu?.kind==='group'&&<div className="sidebar-context-menu group-menu" role="menu" style={{left:menu.x,top:menu.y}} onPointerDown={event=>event.stopPropagation()} onContextMenu={event=>event.preventDefault()}>
      <div className="sidebar-context-head"><div className="sidebar-context-group-icon"><ChevronRight size={19}/></div><div><b>{menu.groupName}</b><small>{menu.channels.length} akış</small></div></div>
      <button onClick={()=>{setGroupCollapsed(menu.server,menu.groupLabel,!menu.collapsed);setMenu(null)}}><ChevronRight size={16}/><span><b>{menu.collapsed?'Kategoriyi aç':'Kategoriyi daralt'}</b><small>Akış listesini {menu.collapsed?'göster':'gizle'}</small></span></button>
      <button onClick={()=>void markGroupRead(menu)}><CheckCheck size={16}/><span><b>Okundu işaretle</b><small>Bu kategorideki metin akışlarını temizle</small></span></button>
      {canManage&&<div className="sidebar-context-separator"><span>KATEGORİ</span></div>}
      {canManage&&<button onClick={()=>void renameGroup(menu)}><Edit3 size={16}/><span><b>Kategori adını değiştir</b><small>{menu.groupName}</small></span></button>}
      {canManage&&<button onClick={()=>void createInGroup(menu,'TEXT')}><Hash size={16}/><span><b>Metin akışı oluştur</b><small>{menu.groupName} içine ekle</small></span></button>}
      {canManage&&<button onClick={()=>void createInGroup(menu,'VOICE')}><Volume2 size={16}/><span><b>Ses akışı oluştur</b><small>{menu.groupName} içine ekle</small></span></button>}
    </div>}

    {menu?.kind==='channel'&&<div className="sidebar-context-menu channel-menu" role="menu" style={{left:menu.x,top:menu.y}} onPointerDown={event=>event.stopPropagation()} onContextMenu={event=>event.preventDefault()}>
      <div className="sidebar-context-head"><div className="sidebar-context-channel-icon">{menu.channel.type==='VOICE'?<Volume2 size={18}/>:<Hash size={18}/>}</div><div><b>{menu.channel.name}</b><small>{normalizedGroup(menu.channel)}</small></div></div>
      <button onClick={()=>{const button=[...document.querySelectorAll<HTMLButtonElement>('.flow-group button.channel')].find(item=>item.querySelector('.flow-name')?.textContent?.trim()===menu.channel.name);button?.click();setMenu(null)}}>{menu.channel.type==='VOICE'?<Volume2 size={16}/>:<Hash size={16}/>}<span><b>{menu.channel.type==='VOICE'?'Ses kanalına katıl':'Akışı aç'}</b><small>Akışı seç</small></span></button>
      {menu.channel.type==='TEXT'&&<button onClick={()=>void api.markChannelRead(menu.channel.id).then(()=>refreshAndReload('Akış okundu işaretlendi.')).catch(error=>showNotice(error instanceof Error?error.message:'İşlem başarısız.'))}><CheckCheck size={16}/><span><b>Okundu işaretle</b><small>Bu akıştaki okunmamışları temizle</small></span></button>}
      {canManage&&<div className="sidebar-context-separator"><span>DÜZENLE</span></div>}
      {canManage&&<button onClick={()=>void renameChannel(menu.server,menu.channel)}><Edit3 size={16}/><span><b>Adını değiştir</b><small>{menu.channel.name}</small></span></button>}
      {canManage&&<button onClick={()=>void changeGroup(menu.server,menu.channel)}><Settings size={16}/><span><b>Bölümü değiştir</b><small>{menu.channel.groupName||'Varsayılan bölüm'}</small></span></button>}
      {canManage&&menu.channel.type==='TEXT'&&<button onClick={()=>void toggleLock(menu.server,menu.channel)}>{menu.channel.isLocked?<Unlock size={16}/>:<Lock size={16}/>}<span><b>{menu.channel.isLocked?'Kilidi aç':'Akışı kilitle'}</b><small>{menu.channel.isLocked?'Üyeler tekrar yazabilir':'Normal üyelerin yazmasını durdur'}</small></span></button>}
      {canManage&&<div className="sidebar-context-move"><button onClick={()=>void moveChannel(menu.server,menu.channel,-1)}>↑ Yukarı</button><button onClick={()=>void moveChannel(menu.server,menu.channel,1)}>↓ Aşağı</button></div>}
      {canManage&&<div className="sidebar-context-separator"/>}
      {canManage&&<button className="danger-item" onClick={()=>void deleteChannel(menu.server,menu.channel)}><Trash2 size={16}/><span><b>Akışı sil</b><small>Bu işlem geri alınamaz</small></span></button>}
    </div>}

    {notice&&<div className="sidebar-context-toast">{notice}</div>}
  </>;
}
