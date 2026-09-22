import fs from 'node:fs';
import path from 'node:path';

const file = path.join(process.cwd(), 'apps/web/src/useVoice.ts');
if (!fs.existsSync(file)) throw new Error(`Dosya bulunamadi: ${file}`);
let text = fs.readFileSync(file, 'utf8');

const from = `        console.warn('[voice:v3] controlled microphone restart failed', {\n          signature: processingSignature,\n          error,\n        });`;
const to = `        console.warn('[voice:v3] controlled microphone restart failed', {\n          signature: processingSignature,\n          error,\n        });\n        onError(error instanceof Error ? \`Mikrofon profili uygulanamadi: \${error.message}\` : 'Mikrofon profili uygulanamadi.');`;

if (text.includes(from)) {
  text = text.replace(from, to);
  fs.writeFileSync(file, text);
  console.log('Audio Stability v3.1: profil restart hatalari artik kullaniciya da gosterilecek.');
} else if (text.includes('Mikrofon profili uygulanamadi:')) {
  console.log('Audio Stability v3.1 error surface zaten uygulanmis.');
} else {
  throw new Error('Controlled microphone restart catch blogu bulunamadi.');
}
