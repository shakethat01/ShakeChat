import fs from 'node:fs';
import path from 'node:path';

const file = path.join(process.cwd(), 'apps/web/src/noiseGate.ts');
if (!fs.existsSync(file)) throw new Error(`Dosya bulunamadi: ${file}`);
let text = fs.readFileSync(file, 'utf8');

const from = `  async restart(options: AudioProcessorOptions) {\n    this.disconnect(false);\n    await this.build(options);\n  }`;
const to = `  async restart(options: AudioProcessorOptions) {\n    // LiveKit 2.22.x restarts TrackProcessor with a new MediaStreamTrack but does\n    // not pass audioContext again. Reuse the context received during init.\n    const audioContext = options.audioContext || this.context;\n    if (!audioContext) throw new Error('ShakeChat audio processor context is unavailable during restart.');\n    const oldProcessedTrack = this.processedTrack;\n    this.disconnect(false);\n    await this.build({ ...options, audioContext });\n    if (oldProcessedTrack && oldProcessedTrack !== this.processedTrack) {\n      try { oldProcessedTrack.stop(); } catch {}\n    }\n  }`;

if (text.includes(from)) {
  text = text.replace(from, to);
  fs.writeFileSync(file, text);
  console.log('Audio Stability v3 LiveKit hotfix: AudioContext korunuyor, eski processed track temizleniyor.');
} else if (text.includes('oldProcessedTrack = this.processedTrack')) {
  console.log('Audio Stability v3 LiveKit hotfix zaten uygulanmis.');
} else {
  throw new Error('NoiseGateProcessor restart blogu beklenen sekilde bulunamadi.');
}
