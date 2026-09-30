import { invoke } from '@tauri-apps/api/core';
import { useEffect } from 'react';

const PREVIEW_KEY='shakechat.screen-preview-hidden.v1';
const AUDIO_KEY='shakechat.screen-audio-muted.v1';

function storedFlag(key:string){
  try{return localStorage.getItem(key)==='1'}catch{return false}
}
function storeFlag(key:string,value:boolean){
  try{localStorage.setItem(key,value?'1':'0')}catch{/* Storage can be unavailable. */}
}
function setSelectValue(select:HTMLSelectElement,value:number){
  if(![...select.options].some(option=>Number(option.value)===value))return;
  select.value=String(value);
  select.dispatchEvent(new Event('change',{bubbles:true}));
}

function localScreenTile(tile:Element){
  return /(?:^|\s)Sen(?:\s|·|$)/i.test(tile.querySelector('.video-label')?.textContent||'');
}

function applyPreviewPreference(){
  const hidden=storedFlag(PREVIEW_KEY);
  document.querySelectorAll<HTMLElement>('.video-tile.screen').forEach(tile=>{
    tile.classList.toggle('shake-local-screen-hidden',hidden&&localScreenTile(tile));
  });
  document.querySelectorAll<HTMLElement>('.video-stage').forEach(stage=>{
    const hasHidden=!!stage.querySelector('.shake-local-screen-hidden');
    stage.classList.toggle('shake-preview-hidden-active',hasHidden);
    let notice=stage.querySelector<HTMLElement>('.shake-screen-preview-paused');
    if(hasHidden&&!notice){
      notice=document.createElement('div');
      notice.className='shake-screen-preview-paused';
      notice.innerHTML='<div class="shake-screen-preview-paused-icon">▣</div><div><strong>Yayının halen devam ediyor!</strong><span>Kaynaklarından tasarruf etmek için bu ön izlemeyi duraklattık.</span></div>';
      stage.prepend(notice);
    }else if(!hasHidden&&notice){
      notice.remove();
    }
  });
}

function createModeRow(title:string,detail:string,value:string){
  const button=document.createElement('button');
  button.type='button';
  button.className='native-screen-mode-row';
  button.dataset.mode=value;
  button.setAttribute('role','radio');
  const copy=document.createElement('span');copy.className='native-screen-mode-copy';
  const strong=document.createElement('strong');strong.textContent=title;
  const small=document.createElement('small');small.textContent=detail;
  copy.append(strong,small);
  const radio=document.createElement('i');radio.className='native-screen-mode-radio';
  button.append(copy,radio);
  return button;
}

function createSwitchRow(title:string,detail:string,checked:boolean,onChange:(checked:boolean)=>void){
  const label=document.createElement('label');label.className='native-screen-switch-row';
  const copy=document.createElement('span');copy.className='native-screen-switch-copy';
  const strong=document.createElement('strong');strong.textContent=title;
  const small=document.createElement('small');small.textContent=detail;
  copy.append(strong,small);
  const input=document.createElement('input');input.type='checkbox';input.checked=checked;
  const visual=document.createElement('i');visual.className='native-screen-checkbox';
  input.addEventListener('change',()=>onChange(input.checked));
  label.append(copy,input,visual);
  return label;
}

