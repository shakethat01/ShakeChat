import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const noiseFile = path.join(root, 'apps/web/src/noiseGate.ts');
const settingsFile = path.join(root, 'apps/web/src/AppSettings.tsx');
for (const file of [noiseFile, settingsFile]) {
  if (!fs.existsSync(file)) throw new Error('Dosya bulunamadi: ' + file);
}

function replaceRequired(text, from, to, label) {
  if (text.includes(to)) return text;
  const count = text.split(from).length - 1;
  if (count !== 1) throw new Error(label + ': hedef sayisi ' + count + ' (1 bekleniyordu)');
  return text.replace(from, to);
}

let noise = fs.readFileSync(noiseFile, 'utf8');
if (!noise.includes("readonly name = 'shakechat-stable-ai-gate-v3.1'")) {
  throw new Error('Audio Stability v3.1 aktif degil.');
}
if (!noise.includes('setSpeakingListener(')) {
  throw new Error('Local Speaking Meter v3.1.1 aktif degil. Once speaking meter patch uygulanmali.');
}

noise = replaceRequired(
  noise,
  '  private readonly holdMs = 240;',
  '  private readonly holdMs = 480;',
  'gate tail hold',
);
noise = replaceRequired(
  noise,
  '    const effectiveClose = effectiveOpen - 3;',
  '    const effectiveClose = effectiveOpen - 6;',
  'gate close hysteresis',
);
noise = replaceRequired(
  noise,
  '      gateGain.gain.setTargetAtTime(this.closedGain, context.currentTime, 0.09);',
  '      gateGain.gain.setTargetAtTime(this.closedGain, context.currentTime, 0.18);',
  'gate release',
);
fs.writeFileSync(noiseFile, noise);

let settings = fs.readFileSync(settingsFile, 'utf8');
settings = replaceRequired(
  settings,
  ": {...previous,aiNoiseSuppression:true,noiseGateEnabled:true,noiseGateThreshold:-54,noiseSuppression:false,autoGainControl:false}",
  ": {...previous,aiNoiseSuppression:true,noiseGateEnabled:true,noiseGateThreshold:-60,noiseSuppression:false,autoGainControl:false}",
  'strong profile threshold',
);
settings = replaceRequired(
  settings,
  ": {...previous,aiNoiseSuppression:true,noiseGateEnabled:true,noiseGateThreshold:-60,noiseSuppression:false,autoGainControl:false});",
  ": {...previous,aiNoiseSuppression:true,noiseGateEnabled:true,noiseGateThreshold:-66,noiseSuppression:false,autoGainControl:false});",
  'balanced profile threshold',
);
settings = settings.replace(
  '<b>Dengeli:</b> GTCRN (RNNoise fallback) + hafif gate (-60 dB). <b>Güçlü:</b> aynı AI temizleme + daha sıkı gate (-54 dB).',
  '<b>Dengeli:</b> GTCRN (RNNoise fallback) + doğal gate (-66 dB). <b>Güçlü:</b> aynı AI temizleme + daha sıkı gate (-60 dB).',
);
fs.writeFileSync(settingsFile, settings);

console.log('\n=== ShakeChat Audio Tail Preserve v3.1.2 uygulandi ===');
console.log('- Gate hold: 240ms -> 480ms');
console.log('- Kapanis hysteresis: 3dB -> 6dB');
console.log('- Release: 90ms -> 180ms');
console.log('- Dengeli gate: -66dB');
console.log('- Guclu gate: -60dB');
console.log('- Amac: kelime sonlarindaki dusuk enerjili sesleri kesmeden arka plan sessizligini korumak');
console.log('\nProfil esikleri icin ayarlarda Dengeli/Guclu secimini yeniden tiklayip Kaydet.');
