import { FormEvent, useEffect, useRef, useState } from 'react';
import { AudioLines, DownloadCloud, Gauge, Keyboard, KeyRound, MonitorCog, Palette, ShieldCheck, SlidersHorizontal, UserCog, UsersRound, X } from 'lucide-react';
import { api, PrivacySettings, User } from './api';
import { DesktopUpdateState, checkDesktopUpdate, installDesktopUpdate } from './desktopUpdater';
import { AppPreferences, cameraQualityLabel, pushToTalkKeyLabel, screenQualityLabel } from './preferences';

type SettingsTab = 'account'|'appearance'|'media'|'privacy';

function updateStatusLabel(state:DesktopUpdateState|null){
  if(!state)return 'Henüz güncelleme denetlenmedi.';
  if(state.status==='unsupported')return 'Güncelleme denetimi yalnızca kurulu ShakeChat masaüstü uygulamasında çalışır.';
  if(state.status==='up-to-date')return 'ShakeChat güncel.';
  if(state.status==='available')return `Yeni sürüm hazır: v${state.version} · mevcut v${state.currentVersion}`;
  return state.progress===null?`v${state.version} indiriliyor…`:`v${state.version} indiriliyor… %${state.progress}`;
}

export function AppSettingsModal({user,preferences,onClose,onSave,onSessionRenewed,onNotice}:{
  user:User;
  preferences:AppPreferences;
  onClose:()=>void;
  onSave:(preferences:AppPreferences)=>void;
  onSessionRenewed:(token:string,user:User)=>void;
  onNotice:(message:string)=>void;
}){
  const dialog=useRef<HTMLDialogElement>(null);
  const [draft,setDraft]=useState<AppPreferences>(preferences);
  const [tab,setTab]=useState<SettingsTab>('account');
  const [privacy,setPrivacy]=useState<PrivacySettings|null>(null);
  const [privacyBusy,setPrivacyBusy]=useState(false);
  const [accountBusy,setAccountBusy]=useState(false);
  const [updateBusy,setUpdateBusy]=useState(false);
  const [updateState,setUpdateState]=useState<DesktopUpdateState|null>(null);
  const [error,setError]=useState('');
  const [currentPassword,setCurrentPassword]=useState('');
  const [newPassword,setNewPassword]=useState('');
  const [confirmPassword,setConfirmPassword]=useState('');
  const [capturingPttKey,setCapturingPttKey]=useState(false);

  useEffect(()=>{dialog.current?.showModal();void api.privacy().then(setPrivacy).catch(err=>setError((err as Error).message))},[]);
  function handleSubmit(e:FormEvent){
    e.preventDefault();
    if(tab==='account'){void changePassword();return}
    if(tab==='privacy'){void savePrivacy();return}
    onSave(draft);
  }

  async function savePrivacy(){
    if(!privacy||privacyBusy)return;
    setPrivacyBusy(true);setError('');
    try{setPrivacy(await api.updatePrivacy(privacy));onNotice('Gizlilik tercihleri kaydedildi.')}catch(err){setError((err as Error).message)}finally{setPrivacyBusy(false)}
  }

  async function changePassword(){
    if(accountBusy)return; setError('');
    if(newPassword!==confirmPassword){setError('Yeni şifreler eşleşmiyor.');return}
    if(newPassword.length<8){setError('Yeni şifre en az 8 karakter olmalı.');return}
    setAccountBusy(true);
    try{
      const result=await api.changePassword(currentPassword,newPassword);
      onNotice('Şifre değiştirildi. Eski oturumlar geçersiz kılındı.');
      onSessionRenewed(result.accessToken,result.user);
    }catch(err){setError((err as Error).message)}finally{setAccountBusy(false)}
  }

  async function rotateSessions(){
    if(accountBusy)return;
    setAccountBusy(true);setError('');
    try{
      const result=await api.rotateSessions();
      onNotice('Diğer oturumlar geçersiz kılındı.');
      onSessionRenewed(result.accessToken,result.user);
    }catch(err){setError((err as Error).message)}finally{setAccountBusy(false)}
  }

  async function checkForDesktopUpdate(){
    if(updateBusy)return;
    setUpdateBusy(true);setError('');
    try{
      const state=await checkDesktopUpdate();
      setUpdateState(state);
      if(state.status==='up-to-date')onNotice('ShakeChat güncel.');
      if(state.status==='unsupported')onNotice('Güncelleme denetimi masaüstü uygulamasında kullanılabilir.');
    }catch(err){
      setError(`Güncelleme denetimi başarısız: ${(err as Error).message}`);
    }finally{
      setUpdateBusy(false);
    }
  }

  async function installAvailableDesktopUpdate(){
    if(updateBusy)return;
    setUpdateBusy(true);setError('');
    try{
      onNotice('Güncelleme indiriliyor ve imzası doğrulanıyor…');
      await installDesktopUpdate(setUpdateState);
    }catch(err){
      setError(`Güncelleme kurulamadı: ${(err as Error).message}`);
    }finally{
      setUpdateBusy(false);
    }
  }

  const title=tab==='account'?'Hesap ve oturum güvenliği':tab==='privacy'?'Gizlilik tercihleri':tab==='appearance'?'Görünüm ve kullanım':'Ses ve görüntü kalitesi';
  return <dialog ref={dialog} className="modal-backdrop v10-dialog" aria-labelledby="app-settings-title" onCancel={e=>{e.preventDefault();onClose()}}>
    <form className="app-settings-panel" onSubmit={handleSubmit}>
      <aside className="app-settings-nav">
        <div className="settings-brand"><span>ST</span><div><b>ShakeChat</b><small>v1.9 ayarları</small></div></div>
        <button type="button" className={tab==='account'?'active':''} onClick={()=>{setTab('account');setError('')}}><UserCog size={17}/> Hesap</button>
        <button type="button" className={tab==='privacy'?'active':''} onClick={()=>{setTab('privacy');setError('')}}><ShieldCheck size={17}/> Gizlilik</button>
        <button type="button" className={tab==='appearance'?'active':''} onClick={()=>{setTab('appearance');setError('')}}><Palette size={17}/> Görünüm</button>
        <button type="button" className={tab==='media'?'active':''} onClick={()=>{setTab('media');setError('')}}><AudioLines size={17}/> Ses & görüntü</button>
        <div className="app-settings-nav-note"><ShieldCheck size={15}/><span>Hesap ve gizlilik ayarları sunucuda; görünüm ve medya tercihleri bu cihazda saklanır.</span></div>
      </aside>
      <section className="app-settings-content">
        <div className="modal-head"><div><div className="panel-kicker"><SlidersHorizontal size={15}/> UYGULAMA AYARLARI</div><h2 id="app-settings-title">{title}</h2><p>{tab==='account'?`@${user.username} hesabının güvenliğini yönet.`:tab==='privacy'?'Kimlerin sana ulaşabileceğini belirle.':tab==='appearance'?'ShakeChat’in kendi görsel dilini sana göre ayarla.':'Kamera, ekran paylaşımı ve mikrofon işleme tercihlerini belirle.'}</p></div><button type="button" className="icon-btn" aria-label="Kapat" onClick={onClose}><X size={20}/></button></div>
        {error&&<div className="error settings-error">{error}</div>}

        {tab==='account'?<div className="settings-stack">
          <div className="setting-block account-card"><div className="setting-title"><KeyRound size={18}/><div><b>Şifreyi değiştir</b><small>Yeni şifre kaydedildiğinde daha önce verilmiş oturum anahtarları geçersiz olur.</small></div></div>
            <div className="account-form">
              <label>MEVCUT ŞİFRE<input type="password" autoComplete="current-password" value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)} minLength={8}/></label>
              <label>YENİ ŞİFRE<input type="password" autoComplete="new-password" value={newPassword} onChange={e=>setNewPassword(e.target.value)} minLength={8}/></label>
              <label>YENİ ŞİFRE TEKRAR<input type="password" autoComplete="new-password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} minLength={8}/></label>
              <button type="button" className="primary compact" disabled={accountBusy||!currentPassword||!newPassword||!confirmPassword} onClick={()=>void changePassword()}>Şifreyi değiştir</button>
            </div>
          </div>
          <div className="setting-block session-card"><div className="setting-title"><ShieldCheck size={18}/><div><b>Diğer oturumları kapat</b><small>Eski JWT sürümünü iptal eder. Diğer cihazlar bir sonraki istekte veya WebSocket işleminde yeniden giriş yapmak zorunda kalır.</small></div></div><button type="button" className="ghost security-action" disabled={accountBusy} onClick={()=>void rotateSessions()}>Diğer oturumları geçersiz kıl</button></div>
          <div className="setting-block session-card"><div className="setting-title"><DownloadCloud size={18}/><div><b>ShakeChat güncellemesi</b><small>Yeni Windows sürümünü GitHub Releases üzerinden denetler, imzasını doğrular ve kurar.</small></div></div><div className="account-form"><div className="quality-note">{updateStatusLabel(updateState)}</div>{updateState?.status==='available'&&updateState.notes?<div className="quality-note">{updateState.notes}</div>:null}{updateState?.status==='available'?<button type="button" className="primary compact" disabled={updateBusy} onClick={()=>void installAvailableDesktopUpdate()}>{updateBusy?'İndiriliyor…':`v${updateState.version} indir ve kur`}</button>:<button type="button" className="ghost security-action" disabled={updateBusy||updateState?.status==='installing'} onClick={()=>void checkForDesktopUpdate()}>{updateBusy?'Denetleniyor…':'Güncellemeleri denetle'}</button>}</div></div>
        </div>:tab==='privacy'?<div className="settings-stack">
          {!privacy?<div className="message-skeleton">Gizlilik tercihleri yükleniyor…</div>:<>
            <div className="setting-block"><div className="setting-title"><UsersRound size={18}/><div><b>Arkadaşlık istekleri</b><small>Yeni arkadaşlık isteğini kimlerin başlatabileceğini seç.</small></div></div><label className="privacy-select">İSTEK KAYNAĞI<select value={privacy.friendRequestPolicy} onChange={e=>setPrivacy(p=>p?{...p,friendRequestPolicy:e.target.value as PrivacySettings['friendRequestPolicy']}:p)}><option value="EVERYONE">Herkes</option><option value="SHARED_SERVERS">Yalnızca ortak alan üyeleri</option><option value="NOBODY">Hiç kimse</option></select></label></div>
            <label className="setting-toggle"><span><b>Grup sohbeti davetleri</b><small>Kapalıysa arkadaşların seni yeni grup DM oluştururken ekleyemez.</small></span><input type="checkbox" checked={privacy.allowGroupDmInvites} onChange={e=>setPrivacy(p=>p?{...p,allowGroupDmInvites:e.target.checked}:p)}/><i/></label>
            <div className="privacy-note">Engellediğin kullanıcılar bu tercihlerden bağımsız olarak sana arkadaşlık isteği gönderemez veya yeni 1:1 iletişim başlatamaz.</div>
            <div className="modal-actions"><button type="button" className="primary" disabled={privacyBusy} onClick={()=>void savePrivacy()}>{privacyBusy?'Kaydediliyor…':'Gizliliği kaydet'}</button></div>
          </>}
        </div>:tab==='appearance'?<>
          <div className="setting-block"><div className="setting-title"><Palette size={18}/><div><b>Vurgu paleti</b><small>Arayüz yapısı aynı kalır; vurgu ve yüzey tonları değişir.</small></div></div><div className="theme-grid">
            <button type="button" className={draft.theme==='ember'?'theme-card selected':''} onClick={()=>setDraft(p=>({...p,theme:'ember'}))}><i className="theme-swatch ember"/><span><b>Köz</b><small>Amber + mint</small></span></button>
            <button type="button" className={draft.theme==='tide'?'theme-card selected':''} onClick={()=>setDraft(p=>({...p,theme:'tide'}))}><i className="theme-swatch tide"/><span><b>Gelgit</b><small>Turkuaz + kum</small></span></button>
            <button type="button" className={draft.theme==='mono'?'theme-card selected':''} onClick={()=>setDraft(p=>({...p,theme:'mono'}))}><i className="theme-swatch mono"/><span><b>Grafit</b><small>Nötr + sıcak beyaz</small></span></button>
          </div></div>
          <div className="setting-block"><div className="setting-title"><Gauge size={18}/><div><b>Arayüz yoğunluğu</b><small>Mesaj ve menülerdeki boşluk miktarını değiştirir.</small></div></div><div className="segmented"><button type="button" className={draft.density==='cozy'?'selected':''} onClick={()=>setDraft(p=>({...p,density:'cozy'}))}>Rahat</button><button type="button" className={draft.density==='compact'?'selected':''} onClick={()=>setDraft(p=>({...p,density:'compact'}))}>Sıkı</button></div></div>
          <label className="setting-toggle"><span><b>Hareketleri azalt</b><small>Geçiş ve animasyonları minimuma indirir.</small></span><input type="checkbox" checked={draft.reduceMotion} onChange={e=>setDraft(p=>({...p,reduceMotion:e.target.checked}))}/><i/></label>
        </>:<>
          <div className="setting-block"><div className="setting-title"><MonitorCog size={18}/><div><b>Yayın kalite profilleri</b><small>Yüksek değerler daha fazla upload, GPU ve alıcı tarafı decode gücü ister.</small></div></div><div className="media-quality-grid">
            <label>KAMERA<select aria-label="Kamera kalite profili" value={draft.cameraQuality} onChange={e=>setDraft(p=>({...p,cameraQuality:e.target.value as AppPreferences['cameraQuality']}))}><option value="balanced">Otomatik</option><option value="720p30">720p · 30 FPS</option><option value="1080p30">1080p · 30 FPS</option><option value="1080p60">1080p · 60 FPS</option></select><small>Seçili: {cameraQualityLabel(draft.cameraQuality)}</small></label>
            <label>EKRAN PAYLAŞIMI<select aria-label="Ekran paylaşımı kalite profili" value={draft.screenQuality} onChange={e=>setDraft(p=>({...p,screenQuality:e.target.value as AppPreferences['screenQuality']}))}><option value="low">Low · 480p60 · 1.5 Mbps</option><option value="medium">Medium · 720p60 · 3.5 Mbps</option><option value="high">High · 1080p60 · 6 Mbps</option><option value="ultra">Ultra · 1440p144 · 14 Mbps</option></select><small>Seçili: {screenQualityLabel(draft.screenQuality)}</small></label>
          </div><div className="quality-note">Low 480p60 / 1.5 Mbps, Medium 720p60 / 3.5 Mbps, High 1080p60 / 6 Mbps, Ultra 1440p144 / 14 Mbps. Ultra hedef değerdir; tarayıcı, GPU veya ağ daha düşük gerçek FPS üretebilir.</div></div>
          <div className="setting-block"><div className="setting-title"><Keyboard size={18}/><div><b>Mikrofon giriş modu</b><small>Sürekli ses algılama veya bas-konuş kullanımını seç.</small></div></div>
            <div className="segmented voice-input-mode"><button type="button" className={draft.voiceInputMode==='voice_activity'?'selected':''} onClick={()=>{setCapturingPttKey(false);setDraft(p=>({...p,voiceInputMode:'voice_activity'}))}}>Ses algılama</button><button type="button" className={draft.voiceInputMode==='push_to_talk'?'selected':''} onClick={()=>setDraft(p=>({...p,voiceInputMode:'push_to_talk'}))}>Bas-konuş</button></div>
            {draft.voiceInputMode==='push_to_talk'&&<div className="ptt-binding-row"><div><b>Bas-konuş tuşu</b><small>Tuş basılıyken mikrofon yayınlanır; bırakınca tekrar kapanır.</small></div><button type="button" className={capturingPttKey?'key-capture listening':'key-capture'} aria-label="Bas-konuş tuşunu değiştir" onClick={()=>setCapturingPttKey(true)} onKeyDown={e=>{if(!capturingPttKey)return;e.preventDefault();e.stopPropagation();if(e.code==='Escape'){setCapturingPttKey(false);return}setDraft(p=>({...p,pushToTalkKey:e.code}));setCapturingPttKey(false)}}>{capturingPttKey?'Bir tuşa bas…':pushToTalkKeyLabel(draft.pushToTalkKey)}</button></div>}
            {draft.voiceInputMode==='push_to_talk'&&<div className="quality-note">Bas-konuş yalnızca ShakeChat sekmesi klavye olaylarını alırken çalışır. Seçtiğin tuş, ses kanalına bağlıyken bas-konuş için ayrılır.</div>}
          </div>
          <div className="setting-block"><div className="setting-title"><AudioLines size={18}/><div><b>Mikrofon işleme</b><small>Tarayıcının WebRTC ses işleme seçenekleri.</small></div></div><div className="audio-toggle-list">
            <label className="setting-toggle"><span><b>Gürültü azaltma</b><small>Arka plan gürültüsünü azaltmayı dener.</small></span><input type="checkbox" checked={draft.noiseSuppression} onChange={e=>setDraft(p=>({...p,noiseSuppression:e.target.checked}))}/><i/></label>
            <label className="setting-toggle"><span><b>Yankı engelleme</b><small>Hoparlörden mikrofona dönen sesi azaltmayı dener.</small></span><input type="checkbox" checked={draft.echoCancellation} onChange={e=>setDraft(p=>({...p,echoCancellation:e.target.checked}))}/><i/></label>
            <label className="setting-toggle"><span><b>Otomatik kazanç</b><small>Mikrofon seviyesini otomatik dengelemeyi dener.</small></span><input type="checkbox" checked={draft.autoGainControl} onChange={e=>setDraft(p=>({...p,autoGainControl:e.target.checked}))}/><i/></label>
            <label className="setting-toggle"><span><b>Noise Gate</b><small>Konuşmadığın anlarda klavye ve oda sesini yumuşak biçimde bastırır.</small></span><input type="checkbox" checked={draft.noiseGateEnabled} onChange={e=>setDraft(p=>({...p,noiseGateEnabled:e.target.checked}))}/><i/></label>
            <label className="privacy-select">GATE THRESHOLD · {draft.noiseGateThreshold} dB<input aria-label="Gate Threshold" type="range" min="-70" max="-25" step="1" value={draft.noiseGateThreshold} onChange={e=>setDraft(p=>({...p,noiseGateThreshold:Number(e.target.value)}))}/><small>Daha sağa = daha agresif. Varsayılan -48 dB, hızlı açılır ve yumuşak kapanır.</small></label>
          </div></div>
        </>}

        {(tab==='appearance'||tab==='media')&&<div className="modal-actions app-settings-actions"><button type="button" className="ghost" onClick={onClose}>Vazgeç</button><button className="primary">Ayarları kaydet</button></div>}
      </section>
    </form>
  </dialog>;
}
