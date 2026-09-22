import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const settingsFile = path.join(root, 'apps/web/src/AppSettings.tsx');
const appFile = path.join(root, 'apps/web/src/App.tsx');

for (const file of [settingsFile, appFile]) {
  if (!fs.existsSync(file)) throw new Error(`Dosya bulunamadı: ${file}`);
}

function replaceOnce(text, from, to, label) {
  const first = text.indexOf(from);
  if (first < 0) throw new Error(`${label}: hedef bulunamadı`);
  if (text.indexOf(from, first + from.length) >= 0) throw new Error(`${label}: hedef birden fazla bulundu`);
  return text.slice(0, first) + to + text.slice(first + from.length);
}

let settings = fs.readFileSync(settingsFile, 'utf8');

if (!settings.includes('onPreview:(preferences:AppPreferences)=>void;')) {
  settings = replaceOnce(
    settings,
    '  onSave:(preferences:AppPreferences)=>void;\n  onSessionRenewed:(token:string,user:User)=>void;\n',
    '  onSave:(preferences:AppPreferences)=>void;\n  onPreview:(preferences:AppPreferences)=>void;\n  onSessionRenewed:(token:string,user:User)=>void;\n',
    'AppSettings prop type',
  );

  settings = replaceOnce(
    settings,
    'export function AppSettingsModal({user,preferences,onClose,onSave,onSessionRenewed,onNotice}:{',
    'export function AppSettingsModal({user,preferences,onClose,onSave,onPreview,onSessionRenewed,onNotice}:{',
    'AppSettings prop destructure',
  );

  settings = replaceOnce(
    settings,
    '  const [draft,setDraft]=useState<AppPreferences>(preferences);\n',
    '  const [draft,setDraft]=useState<AppPreferences>(preferences);\n  const initialPreferences=useRef<AppPreferences>(preferences);\n',
    'initial preferences ref',
  );

  settings = replaceOnce(
    settings,
    "  function handleSubmit(e:FormEvent){\n    e.preventDefault();\n    if(tab==='account'){void changePassword();return}\n    if(tab==='privacy'){void savePrivacy();return}\n    onSave(draft);\n  }\n",
    "  function handleSubmit(e:FormEvent){\n    e.preventDefault();\n    if(tab==='account'){void changePassword();return}\n    if(tab==='privacy'){void savePrivacy();return}\n    onSave(draft);\n  }\n\n  function previewMedia(next:AppPreferences){\n    setDraft(next);\n    onPreview(next);\n  }\n\n  function cancelAndClose(){\n    onPreview(initialPreferences.current);\n    onClose();\n  }\n",
    'live preview helpers',
  );

  settings = settings.replace(
    'onCancel={e=>{e.preventDefault();onClose()}}',
    'onCancel={e=>{e.preventDefault();cancelAndClose()}}',
  );
  settings = settings.replace(
    '<button type="button" className="icon-btn" aria-label="Kapat" onClick={onClose}><X size={20}/></button>',
    '<button type="button" className="icon-btn" aria-label="Kapat" onClick={cancelAndClose}><X size={20}/></button>',
  );

  const liveReplacements = [
    [
      "checked={draft.aiNoiseSuppression} onChange={e=>setDraft(p=>({...p,aiNoiseSuppression:e.target.checked}))}",
      "checked={draft.aiNoiseSuppression} onChange={e=>previewMedia({...draft,aiNoiseSuppression:e.target.checked})}",
    ],
    [
      "checked={draft.echoCancellation} onChange={e=>setDraft(p=>({...p,echoCancellation:e.target.checked}))}",
      "checked={draft.echoCancellation} onChange={e=>previewMedia({...draft,echoCancellation:e.target.checked})}",
    ],
    [
      "checked={draft.autoGainControl} onChange={e=>setDraft(p=>({...p,autoGainControl:e.target.checked}))}",
      "checked={draft.autoGainControl} onChange={e=>previewMedia({...draft,autoGainControl:e.target.checked})}",
    ],
    [
      "checked={draft.noiseGateEnabled} onChange={e=>setDraft(p=>({...p,noiseGateEnabled:e.target.checked}))}",
      "checked={draft.noiseGateEnabled} onChange={e=>previewMedia({...draft,noiseGateEnabled:e.target.checked})}",
    ],
    [
      "value={draft.noiseGateThreshold} disabled={!draft.noiseGateEnabled} onChange={e=>setDraft(p=>({...p,noiseGateThreshold:Number(e.target.value)}))}",
      "value={draft.noiseGateThreshold} disabled={!draft.noiseGateEnabled} onChange={e=>previewMedia({...draft,noiseGateThreshold:Number(e.target.value)})}",
    ],
  ];

  for (const [from, to] of liveReplacements) {
    if (!settings.includes(from)) throw new Error(`Canlı kontrol hedefi bulunamadı: ${from.slice(0, 60)}...`);
    settings = settings.replace(from, to);
  }

  settings = settings.replace(
    'AI temizleme cihazında çalışır; ayarlar ses kanalındayken de canlı uygulanır.',
    'AI temizleme cihazında çalışır. Anahtarlar ve gate seviyesi anında uygulanır; Kaydet yalnızca tercihi kalıcı yapar.',
  );
  settings = settings.replace(
    '<button type="button" className="ghost" onClick={onClose}>Vazgeç</button>',
    '<button type="button" className="ghost" onClick={cancelAndClose}>Vazgeç</button>',
  );
}

fs.writeFileSync(settingsFile, settings);

let app = fs.readFileSync(appFile, 'utf8');
if (!app.includes('onPreview={next=>setPreferences(next)}')) {
  app = replaceOnce(
    app,
    'preferences={preferences} onClose={()=>setAppSettingsOpen(false)} onSave={saveAppPreferences} onNotice=',
    'preferences={preferences} onClose={()=>setAppSettingsOpen(false)} onSave={saveAppPreferences} onPreview={next=>setPreferences(next)} onNotice=',
    'AppSettings live preview binding',
  );
}
fs.writeFileSync(appFile, app);

console.log('\n=== ShakeChat Audio Live Controls v2.9.1 TAMAM ===');
console.log('- AI suppression switch: aninda');
console.log('- Echo cancellation switch: aninda');
console.log('- AGC switch: aninda');
console.log('- Noise Gate switch + threshold: aninda');
console.log('- Vazgec/X/Esc: pencere acilirkenki ayarlari geri yukler');
console.log('- Ayarlari kaydet: mevcut ayari kalici kaydeder');
console.log('\nSimdi: npm run typecheck');
