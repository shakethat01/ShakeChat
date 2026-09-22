import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const noiseFile = path.join(root, 'apps/web/src/noiseGate.ts');
const voiceFile = path.join(root, 'apps/web/src/useVoice.ts');
for (const file of [noiseFile, voiceFile]) if (!fs.existsSync(file)) throw new Error('Dosya bulunamadi: ' + file);

function replaceOnce(text, from, to, label) {
  const i = text.indexOf(from);
  if (i < 0) throw new Error(label + ': hedef bulunamadi');
  if (text.indexOf(from, i + from.length) >= 0) throw new Error(label + ': hedef birden fazla bulundu');
  return text.slice(0, i) + to + text.slice(i + from.length);
}

let noise = fs.readFileSync(noiseFile, 'utf8');
if (!noise.includes("readonly name = 'shakechat-stable-ai-gate-v3.1'")) throw new Error('Audio Stability v3.1 aktif degil.');

if (!noise.includes('private speakingListener?: (speaking: boolean) => void;')) {
  noise = replaceOnce(
    noise,
    '  private samples?: Float32Array<ArrayBuffer>;\n',
    '  private samples?: Float32Array<ArrayBuffer>;\n  private speakingListener?: (speaking: boolean) => void;\n  private speakingState = false;\n  private speakingUntil = 0;\n',
    'speaking fields',
  );

  noise = replaceOnce(
    noise,
    '  getEngine() {\n',
    "  setSpeakingListener(listener?: (speaking: boolean) => void) {\n    this.speakingListener = listener;\n    listener?.(this.speakingState);\n  }\n\n  private emitSpeaking(next: boolean) {\n    if (next === this.speakingState) return;\n    this.speakingState = next;\n    this.speakingListener?.(next);\n  }\n\n  getEngine() {\n",
    'speaking methods',
  );

  noise = replaceOnce(
    noise,
    '    this.openUntil = 0;\n    this.aboveSince = 0;\n    this.noiseFloorDb = -72;\n    const gate = this.gateGain;\n',
    '    this.openUntil = 0;\n    this.aboveSince = 0;\n    this.noiseFloorDb = -72;\n    this.speakingUntil = 0;\n    this.emitSpeaking(false);\n    const gate = this.gateGain;\n',
    'connect input speaking reset',
  );

  const start = noise.indexOf('  private updateGate() {');
  const end = noise.indexOf('\n  private destroyGraph(', start);
  if (start < 0 || end < 0) throw new Error('updateGate blogu bulunamadi');
  const updateGate = "  private updateGate() {\n" +
    "    const context = this.context;\n" +
    "    const analyser = this.analyser;\n" +
    "    const gateGain = this.gateGain;\n" +
    "    const samples = this.samples;\n" +
    "    if (!context || !analyser || !gateGain || !samples) return;\n\n" +
    "    analyser.getFloatTimeDomainData(samples);\n" +
    "    let sum = 0;\n" +
    "    for (let i = 0; i < samples.length; i += 1) sum += samples[i] * samples[i];\n" +
    "    const rms = Math.sqrt(sum / samples.length);\n" +
    "    const db = 20 * Math.log10(Math.max(rms, 1e-7));\n" +
    "    const now = performance.now();\n\n" +
    "    if (now > this.openUntil && db < this.thresholdDb + 8) {\n" +
    "      this.noiseFloorDb = (this.noiseFloorDb * 0.98) + (db * 0.02);\n" +
    "    }\n\n" +
    "    const adaptiveMargin = this.getEngine() === 'raw' ? 10 : 7;\n" +
    "    const effectiveOpen = Math.max(this.thresholdDb, this.noiseFloorDb + adaptiveMargin);\n" +
    "    const effectiveClose = effectiveOpen - 3;\n" +
    "    const aboveOpen = db >= effectiveOpen;\n" +
    "    const belowClose = db < effectiveClose;\n" +
    "    const minimumVoiceMs = this.thresholdDb >= -56 ? 28 : 22;\n\n" +
    "    // Local UI meter is driven by the actual processed microphone signal,\n" +
    "    // not LiveKit's server-side active-speaker event. It is intentionally\n" +
    "    // a little more sensitive than the gate and has a short visual hold.\n" +
    "    const meterThreshold = Math.max(-68, effectiveOpen - 6);\n" +
    "    if (db >= meterThreshold) this.speakingUntil = now + 180;\n" +
    "    this.emitSpeaking(now < this.speakingUntil);\n\n" +
    "    if (!this.gateEnabled) {\n" +
    "      gateGain.gain.setTargetAtTime(1, context.currentTime, 0.006);\n" +
    "      return;\n" +
    "    }\n\n" +
    "    if (aboveOpen) {\n" +
    "      if (!this.aboveSince) this.aboveSince = now;\n" +
    "      if (now - this.aboveSince >= minimumVoiceMs) {\n" +
    "        this.openUntil = now + this.holdMs;\n" +
    "        gateGain.gain.setTargetAtTime(1, context.currentTime, 0.003);\n" +
    "      }\n" +
    "    } else if (belowClose) {\n" +
    "      this.aboveSince = 0;\n" +
    "    }\n\n" +
    "    if (now > this.openUntil && belowClose) {\n" +
    "      gateGain.gain.setTargetAtTime(this.closedGain, context.currentTime, 0.09);\n" +
    "    }\n" +
    "  }\n";
  noise = noise.slice(0, start) + updateGate + noise.slice(end);

  noise = replaceOnce(
    noise,
    '    this.source = undefined;\n    this.suppressor = undefined;\n',
    '    this.emitSpeaking(false);\n    this.speakingListener = undefined;\n    this.source = undefined;\n    this.suppressor = undefined;\n',
    'destroy speaking cleanup',
  );
  fs.writeFileSync(noiseFile, noise);
}

