import { useEffect, useRef } from 'react';

type VoiceParticipant = {
  identity:string;
  name:string;
  local:boolean;
  speaking:boolean;
  muted:boolean;
  camera:boolean;
  screen:boolean;
};

type VoiceSnapshot = {
  participants:VoiceParticipant[];
  participantVolumes:Record<string,number>;
  locallyMutedParticipants:string[];
};

const COLLAPSED_KEY='shakechat.member-sections.v26';

function loadCollapsed(){
  try{
    const parsed=JSON.parse(localStorage.getItem(COLLAPSED_KEY)||'{}');
    return parsed&&typeof parsed==='object' ? parsed as Record<string,boolean> : {};
  }catch{return {} as Record<string,boolean>}
}

function activeScope(){
  const active=document.querySelector<HTMLElement>('.serverbar button.server.active');
  return active?.dataset.serverId || active?.getAttribute('title')?.trim() || (document.querySelector('.home.active')?'home':'server');
}

function sectionLabel(section:HTMLElement){
  return (section.textContent||'')
    .replace(/\s+[—-]\s+\d+\s*$/,'')
    .trim()
    .toLocaleUpperCase('tr-TR');
}

function sectionKey(section:HTMLElement){
  return `${activeScope()}:${sectionLabel(section)}`;
}

function isCollapsibleSection(section:HTMLElement){
  const parent=section.parentElement;
  if(!parent||parent.classList.contains('members'))return false;
  return [...parent.children].some(child=>child.classList.contains('member'));
}

export function MemberListUX(){
  const collapsedRef=useRef<Record<string,boolean>>(loadCollapsed());
  const voiceRef=useRef<VoiceSnapshot>({participants:[],participantVolumes:{},locallyMutedParticipants:[]});
  const frameRef=useRef(0);

  function persist(){
    try{localStorage.setItem(COLLAPSED_KEY,JSON.stringify(collapsedRef.current))}catch{/* Local storage can be unavailable. */}
  }

  function decorate(){
    window.cancelAnimationFrame(frameRef.current);
    frameRef.current=window.requestAnimationFrame(()=>{
      const panel=document.querySelector<HTMLElement>('.members');
      if(!panel)return;
      panel.classList.add('member-list-enhanced');

      panel.querySelectorAll<HTMLElement>('.section').forEach(section=>{
        if(!isCollapsibleSection(section))return;
        const key=sectionKey(section);
        const collapsed=!!collapsedRef.current[key];
        section.classList.add('member-section-toggle');
        section.dataset.memberSectionKey=key;
        section.setAttribute('role','button');
        section.tabIndex=0;
        section.setAttribute('aria-expanded',String(!collapsed));
        section.title=collapsed?'Üyeleri göster':'Üyeleri gizle';
        section.parentElement?.classList.toggle('member-section-collapsed',collapsed);
      });

      const voiceById=new Map(voiceRef.current.participants.map(person=>[person.identity,person]));
      panel.querySelectorAll<HTMLElement>('.member[data-user-id]').forEach(row=>{
        const userId=row.dataset.userId||'';
        const person=voiceById.get(userId);
        const locallyMuted=person ? voiceRef.current.locallyMutedParticipants.includes(person.identity) : false;
        row.classList.toggle('member-in-voice',!!person);
        row.classList.toggle('member-speaking',!!person?.speaking&&!locallyMuted);
        row.classList.toggle('member-streaming',!!person?.screen);
        row.classList.toggle('member-voice-muted',!!person?.muted||locallyMuted);
        row.dataset.voiceState=person?.screen?'YAYIN':person?.speaking&&!locallyMuted?'KONUŞUYOR':person?'SES':'';
        row.title=person
          ? `${person.screen?'Yayın yapıyor':person.speaking&&!locallyMuted?'Konuşuyor':person.muted?'Mikrofon kapalı':'Ses kanalında'} · Sağ tık: kullanıcı menüsü`
          : 'Sağ tık: kullanıcı menüsü';
      });
    });
  }

  useEffect(()=>{
    const toggle=(section:HTMLElement)=>{
      if(!isCollapsibleSection(section))return;
      const key=sectionKey(section);
      if(collapsedRef.current[key])delete collapsedRef.current[key];
      else collapsedRef.current[key]=true;
      persist();
      decorate();
    };

    const click=(event:MouseEvent)=>{
      if(event.button!==0)return;
      const target=event.target instanceof Element?event.target:null;
      const section=target?.closest<HTMLElement>('.members .member-section-toggle');
      if(section)toggle(section);
    };
    const key=(event:KeyboardEvent)=>{
      if(event.key!=='Enter'&&event.key!==' ')return;
      const target=event.target instanceof Element?event.target:null;
      const section=target?.closest<HTMLElement>('.members .member-section-toggle');
      if(!section)return;
      event.preventDefault();
      toggle(section);
    };
    const voice=(event:Event)=>{
      const detail=(event as CustomEvent<VoiceSnapshot>).detail;
      if(!detail)return;
      voiceRef.current=detail;
      decorate();
    };
    const serverClick=(event:MouseEvent)=>{
      const target=event.target instanceof Element?event.target:null;
      if(target?.closest('.serverbar button.server,.serverbar .home'))window.setTimeout(decorate,80);
    };

    document.addEventListener('click',click,true);
    document.addEventListener('click',serverClick,true);
    document.addEventListener('keydown',key,true);
    window.addEventListener('shakechat:voice-snapshot',voice as EventListener);

    decorate();
    const root=document.querySelector('.app-shell')||document.body;
    const observer=new MutationObserver(decorate);
    observer.observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:['data-user-id']});

    return()=>{
      observer.disconnect();
      document.removeEventListener('click',click,true);
      document.removeEventListener('click',serverClick,true);
      document.removeEventListener('keydown',key,true);
      window.removeEventListener('shakechat:voice-snapshot',voice as EventListener);
      window.cancelAnimationFrame(frameRef.current);
    };
  },[]);

  return null;
}
