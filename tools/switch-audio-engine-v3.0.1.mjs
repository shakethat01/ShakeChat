import fs from 'node:fs';
import path from 'node:path';

const engine = process.argv[2];
if (engine !== 'gtcrn' && engine !== 'rnnoise') {
  console.error('Kullanim: node tools/switch-audio-engine-v3.0.1.mjs gtcrn|rnnoise');
  process.exit(2);
}

const file = path.join(process.cwd(), 'apps/web/src/noiseGate.ts');
if (!fs.existsSync(file)) throw new Error(`Dosya bulunamadi: ${file}`);
let text = fs.readFileSync(file, 'utf8');

if (!text.includes("readonly name = 'shakechat-stable-ai-gate-v3.1'") && !text.includes("readonly name = 'shakechat-stable-ai-gate-v3'")) {
  throw new Error('Audio Stability v3.x once uygulanmali.');
}

const re = /const PRIMARY_ENGINE: 'gtcrn' \| 'rnnoise' = '(?:gtcrn|rnnoise)';/;
if (!re.test(text)) throw new Error('PRIMARY_ENGINE satiri bulunamadi.');
text = text.replace(re, `const PRIMARY_ENGINE: 'gtcrn' | 'rnnoise' = '${engine}';`);
fs.writeFileSync(file, text);

console.log(`Audio Stability v3 primary engine: ${engine.toUpperCase()}`);
console.log(engine === 'gtcrn'
  ? 'GTCRN birincil; init sorunu olursa RNNoise fallback.'
  : 'RNNoise birincil; init sorunu olursa GTCRN fallback.');
console.log('Simdi: npm run typecheck && VITE_API_ORIGIN=same-origin npm run build && LIVEKIT_PUBLIC_URL=ws://localhost:7880 npm test');
