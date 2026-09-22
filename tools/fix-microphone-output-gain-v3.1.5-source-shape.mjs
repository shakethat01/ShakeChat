import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const file = path.join(process.cwd(), 'tools/apply-microphone-output-gain-v3.1.5.mjs');
if (!fs.existsSync(file)) throw new Error('Dosya bulunamadi: ' + file);

let text = fs.readFileSync(file, 'utf8');
const oldBlock = `  const target = '        preferences.noiseGateThreshold,\\n      );';\n  const replacement = '        preferences.noiseGateThreshold,\\n        preferences.microphoneGainPercent,\\n      );';\n  const count = voice.split(target).length - 1;\n  if (count < 3) throw new Error('processor settings gain propagation hedefi az: ' + count);\n  voice = voice.split(target).join(replacement);\n`;
const newBlock = `  const targetDeep = '        preferences.noiseGateThreshold,\\n      );';\n  const replacementDeep = '        preferences.noiseGateThreshold,\\n        preferences.microphoneGainPercent,\\n      );';\n  const deepCount = voice.split(targetDeep).length - 1;\n  if (deepCount < 2) throw new Error('processor constructor/settings gain hedefi az: ' + deepCount);\n  voice = voice.split(targetDeep).join(replacementDeep);\n\n  const targetShallow = '      preferences.noiseGateThreshold,\\n    );';\n  const replacementShallow = '      preferences.noiseGateThreshold,\\n      preferences.microphoneGainPercent,\\n    );';\n  const shallowCount = voice.split(targetShallow).length - 1;\n  if (shallowCount < 1) throw new Error('controlled restart gain hedefi az: ' + shallowCount);\n  voice = voice.split(targetShallow).join(replacementShallow);\n`;

if (text.includes(oldBlock)) {
  text = text.replace(oldBlock, newBlock);
  fs.writeFileSync(file, text);
  console.log('v3.1.5 source-shape hotfix uygulandi: 2 deep + 1 shallow processor call destekleniyor.');
} else if (text.includes("const targetDeep = '        preferences.noiseGateThreshold")) {
  console.log('v3.1.5 source-shape hotfix zaten uygulanmis.');
} else {
  throw new Error('Beklenen v3.1.5 gain propagation blogu bulunamadi.');
}

const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
if (check.status !== 0) {
  process.stderr.write(check.stderr || check.stdout || 'node --check basarisiz\n');
  process.exit(check.status ?? 1);
}
console.log('apply-microphone-output-gain-v3.1.5.mjs node --check: OK');
