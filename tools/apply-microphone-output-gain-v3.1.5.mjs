import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const files = {
  noise: path.join(root, 'apps/web/src/noiseGate.ts'),
  voice: path.join(root, 'apps/web/src/useVoice.ts'),
  prefs: path.join(root, 'apps/web/src/preferences.ts'),
  settings: path.join(root, 'apps/web/src/AppSettings.tsx'),
};
for (const file of Object.values(files)) {
  if (!fs.existsSync(file)) throw new Error('Dosya bulunamadi: ' + file);
}

function replaceOnce(text, from, to, label) {
  const count = text.split(from).length - 1;
  if (count !== 1) throw new Error(label + ': hedef sayisi ' + count + ' (1 bekleniyordu)');
  return text.replace(from, to);
}

// ---------------------------------------------------------------------------
// Preferences: persistent 0-200% mic output gain, default 100%.
// ---------------------------------------------------------------------------
let prefs = fs.readFileSync(files.prefs, 'utf8');
if (!prefs.includes('microphoneGainPercent: number;')) {
  prefs = replaceOnce(
    prefs,
    '  noiseGateThreshold: number;\n',
    '  noiseGateThreshold: number;\n  microphoneGainPercent: number;\n',
    'preferences type',
  );

  const defaultMatch = prefs.match(/(  noiseGateThreshold:\s*-?\d+,\n)/);
  if (!defaultMatch) throw new Error('preferences default noiseGateThreshold bulunamadi');
  prefs = prefs.replace(defaultMatch[1], defaultMatch[1] + '  microphoneGainPercent: 100,\n');

  const clampNeedle = 'export function loadPreferences(): AppPreferences {';
  const clampHelper = `export function clampMicrophoneGainPercent(value: number) {\n  if (!Number.isFinite(value)) return DEFAULT_PREFERENCES.microphoneGainPercent;\n  return Math.max(0, Math.min(200, Math.round(value)));\n}\n\n`;
  prefs = replaceOnce(prefs, clampNeedle, clampHelper + clampNeedle, 'microphone gain clamp helper');

  const loadMatch = prefs.match(/(      noiseGateThreshold:\s*clampNoiseGateThreshold\([^\n]+\),\n)/);
  if (!loadMatch) throw new Error('preferences load noiseGateThreshold satiri bulunamadi');
  prefs = prefs.replace(
    loadMatch[1],
    loadMatch[1] + '      microphoneGainPercent: clampMicrophoneGainPercent(typeof parsed.microphoneGainPercent === \'number\' ? parsed.microphoneGainPercent : DEFAULT_PREFERENCES.microphoneGainPercent),\n',
  );
}
fs.writeFileSync(files.prefs, prefs);

// ---------------------------------------------------------------------------
// Processor: post-AI fixed gain stage + peak limiter.
// This is deliberately AFTER AI/gate so boosting does not change suppression
// decisions. 100% = unity, 200% = x2 (~+6 dB).
// ---------------------------------------------------------------------------
let noise = fs.readFileSync(files.noise, 'utf8');
if (!noise.includes("readonly name = 'shakechat-stable-ai-gate-v3.1'")) throw new Error('Audio Stability v3.1 aktif degil.');
if (!noise.includes('v3.1.3 diagnostic: AI-only, custom gate bypassed')) throw new Error('AI-only diagnostic aktif degil; bu patch mevcut test zinciri icin gate bypass bekliyor.');

