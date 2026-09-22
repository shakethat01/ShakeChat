import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();

const replacements = [
  {
    file: 'tools/apply-audio-stability-v3.0.mjs',
    broken: "      console.warn(`[voice:v3] ${engine.toUpperCase()} init failed`, error);",
    fixed: "      console.warn('[voice:v3] ' + engine.toUpperCase() + ' init failed', error);",
    label: 'v3.0 primary patch',
  },
  {
    file: 'tools/apply-audio-worklet-reuse-v3.1.mjs',
    broken: "      console.warn(`[voice:v3.1] ${engine.toUpperCase()} init failed`, error);",
    fixed: "      console.warn('[voice:v3.1] ' + engine.toUpperCase() + ' init failed', error);",
    label: 'v3.1 worklet reuse patch',
  },
];

for (const item of replacements) {
  const file = path.join(root, item.file);
  if (!fs.existsSync(file)) throw new Error('Dosya bulunamadi: ' + file);
  let text = fs.readFileSync(file, 'utf8');
  if (text.includes(item.broken)) {
    text = text.replace(item.broken, item.fixed);
    fs.writeFileSync(file, text);
    console.log('Syntax hotfix uygulandi: ' + item.label);
  } else if (text.includes(item.fixed)) {
    console.log('Syntax hotfix zaten uygulanmis: ' + item.label);
  } else {
    throw new Error('Beklenen nested template literal bulunamadi: ' + item.file);
  }
}

const scripts = [
  'tools/apply-audio-stability-v3.0.mjs',
  'tools/apply-audio-stability-v3.0-hotfix.mjs',
  'tools/apply-audio-worklet-reuse-v3.1.mjs',
  'tools/apply-audio-stability-v3.1-error-surface.mjs',
  'tools/verify-audio-stability-v3.0.mjs',
];

for (const relative of scripts) {
  const file = path.join(root, relative);
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) {
    process.stderr.write('\nnode --check FAIL: ' + relative + '\n');
    process.stderr.write(check.stderr || check.stdout || 'Bilinmeyen syntax hatasi\n');
    process.exit(check.status ?? 1);
  }
  console.log('node --check OK: ' + relative);
}

console.log('Tum Audio Stability patch scriptleri parse edilebilir durumda.');
