import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const noiseGate = read('apps/web/src/noiseGate.ts');
const voice = read('apps/web/src/useVoice.ts');
const settings = read('apps/web/src/AppSettings.tsx');
const app = read('apps/web/src/App.tsx');
const pkg = JSON.parse(read('apps/web/package.json'));
const lock = read('package-lock.json');

const checks = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok, detail });
}

check('GTCRN/RNNoise dependency', Boolean(pkg.dependencies?.['@sapphi-red/web-noise-suppressor']));
check('package-lock dependency', lock.includes('node_modules/@sapphi-red/web-noise-suppressor'));
check('deterministic processor marker', noiseGate.includes("readonly name = 'shakechat-stable-ai-gate-v3'"));
check('GTCRN primary marker', noiseGate.includes("const PRIMARY_ENGINE: 'gtcrn' | 'rnnoise' = 'gtcrn'"));
check('RNNoise fallback present', noiseGate.includes("['gtcrn', 'rnnoise']"));
check('mono AI channels', noiseGate.includes('maxChannels: 1'));
check('no experimental parallel aiGain', !noiseGate.includes('private aiGain'));
check('no experimental parallel rawGain', !noiseGate.includes('private rawGain'));
check('no experimental mix graph', !noiseGate.includes('private mix'));
check('48 kHz mono capture', voice.includes('sampleRate: 48_000') && voice.includes('channelCount: 1'));
check('browser NS forced off', voice.includes('noiseSuppression: false'));
check('browser AGC forced off', voice.includes('autoGainControl: false'));
check('saved processing signature', voice.includes('const processingSignature = ['));
check('single controlled restart', voice.includes('[voice:v3] saved profile applied after one controlled restart'));
check('no legacy runtime tuning effect', !voice.includes('Runtime tuning is best effort.'));
check('no live applyConstraints churn', !voice.includes('[voice] live microphone constraints applied'));
check('three stable profiles', settings.includes("setVoiceProcessingProfile('off')") && settings.includes("setVoiceProcessingProfile('balanced')") && settings.includes("setVoiceProcessingProfile('strong')"));
check('balanced gate preset', settings.includes('noiseGateThreshold:-60'));
check('strong gate preset', settings.includes('noiseGateThreshold:-54'));
check('live preview prop removed', !settings.includes('onPreview:(preferences:AppPreferences)=>void;') && !settings.includes('function previewMedia'));
check('App live preview binding removed', !app.includes('onPreview={next=>setPreferences(next)}'));

let failed = 0;
for (const item of checks) {
  const prefix = item.ok ? 'OK ' : 'FAIL';
  console.log(`${prefix}  ${item.name}${item.detail ? ` - ${item.detail}` : ''}`);
  if (!item.ok) failed += 1;
}

console.log(`\nAudio Stability v3 static verify: ${checks.length - failed}/${checks.length} OK`);
if (failed) {
  console.error(`${failed} kontrol basarisiz. Build/test calistirmadan once patch durumunu kontrol et.`);
  process.exit(1);
}

console.log('Static kontroller temiz. Sirada typecheck + build + test var.');