function decoratePicker(picker:HTMLElement){
  if(picker.dataset.streamPolished==='1')return;
  const popover=picker.querySelector<HTMLElement>('.native-screen-quality-popover');
  const settingsButton=picker.querySelector<HTMLButtonElement>('.native-screen-settings-button');
  const publish=picker.querySelector<HTMLButtonElement>('.native-screen-publish');
  if(!popover||!settingsButton||!publish)return;
  const selects=[...popover.querySelectorAll<HTMLSelectElement>('select')];
  if(selects.length<2)return;
  picker.dataset.streamPolished='1';

  const heightSelect=selects[0];
  const fpsSelect=selects[1];
  const oldLabels=[...popover.querySelectorAll<HTMLLabelElement>('label')];
  popover.replaceChildren();
  popover.classList.add('native-screen-mode-popover');
  popover.setAttribute('role','dialog');
  popover.setAttribute('aria-label','Yayın modu');

  const title=document.createElement('div');title.className='native-screen-popover-title';title.textContent='Yayın modu';
  const modes=document.createElement('div');modes.className='native-screen-mode-list';modes.setAttribute('role','radiogroup');
  const game=createModeRow('Oyun','Daha akıcı görüntü · 720p · 60fps','game');
  const screen=createModeRow('Ekran Paylaşımı','Daha net metin · 1080p · 30fps','screen');
  const custom=createModeRow('Özel','Çözünürlük ve kare hızını kendin seç','custom');
  modes.append(game,screen,custom);

  const divider=document.createElement('div');divider.className='native-screen-popover-divider';
  const audio=createSwitchRow('Yayın sesini sustur','Bilgisayar sesini karşı tarafa gönderme',storedFlag(AUDIO_KEY),value=>storeFlag(AUDIO_KEY,value));

  const advanced=document.createElement('button');advanced.type='button';advanced.className='native-screen-advanced-row';
  advanced.innerHTML='<span><strong>Gelişmiş</strong><small>Ön izleme ve özel kalite seçenekleri</small></span><b>›</b>';
  const advancedPanel=document.createElement('div');advancedPanel.className='native-screen-advanced-panel';advancedPanel.hidden=true;
  const advancedTitle=document.createElement('div');advancedTitle.className='native-screen-advanced-title';advancedTitle.textContent='Gelişmiş';
  const customFields=document.createElement('div');customFields.className='native-screen-custom-fields';
  oldLabels.forEach(label=>customFields.append(label));
  const preview=createSwitchRow('Yayın ön izlemesini gizle','Yayın devam ederken kendi ön izlemeni duraklat',storedFlag(PREVIEW_KEY),value=>{
    storeFlag(PREVIEW_KEY,value);
    applyPreviewPreference();
  });
  advancedPanel.append(advancedTitle,preview,customFields);
  popover.append(title,modes,divider,audio,advanced,advancedPanel);

  const syncMode=()=>{
    const height=Number(heightSelect.value),fps=Number(fpsSelect.value);
    const mode=height===720&&fps===60?'game':height===1080&&fps===30?'screen':'custom';
    [game,screen,custom].forEach(row=>{
      const active=row.dataset.mode===mode;
      row.classList.toggle('active',active);
      row.setAttribute('aria-checked',String(active));
    });
    if(mode==='custom')customFields.classList.add('active');else customFields.classList.remove('active');
  };
  const choose=(mode:'game'|'screen'|'custom')=>{
    if(mode==='game'){setSelectValue(heightSelect,720);setSelectValue(fpsSelect,60)}
    else if(mode==='screen'){setSelectValue(heightSelect,1080);setSelectValue(fpsSelect,30)}
    else {advancedPanel.hidden=false;advanced.classList.add('open')}
    syncMode();
  };
  game.addEventListener('click',()=>choose('game'));
  screen.addEventListener('click',()=>choose('screen'));
  custom.addEventListener('click',()=>choose('custom'));
  heightSelect.addEventListener('change',syncMode);
  fpsSelect.addEventListener('change',syncMode);
  advanced.addEventListener('click',()=>{
    advancedPanel.hidden=!advancedPanel.hidden;
    advanced.classList.toggle('open',!advancedPanel.hidden);
  });
  settingsButton.addEventListener('click',()=>{
    settingsButton.classList.toggle('active',!popover.hidden);
    settingsButton.setAttribute('aria-expanded',String(!popover.hidden));
  });
  publish.addEventListener('click',()=>{
    const muted=storedFlag(AUDIO_KEY);
    window.setTimeout(()=>void invoke('native_screen_audio_pause',{paused:muted}).catch(()=>undefined),850);
  });
  syncMode();
}

export function ScreenShareUX(){
  useEffect(()=>{
    let frame=0;
    const apply=()=>{
      frame=0;
      document.querySelectorAll<HTMLElement>('.native-screen-picker').forEach(decoratePicker);
      applyPreviewPreference();
    };
    const schedule=()=>{
      if(frame)return;
      frame=window.requestAnimationFrame(apply);
    };
    apply();
    const observer=new MutationObserver(schedule);
    observer.observe(document.body,{subtree:true,childList:true});
    window.addEventListener('focus',schedule);
    return()=>{
      observer.disconnect();
      window.removeEventListener('focus',schedule);
      if(frame)window.cancelAnimationFrame(frame);
    };
  },[]);
  return null;
}