let voice = fs.readFileSync(voiceFile, 'utf8');
if (!voice.includes('const localSpeakingRef = useRef(false);')) {
  voice = replaceOnce(
    voice,
    '  const noiseGateProcessorRef = useRef<NoiseGateProcessor | null>(null);\n',
    '  const noiseGateProcessorRef = useRef<NoiseGateProcessor | null>(null);\n  const localSpeakingRef = useRef(false);\n',
    'local speaking ref',
  );

  voice = replaceOnce(
    voice,
    '    if (track.getProcessor() !== processor) await track.setProcessor(processor);\n',
    "    processor.setSpeakingListener(speaking => {\n      localSpeakingRef.current = speaking;\n      setParticipants(previous => previous.map(person => person.local ? { ...person, speaking: speaking && !person.muted } : person));\n    });\n    if (track.getProcessor() !== processor) await track.setProcessor(processor);\n",
    'processor speaking listener',
  );

  voice = replaceOnce(
    voice,
    '      speaking: participant.isSpeaking,\n',
    '      speaking: participant.isLocal ? localSpeakingRef.current : participant.isSpeaking,\n',
    'local speaking override',
  );

  voice = replaceOnce(
    voice,
    "    if (!enabled) {\n      await room.localParticipant.setMicrophoneEnabled(false);\n      return;\n    }\n",
    "    if (!enabled) {\n      localSpeakingRef.current = false;\n      setParticipants(previous => previous.map(person => person.local ? { ...person, speaking: false } : person));\n      await room.localParticipant.setMicrophoneEnabled(false);\n      return;\n    }\n",
    'mute speaking reset',
  );

  fs.writeFileSync(voiceFile, voice);
}

console.log('\n=== ShakeChat Local Speaking Meter v3.1.1 uygulandi ===');
console.log('- Turuncu speaking indikatoru local processed mic RMS ile surulur');
console.log('- LiveKit server active-speaker gecikmesi local kullanici icin bypass edilir');
console.log('- Remote kullanicilar LiveKit isSpeaking kullanmaya devam eder');
console.log('- Mic kapaninca indikator zorla kapanir');