if (!noise.includes('private outputGain?: GainNode;')) {
  noise = replaceOnce(
    noise,
    '  private gateGain?: GainNode;\n  private destination?: MediaStreamAudioDestinationNode;\n',
    '  private gateGain?: GainNode;\n  private outputGain?: GainNode;\n  private limiter?: DynamicsCompressorNode;\n  private destination?: MediaStreamAudioDestinationNode;\n',
    'processor gain fields',
  );

  noise = replaceOnce(
    noise,
    '  private thresholdDb = -60;\n',
    '  private thresholdDb = -60;\n  private microphoneGainPercent = 100;\n',
    'processor gain state',
  );

  noise = replaceOnce(
    noise,
    '  constructor(aiEnabled = true, gateEnabled = true, thresholdDb = -60) {\n    this.setSettings(aiEnabled, gateEnabled, thresholdDb);\n  }\n\n  setSettings(aiEnabled: boolean, gateEnabled: boolean, thresholdDb: number) {\n',
    '  constructor(aiEnabled = true, gateEnabled = true, thresholdDb = -60, microphoneGainPercent = 100) {\n    this.setSettings(aiEnabled, gateEnabled, thresholdDb, microphoneGainPercent);\n  }\n\n  setSettings(aiEnabled: boolean, gateEnabled: boolean, thresholdDb: number, microphoneGainPercent = 100) {\n',
    'processor constructor/settings signature',
  );

  noise = replaceOnce(
    noise,
    '    this.thresholdDb = Math.max(-70, Math.min(-25, thresholdDb));\n    this.aboveSince = 0;\n',
    '    this.thresholdDb = Math.max(-70, Math.min(-25, thresholdDb));\n    this.microphoneGainPercent = Math.max(0, Math.min(200, Math.round(microphoneGainPercent)));\n    this.aboveSince = 0;\n',
    'processor gain clamp',
  );

  noise = replaceOnce(
    noise,
    '    const context = this.context;\n    const gate = this.gateGain;\n',
    '    const context = this.context;\n    const gate = this.gateGain;\n    const outputGain = this.outputGain;\n    if (context && outputGain) {\n      outputGain.gain.cancelScheduledValues(context.currentTime);\n      outputGain.gain.setTargetAtTime(this.microphoneGainPercent / 100, context.currentTime, 0.015);\n    }\n',
    'processor live gain update',
  );

  noise = replaceOnce(
    noise,
    '      thresholdDb: this.thresholdDb,\n      sampleRate: this.context?.sampleRate,\n',
    '      thresholdDb: this.thresholdDb,\n      microphoneGainPercent: this.microphoneGainPercent,\n      sampleRate: this.context?.sampleRate,\n',
    'processor debug gain',
  );

  noise = replaceOnce(
    noise,
    '    const gateGain = context.createGain();\n    gateGain.gain.value = this.gateEnabled ? this.closedGain : 1;\n    const destination = context.createMediaStreamDestination();\n\n    inputBus.connect(analyser);\n    inputBus.connect(delay);\n    delay.connect(gateGain);\n    gateGain.connect(destination);\n',
    '    const gateGain = context.createGain();\n    gateGain.gain.value = this.gateEnabled ? this.closedGain : 1;\n    const outputGain = context.createGain();\n    outputGain.gain.value = this.microphoneGainPercent / 100;\n    const limiter = context.createDynamicsCompressor();\n    limiter.threshold.value = -1;\n    limiter.knee.value = 0;\n    limiter.ratio.value = 20;\n    limiter.attack.value = 0.003;\n    limiter.release.value = 0.12;\n    const destination = context.createMediaStreamDestination();\n\n    inputBus.connect(analyser);\n    inputBus.connect(delay);\n    delay.connect(gateGain);\n    gateGain.connect(outputGain);\n    outputGain.connect(limiter);\n    limiter.connect(destination);\n',
    'processor output graph',
  );

  noise = replaceOnce(
    noise,
    '    this.gateGain = gateGain;\n    this.destination = destination;\n',
    '    this.gateGain = gateGain;\n    this.outputGain = outputGain;\n    this.limiter = limiter;\n    this.destination = destination;\n',
    'processor output refs',
  );

  noise = replaceOnce(
    noise,
    '    try { this.gateGain?.disconnect(); } catch {}\n\n    if (stopOutput) {\n',
    '    try { this.gateGain?.disconnect(); } catch {}\n    try { this.outputGain?.disconnect(); } catch {}\n    try { this.limiter?.disconnect(); } catch {}\n\n    if (stopOutput) {\n',
    'processor output disconnect',
  );

  noise = replaceOnce(
    noise,
    '    this.gateGain = undefined;\n    this.destination = undefined;\n',
    '    this.gateGain = undefined;\n    this.outputGain = undefined;\n    this.limiter = undefined;\n    this.destination = undefined;\n',
    'processor output cleanup',
  );
}
fs.writeFileSync(files.noise, noise);

