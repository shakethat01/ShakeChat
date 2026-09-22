import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const file = path.join(root, 'apps/web/src/noiseGate.ts');
if (!fs.existsSync(file)) throw new Error('Dosya bulunamadi: ' + file);

const mode = (process.argv[2] || '').toLowerCase();
if (!['off', 'on'].includes(mode)) {
  console.error('Kullanim: node tools/toggle-audio-gate-diagnostic-v3.1.3.mjs off|on');
  process.exit(2);
}

let text = fs.readFileSync(file, 'utf8');
if (!text.includes("readonly name = 'shakechat-stable-ai-gate-v3.1'")) {
  throw new Error('Audio Stability v3.1 aktif degil.');
}
if (!text.includes('setSpeakingListener(')) {
  throw new Error('Local Speaking Meter v3.1.1 aktif degil.');
}

const normal = '    this.gateEnabled = gateEnabled;';
const diagnostic = "    this.gateEnabled = false; // v3.1.3 diagnostic: AI-only, custom gate bypassed";

if (mode === 'off') {
  if (text.includes(diagnostic)) {
    console.log('AI-only diagnostic zaten aktif: custom gate bypassed.');
  } else {
    const count = text.split(normal).length - 1;
    if (count !== 1) throw new Error('gateEnabled atama hedefi beklenen sayida degil: ' + count);
    text = text.replace(normal, diagnostic);
    fs.writeFileSync(file, text);
    console.log('AI-only diagnostic AKTIF: custom gate tamamen bypass edildi.');
  }
  console.log('- GTCRN/RNNoise AI suppression aktif kalir');
  console.log('- Echo cancellation tercihi aktif kalir');
  console.log('- Local speaking meter aktif kalir');
  console.log('- Noise gate sese artik gain uygulamaz');
  console.log('- Amac: zamanla ses karakteri degisimi ve kelime sonu kesilmesinin gate kaynakli olup olmadigini izole etmek');
} else {
  if (text.includes(normal)) {
    console.log('Custom gate zaten normal modda.');
  } else {
    const count = text.split(diagnostic).length - 1;
    if (count !== 1) throw new Error('Diagnostic gate hedefi beklenen sayida degil: ' + count);
    text = text.replace(diagnostic, normal);
    fs.writeFileSync(file, text);
    console.log('Custom gate NORMAL moda geri alindi.');
  }
}
