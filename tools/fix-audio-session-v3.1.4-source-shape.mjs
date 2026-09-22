import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const file = path.join(root, 'tools/apply-audio-session-stability-v3.1.4.mjs');
if (!fs.existsSync(file)) throw new Error('Dosya bulunamadi: ' + file);

let text = fs.readFileSync(file, 'utf8');
const oldLine = "voice = replaceAllCount(voice, disconnectState, disconnectStatePersistent, 3, 'disconnect mute persistence');";
const newLine = "voice = replaceAllCount(voice, disconnectState, disconnectStatePersistent, 1, 'disconnect mute persistence');";

if (text.includes(newLine)) {
  console.log('v3.1.4 source-shape hotfix zaten uygulanmis.');
} else if (text.includes(oldLine)) {
  text = text.replace(oldLine, newLine);
  fs.writeFileSync(file, text);
  console.log('v3.1.4 source-shape hotfix uygulandi: disconnect exact-match 3 -> 1.');
} else {
  throw new Error('Beklenen v3.1.4 disconnect hedefi bulunamadi; script baska sekilde degismis olabilir.');
}

console.log('node --check sonraki adimda calistirilabilir.');