// ---------------------------------------------------------------------------
// useVoice: propagate persisted gain into processor and processing signature.
// ---------------------------------------------------------------------------
let voice = fs.readFileSync(files.voice, 'utf8');
if (!voice.includes('shakechat.voice-global-muted.v1')) throw new Error('Audio Session Stability v3.1.4 aktif degil.');

if (!voice.includes("`gain${Math.round(preferences.microphoneGainPercent)}`")) {
  voice = replaceOnce(
    voice,
    '    Math.round(preferences.noiseGateThreshold),\n    preferences.echoCancellation ? \'echo1\' : \'echo0\',\n',
    '    Math.round(preferences.noiseGateThreshold),\n    `gain${Math.round(preferences.microphoneGainPercent)}`,\n    preferences.echoCancellation ? \'echo1\' : \'echo0\',\n',
    'processing signature gain',
  );

  const target = '        preferences.noiseGateThreshold,\n      );';
  const replacement = '        preferences.noiseGateThreshold,\n        preferences.microphoneGainPercent,\n      );';
  const count = voice.split(target).length - 1;
  if (count < 3) throw new Error('processor settings gain propagation hedefi az: ' + count);
  voice = voice.split(target).join(replacement);

  voice = replaceOnce(
    voice,
    '    preferences.noiseGateThreshold,\n    processingSignature,\n',
    '    preferences.noiseGateThreshold,\n    preferences.microphoneGainPercent,\n    processingSignature,\n',
    'apply tuning dependency gain',
  );
}
fs.writeFileSync(files.voice, voice);

// ---------------------------------------------------------------------------
// Settings UI: 0-200%, 100% default. Save-based like the rest of audio stack.
// ---------------------------------------------------------------------------
let settings = fs.readFileSync(files.settings, 'utf8');
if (!settings.includes('Mikrofon çıkış seviyesi')) {
  const echoNeedle = '            <label className="setting-toggle"><span><b>Yankı engelleme</b>';
  const gainUi = `            <div className="media-quality-grid"><label>MİKROFON ÇIKIŞ SEVİYESİ<input aria-label="Mikrofon çıkış seviyesi" type="range" min="0" max="200" step="5" value={draft.microphoneGainPercent} onChange={e=>setDraft(p=>({...p,microphoneGainPercent:Number(e.target.value)}))}/><small><b>{draft.microphoneGainPercent}%</b> · 100% doğal seviye · 200% yaklaşık +6 dB. 100% üstünde tepe limiter'ı kırpılmayı önler.</small></label></div>\n`;
  settings = replaceOnce(settings, echoNeedle, gainUi + echoNeedle, 'settings microphone gain control');
}
fs.writeFileSync(files.settings, settings);

console.log('\n=== ShakeChat Microphone Output Gain v3.1.5 uygulandi ===');
console.log('- Mikrofon cikis seviyesi: 0-200%, varsayilan 100%');
console.log('- Gain AI/gate SONRASINDA uygulanir; filtre kararlarini bozmaz');
console.log('- 100% unity, 200% x2 (~+6 dB)');
console.log('- -1 dB peak limiter yuksek gain degerlerinde clipping riskini azaltir');
console.log('- Deger AppPreferences/localStorage icinde kalici saklanir');
console.log('- AI-only diagnostic ve v3.1.4 watchdog korunur');
