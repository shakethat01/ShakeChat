import fs from 'node:fs';
import path from 'node:path';

const file = path.join(process.cwd(), 'apps/web/src/useVoice.ts');
const processorFile = path.join(process.cwd(), 'apps/web/src/noiseGate.ts');
if (!fs.existsSync(file) || !fs.existsSync(processorFile)) throw new Error('Audio dosyalari bulunamadi.');
let text = fs.readFileSync(file, 'utf8');
const processor = fs.readFileSync(processorFile, 'utf8');

if (!processor.includes("readonly name = 'shakechat-stable-ai-gate-v3.1'") && !processor.includes("readonly name = 'shakechat-stable-ai-gate-v3'")) {
  throw new Error('Audio Stability v3.x once uygulanmali.');
}

if (text.includes('  dtx: true,')) {
  text = text.replace('  dtx: true,', '  dtx: false,');
  fs.writeFileSync(file, text);
  console.log('Opsiyonel v3.0.2: Opus DTX kapatildi; ses akisi surekli tutulacak.');
  console.log('Bu patch sadece ilk hece/cut-in veya DTX kaynakli kopukluk suphelerinde kullanilmali.');
} else if (text.includes('  dtx: false,')) {
  console.log('Opsiyonel v3.0.2 zaten uygulanmis.');
} else {
  throw new Error('MICROPHONE_PUBLISH_OPTIONS dtx satiri bulunamadi.');
}

console.log('Simdi: npm run typecheck && VITE_API_ORIGIN=same-origin npm run build && LIVEKIT_PUBLIC_URL=ws://localhost:7880 npm test');
