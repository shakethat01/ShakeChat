import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const file = path.join(process.cwd(), 'tools/apply-audio-stability-v3.0.mjs');
if (!fs.existsSync(file)) throw new Error(`Dosya bulunamadi: ${file}`);

let text = fs.readFileSync(file, 'utf8');
const broken = "      console.warn(`[voice:v3] ${engine.toUpperCase()} init failed`, error);";
const fixed = "      console.warn('[voice:v3] ' + engine.toUpperCase() + ' init failed', error);";

if (text.includes(broken)) {
  text = text.replace(broken, fixed);
  fs.writeFileSync(file, text);
  console.log('Audio Stability v3.1 syntax hotfix uygulandi.');
} else if (text.includes(fixed)) {
  console.log('Audio Stability v3.1 syntax hotfix zaten uygulanmis.');
} else {
  throw new Error('Beklenen nested template literal satiri bulunamadi.');
}

const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
if (check.status !== 0) {
  process.stderr.write(check.stderr || check.stdout || 'node --check basarisiz\n');
  process.exit(check.status ?? 1);
}
console.log('node --check: OK');
