import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const files = {
  noiseGate: path.join(root, 'apps/web/src/noiseGate.ts'),
  voice: path.join(root, 'apps/web/src/useVoice.ts'),
  settings: path.join(root, 'apps/web/src/AppSettings.tsx'),
  app: path.join(root, 'apps/web/src/App.tsx'),
};

for (const [name, file] of Object.entries(files)) {
  if (!fs.existsSync(file)) throw new Error(`${name} bulunamadi: ${file}`);
}

function replaceOnce(text, from, to, label) {
  const first = text.indexOf(from);
  if (first < 0) throw new Error(`${label}: hedef bulunamadi`);
  if (text.indexOf(from, first + from.length) >= 0) throw new Error(`${label}: hedef birden fazla bulundu`);
  return text.slice(0, first) + to + text.slice(first + from.length);
}

// ---------------------------------------------------------------------------
// 1) Deterministic processor.
//    - one processing path only (no raw/AI crossfade graph)
//    - GTCRN primary, RNNoise fallback
//    - gate only cleans residual silence; AI handles keyboard during speech
//    - mono/48k to reduce CPU and channel ambiguity
// ---------------------------------------------------------------------------
const noiseGate = String.raw`import { Track } from 'livekit-client';
import type { AudioProcessorOptions, TrackProcessor } from 'livekit-client';
import gtcrnWorkletPath from '@sapphi-red/web-noise-suppressor/gtcrnWorklet.js?url';
import gtcrnWasmPath from '@sapphi-red/web-noise-suppressor/gtcrn.wasm?url';
import rnnoiseWorkletPath from '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url';
import rnnoiseWasmPath from '@sapphi-red/web-noise-suppressor/rnnoise.wasm?url';
import rnnoiseWasmSimdPath from '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url';

type SuppressorNode = AudioNode & { destroy: () => void };
type SuppressorKind = 'gtcrn' | 'rnnoise' | 'raw';
type SuppressorModule = typeof import('@sapphi-red/web-noise-suppressor');

// This constant intentionally makes engine selection deterministic for one build.
// The optional v3.0.1 comparison patch changes only this line to RNNoise-first.
const PRIMARY_ENGINE: 'gtcrn' | 'rnnoise' = 'gtcrn';

let suppressorModulePromise: Promise<SuppressorModule> | undefined;
let gtcrnBinaryPromise: Promise<ArrayBuffer> | undefined;
let rnnoiseBinaryPromise: Promise<ArrayBuffer> | undefined;
const gtcrnReadyContexts = new WeakSet<AudioContext>();
const rnnoiseReadyContexts = new WeakSet<AudioContext>();

function loadSuppressorModule() {
  if (!suppressorModulePromise) {
    suppressorModulePromise = import('@sapphi-red/web-noise-suppressor').catch(error => {
      suppressorModulePromise = undefined;
      throw error;
    });
  }
  return suppressorModulePromise;
}

async function makeGtcrn(context: AudioContext, module: SuppressorModule): Promise<SuppressorNode> {
  if (!gtcrnBinaryPromise) {
    gtcrnBinaryPromise = module.loadGtcrn({ url: gtcrnWasmPath }).catch(error => {
      gtcrnBinaryPromise = undefined;
      throw error;
    });
  }
  if (!gtcrnReadyContexts.has(context)) {
    await context.audioWorklet.addModule(gtcrnWorkletPath);
    gtcrnReadyContexts.add(context);
  }
  return new module.GtcrnWorkletNode(context, {
    wasmBinary: await gtcrnBinaryPromise,
    maxChannels: 1,
  }) as SuppressorNode;
}

async function makeRnnoise(context: AudioContext, module: SuppressorModule): Promise<SuppressorNode> {
  if (!rnnoiseBinaryPromise) {
    rnnoiseBinaryPromise = module.loadRnnoise({
      url: rnnoiseWasmPath,
      simdUrl: rnnoiseWasmSimdPath,
    }).catch(error => {
      rnnoiseBinaryPromise = undefined;
      throw error;
    });
  }
  if (!rnnoiseReadyContexts.has(context)) {
    await context.audioWorklet.addModule(rnnoiseWorkletPath);
    rnnoiseReadyContexts.add(context);
  }
  return new module.RnnoiseWorkletNode(context, {
    wasmBinary: await rnnoiseBinaryPromise,
    maxChannels: 1,
  }) as SuppressorNode;
}

async function createSuppressor(context: AudioContext): Promise<{ node: SuppressorNode; kind: Exclude<SuppressorKind, 'raw'> } | null> {
  if (context.sampleRate !== 48_000 || typeof AudioWorkletNode === 'undefined') {
    console.warn('[voice:v3] AI suppression unavailable; raw mic + gate fallback', {
      sampleRate: context.sampleRate,
      audioWorklet: typeof AudioWorkletNode !== 'undefined',
    });
    return null;
  }

  const module = await loadSuppressorModule();
  const attempts: Array<'gtcrn' | 'rnnoise'> = PRIMARY_ENGINE === 'gtcrn'
    ? ['gtcrn', 'rnnoise']
    : ['rnnoise', 'gtcrn'];

  for (const engine of attempts) {
    try {
      const node = engine === 'gtcrn'
        ? await makeGtcrn(context, module)
        : await makeRnnoise(context, module);
      console.info('[voice:v3] AI suppression ready', {
        engine: engine.toUpperCase(),
        primary: PRIMARY_ENGINE,
        sampleRate: context.sampleRate,
        channels: 1,
      });
      return { node, kind: engine };
    } catch (error) {
      console.warn(`[voice:v3] ${engine.toUpperCase()} init failed`, error);
    }
  }

  console.warn('[voice:v3] all AI engines failed; raw mic + gate fallback');
  return null;
}

export class NoiseGateProcessor implements TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> {
  readonly name = 'shakechat-stable-ai-gate-v3';
  processedTrack?: MediaStreamTrack;

  private context?: AudioContext;
  private source?: MediaStreamAudioSourceNode;
  private suppressor?: SuppressorNode;
  private suppressorKind: SuppressorKind = 'raw';
  private analyser?: AnalyserNode;
  private delay?: DelayNode;
  private gateGain?: GainNode;
  private destination?: MediaStreamAudioDestinationNode;
  private meterTimer?: number;
  private samples?: Float32Array<ArrayBuffer>;

  private aiEnabled = true;
  private gateEnabled = true;
  private thresholdDb = -60;
  private openUntil = 0;
  private aboveSince = 0;
  private noiseFloorDb = -72;

  // Gate is intentionally conservative. AI suppression does the heavy work.
  private readonly lookAheadSeconds = 0.03;
  private readonly holdMs = 240;
  private readonly closedGain = 0.00025;

  constructor(aiEnabled = true, gateEnabled = true, thresholdDb = -60) {
    this.setSettings(aiEnabled, gateEnabled, thresholdDb);
  }

  setSettings(aiEnabled: boolean, gateEnabled: boolean, thresholdDb: number) {
    this.aiEnabled = aiEnabled;
    this.gateEnabled = gateEnabled;
    this.thresholdDb = Math.max(-70, Math.min(-25, thresholdDb));
    this.aboveSince = 0;

    // These are safe live adjustments. AI-path changes become deterministic on
    // the controlled track restart performed by useVoice after Save.
    const context = this.context;
    const gate = this.gateGain;
    if (context && gate && !gateEnabled) {
      gate.gain.cancelScheduledValues(context.currentTime);
      gate.gain.setTargetAtTime(1, context.currentTime, 0.006);
    }
  }

  getEngine() {
    return this.aiEnabled ? this.suppressorKind : 'raw';
  }

  getDebugState() {
    return {
      engine: this.getEngine(),
      aiEnabled: this.aiEnabled,
      gateEnabled: this.gateEnabled,
      thresholdDb: this.thresholdDb,
      sampleRate: this.context?.sampleRate,
    };
  }

  async init(options: AudioProcessorOptions) {
    await this.build(options);
  }

  async restart(options: AudioProcessorOptions) {
    this.disconnect(false);
    await this.build(options);
  }

  async destroy() {
    this.disconnect(true);
  }

  private async build(options: AudioProcessorOptions) {
    const context = options.audioContext;
    this.context = context;

    const source = context.createMediaStreamSource(new MediaStream([options.track]));
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.08;
    const delay = context.createDelay(0.08);
    delay.delayTime.value = this.lookAheadSeconds;
    const gateGain = context.createGain();
    gateGain.gain.value = this.gateEnabled ? this.closedGain : 1;
    const destination = context.createMediaStreamDestination();

    this.source = source;
    this.analyser = analyser;
    this.delay = delay;
    this.gateGain = gateGain;
    this.destination = destination;
    this.suppressorKind = 'raw';

    let processedInput: AudioNode = source;
    if (this.aiEnabled) {
      const suppressor = await createSuppressor(context);
      if (suppressor) {
        this.suppressor = suppressor.node;
        this.suppressorKind = suppressor.kind;
        source.connect(suppressor.node);
        processedInput = suppressor.node;
      }
    }

    // Exactly one audible path reaches the destination. This removes the phase,
    // crossfade and state races that existed in the experimental v2.9 graph.
    processedInput.connect(analyser);
    processedInput.connect(delay);
    delay.connect(gateGain);
    gateGain.connect(destination);

    this.processedTrack = destination.stream.getAudioTracks()[0];
    this.samples = new Float32Array(new ArrayBuffer(analyser.fftSize * Float32Array.BYTES_PER_ELEMENT));
    this.openUntil = 0;
    this.aboveSince = 0;
    this.noiseFloorDb = -72;

    if (!this.gateEnabled) gateGain.gain.value = 1;
    this.meterTimer = window.setInterval(() => this.updateGate(), 10);

    console.info('[voice:v3] deterministic processor built', this.getDebugState());
  }

  private updateGate() {
    const context = this.context;
    const analyser = this.analyser;
    const gateGain = this.gateGain;
    const samples = this.samples;
    if (!context || !analyser || !gateGain || !samples) return;

    if (!this.gateEnabled) {
      gateGain.gain.setTargetAtTime(1, context.currentTime, 0.006);
      return;
    }

    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (let i = 0; i < samples.length; i += 1) sum += samples[i] * samples[i];
    const rms = Math.sqrt(sum / samples.length);
    const db = 20 * Math.log10(Math.max(rms, 1e-7));
    const now = performance.now();

    const gateClosed = now > this.openUntil;
    if (gateClosed && db < this.thresholdDb + 8) {
      this.noiseFloorDb = (this.noiseFloorDb * 0.98) + (db * 0.02);
    }

    // Strong profile uses -54 dB; balanced uses -60 dB. Adaptive floor stops AGC-
    // like room changes from opening the gate, even though browser AGC is disabled.
    const adaptiveMargin = this.suppressorKind === 'raw' ? 10 : 7;
    const effectiveOpen = Math.max(this.thresholdDb, this.noiseFloorDb + adaptiveMargin);
    const effectiveClose = effectiveOpen - 3;
    const aboveOpen = db >= effectiveOpen;
    const belowClose = db < effectiveClose;
    const minimumVoiceMs = this.thresholdDb >= -56 ? 32 : 24;

    if (aboveOpen) {
      if (!this.aboveSince) this.aboveSince = now;
      if (now - this.aboveSince >= minimumVoiceMs) {
        this.openUntil = now + this.holdMs;
        gateGain.gain.setTargetAtTime(1, context.currentTime, 0.003);
      }
    } else if (belowClose) {
      this.aboveSince = 0;
    }

    if (now > this.openUntil && belowClose) {
      gateGain.gain.setTargetAtTime(this.closedGain, context.currentTime, 0.09);
    }
  }

  private disconnect(stopOutput: boolean) {
    if (this.meterTimer !== undefined) window.clearInterval(this.meterTimer);
    this.meterTimer = undefined;

    try { this.source?.disconnect(); } catch {}
    try { this.suppressor?.destroy(); } catch {}
    try { this.suppressor?.disconnect(); } catch {}
    try { this.analyser?.disconnect(); } catch {}
    try { this.delay?.disconnect(); } catch {}
    try { this.gateGain?.disconnect(); } catch {}

    if (stopOutput) {
      try { this.processedTrack?.stop(); } catch {}
    }

    this.source = undefined;
    this.suppressor = undefined;
    this.suppressorKind = 'raw';
    this.analyser = undefined;
    this.delay = undefined;
    this.gateGain = undefined;
    this.destination = undefined;
    this.samples = undefined;
    if (stopOutput) this.processedTrack = undefined;
  }
}
`;
fs.writeFileSync(files.noiseGate, noiseGate);

// ---------------------------------------------------------------------------
// 2) useVoice: stop live applyConstraints churn. Preferences are applied only
//    after Save through one controlled MediaStreamTrack restart.
// ---------------------------------------------------------------------------
let voice = fs.readFileSync(files.voice, 'utf8');
const voiceStart = voice.indexOf('  const microphoneCaptureOptions = useCallback');
const voiceEnd = voice.indexOf('  const syncParticipants = useCallback', voiceStart);
if (voiceStart < 0 || voiceEnd < 0) throw new Error('useVoice mikrofon blogu bulunamadi');

const voiceBlock = String.raw`  const processingSignature = [
    preferences.aiNoiseSuppression ? 'ai1' : 'ai0',
    preferences.noiseGateEnabled ? 'gate1' : 'gate0',
    Math.round(preferences.noiseGateThreshold),
    preferences.echoCancellation ? 'echo1' : 'echo0',
  ].join('|');

  const microphoneCaptureOptions = useCallback((deviceId?: string) => ({
    sampleRate: 48_000,
    channelCount: 1,
    echoCancellation: preferences.echoCancellation,
    // Dedicated GTCRN/RNNoise processing owns background-noise suppression.
    noiseSuppression: false,
    // AGC can raise keyboard remnants between words; keep it deterministic/off.
    autoGainControl: false,
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
  }), [preferences.echoCancellation]);

  const applyMicrophoneTuning = useCallback(async (room: Room, publication?: LocalTrackPublication) => {
    const activePublication = publication ?? room.localParticipant.getTrackPublication(Track.Source.Microphone) as LocalTrackPublication | undefined;
    const track = activePublication?.track;
    if (!(track instanceof LocalAudioTrack)) return;

    let processor = noiseGateProcessorRef.current;
    if (!processor) {
      processor = new NoiseGateProcessor(
        preferences.aiNoiseSuppression,
        preferences.noiseGateEnabled,
        preferences.noiseGateThreshold,
      );
      noiseGateProcessorRef.current = processor;
    } else {
      processor.setSettings(
        preferences.aiNoiseSuppression,
        preferences.noiseGateEnabled,
        preferences.noiseGateThreshold,
      );
    }

    if (track.getProcessor() !== processor) await track.setProcessor(processor);
    console.info('[voice:v3] stable microphone processor attached', {
      signature: processingSignature,
      ...processor.getDebugState(),
      actualTrack: track.mediaStreamTrack.getSettings?.(),
      maxBitrate: 192_000,
      priority: 'high',
    });
  }, [
    preferences.aiNoiseSuppression,
    preferences.noiseGateEnabled,
    preferences.noiseGateThreshold,
    processingSignature,
  ]);

  const setMicrophone = useCallback(async (room: Room, enabled: boolean, deviceId?: string) => {
    if (!enabled) {
      await room.localParticipant.setMicrophoneEnabled(false);
      return;
    }
    const publication = await room.localParticipant.setMicrophoneEnabled(
      true,
      microphoneCaptureOptions(deviceId),
      MICROPHONE_PUBLISH_OPTIONS,
    );
    if (publication) await applyMicrophoneTuning(room, publication);
  }, [applyMicrophoneTuning, microphoneCaptureOptions]);

  // Saved media settings are applied exactly once through a controlled capture
  // restart. No slider/toggle causes repeated processor rebuilds while speaking.
  useEffect(() => {
    const room = roomRef.current;
    if (!room) return;
    const publication = room.localParticipant.getTrackPublication(Track.Source.Microphone) as LocalTrackPublication | undefined;
    const track = publication?.track;
    if (!(track instanceof LocalAudioTrack)) return;

    const processor = noiseGateProcessorRef.current;
    processor?.setSettings(
      preferences.aiNoiseSuppression,
      preferences.noiseGateEnabled,
      preferences.noiseGateThreshold,
    );

    let cancelled = false;
    const wasMuted = publication?.isMuted ?? true;
    void (async () => {
      try {
        await track.restartTrack(microphoneCaptureOptions(inputDeviceId || undefined));
        if (cancelled) return;
        await applyMicrophoneTuning(room, publication);
        if (wasMuted && publication && !publication.isMuted) await publication.mute();
        console.info('[voice:v3] saved profile applied after one controlled restart', {
          signature: processingSignature,
          actualTrack: track.mediaStreamTrack.getSettings?.(),
        });
      } catch (error) {
        console.warn('[voice:v3] controlled microphone restart failed', {
          signature: processingSignature,
          error,
        });
      }
    })();

    return () => { cancelled = true; };
    // Intentionally keyed only by the persisted processing signature. Device
    // switching has its own explicit restart path below.
  }, [processingSignature]);

`;
voice = voice.slice(0, voiceStart) + voiceBlock + voice.slice(voiceEnd);

const oldDefaults = `        audioCaptureDefaults: {\n          sampleRate: 48_000,\n          channelCount: 2,\n          echoCancellation: preferences.echoCancellation,\n          noiseSuppression: preferences.noiseSuppression,\n          autoGainControl: preferences.autoGainControl,\n        },`;
const newDefaults = `        audioCaptureDefaults: {\n          sampleRate: 48_000,\n          channelCount: 1,\n          echoCancellation: preferences.echoCancellation,\n          noiseSuppression: false,\n          autoGainControl: false,\n        },`;
if (voice.includes(oldDefaults)) {
  voice = voice.replace(oldDefaults, newDefaults);
} else if (!voice.includes(newDefaults)) {
  throw new Error('Room audioCaptureDefaults hedefi bulunamadi');
}
fs.writeFileSync(files.voice, voice);

// ---------------------------------------------------------------------------
// 3) Settings UI: remove experimental live preview controls. Keep only three
//    predictable profiles + echo cancellation. Save causes one controlled restart.
// ---------------------------------------------------------------------------
let settings = fs.readFileSync(files.settings, 'utf8');

settings = settings.replace(
  'export function AppSettingsModal({user,preferences,onClose,onSave,onPreview,onSessionRenewed,onNotice}:{',
  'export function AppSettingsModal({user,preferences,onClose,onSave,onSessionRenewed,onNotice}:{',
);
settings = settings.replace(
  '  onSave:(preferences:AppPreferences)=>void;\n  onPreview:(preferences:AppPreferences)=>void;\n  onSessionRenewed:(token:string,user:User)=>void;\n',
  '  onSave:(preferences:AppPreferences)=>void;\n  onSessionRenewed:(token:string,user:User)=>void;\n',
);
settings = settings.replace('  const initialPreferences=useRef<AppPreferences>(preferences);\n', '');

const previewHelpers = `\n  function previewMedia(next:AppPreferences){\n    setDraft(next);\n    onPreview(next);\n  }\n\n  function cancelAndClose(){\n    onPreview(initialPreferences.current);\n    onClose();\n  }\n`;
settings = settings.replace(previewHelpers, '\n');
settings = settings.replace('onCancel={e=>{e.preventDefault();cancelAndClose()}}', 'onCancel={e=>{e.preventDefault();onClose()}}');
settings = settings.replace('aria-label="Kapat" onClick={cancelAndClose}', 'aria-label="Kapat" onClick={onClose}');
settings = settings.replace('<button type="button" className="ghost" onClick={cancelAndClose}>Vazgeç</button>', '<button type="button" className="ghost" onClick={onClose}>Vazgeç</button>');

if (!settings.includes('function setVoiceProcessingProfile')) {
  const titleLine = "  const title=tab==='account'?'Hesap ve oturum güvenliği':tab==='privacy'?'Gizlilik tercihleri':tab==='appearance'?'Görünüm ve kullanım':'Ses ve görüntü kalitesi';\n";
  const helper = String.raw`  const voiceProcessingProfile: 'off'|'balanced'|'strong' = !draft.aiNoiseSuppression
    ? 'off'
    : (draft.noiseGateEnabled && draft.noiseGateThreshold >= -56 ? 'strong' : 'balanced');

  function setVoiceProcessingProfile(profile:'off'|'balanced'|'strong'){
    setDraft(previous => profile === 'off'
      ? {...previous,aiNoiseSuppression:false,noiseGateEnabled:false,noiseGateThreshold:-60,noiseSuppression:false,autoGainControl:false}
      : profile === 'strong'
        ? {...previous,aiNoiseSuppression:true,noiseGateEnabled:true,noiseGateThreshold:-54,noiseSuppression:false,autoGainControl:false}
        : {...previous,aiNoiseSuppression:true,noiseGateEnabled:true,noiseGateThreshold:-60,noiseSuppression:false,autoGainControl:false});
  }

`;
  settings = replaceOnce(settings, titleLine, titleLine + helper, 'voice profile helper');
}

const settingsStartNeedle = '          <div className="setting-block"><div className="setting-title"><AudioLines size={18}/><div><b>Mikrofon işleme</b>';
const settingsStart = settings.indexOf(settingsStartNeedle);
const settingsEnd = settings.indexOf('\n        </>}\n\n        {(tab===', settingsStart);
if (settingsStart < 0 || settingsEnd < 0) throw new Error('AppSettings mikrofon blogu bulunamadi');

const settingsBlock = String.raw`          <div className="setting-block"><div className="setting-title"><AudioLines size={18}/><div><b>Mikrofon işleme</b><small>Stabilite modu: tek AI yolu, sabit 48 kHz mono ve kontrollü yeniden başlatma.</small></div></div><div className="audio-toggle-list">
            <div className="setting-title"><div><b>Ses temizleme profili</b><small>Teknik anahtarlar yerine tutarlı üç profil kullanılır.</small></div></div>
            <div className="segmented voice-input-mode">
              <button type="button" className={voiceProcessingProfile==='off'?'selected':''} onClick={()=>setVoiceProcessingProfile('off')}>Kapalı</button>
              <button type="button" className={voiceProcessingProfile==='balanced'?'selected':''} onClick={()=>setVoiceProcessingProfile('balanced')}>Dengeli</button>
              <button type="button" className={voiceProcessingProfile==='strong'?'selected':''} onClick={()=>setVoiceProcessingProfile('strong')}>Güçlü</button>
            </div>
            <div className="quality-note"><b>Dengeli:</b> GTCRN (RNNoise fallback) + hafif gate (-60 dB). <b>Güçlü:</b> aynı AI temizleme + daha sıkı gate (-54 dB). Konuşurken klavyeyi AI temizler; gate yalnız sessizlikte kalan artığı toplar.</div>
            <label className="setting-toggle"><span><b>Yankı engelleme</b><small>Hoparlörden mikrofona dönen sesi WebRTC tarafında azaltır. Kulaklıkta açık kalması genellikle sorun çıkarmaz.</small></span><input type="checkbox" checked={draft.echoCancellation} onChange={e=>setDraft(p=>({...p,echoCancellation:e.target.checked}))}/><i/></label>
            <div className="quality-note">Tarayıcı gürültü azaltma ve otomatik kazanç bu modda kapalı tutulur. Değişiklikler <b>Ayarları kaydet</b> dediğinde aktif mikrofona tek bir kontrollü restart ile uygulanır; ayar penceresinde oynarken ses zinciri yeniden kurulmaz.</div>
          </div></div>`;
settings = settings.slice(0, settingsStart) + settingsBlock + settings.slice(settingsEnd);
fs.writeFileSync(files.settings, settings);

// ---------------------------------------------------------------------------
// 4) App: remove v2.9.1 live-preview plumbing if it exists.
// ---------------------------------------------------------------------------
let app = fs.readFileSync(files.app, 'utf8');
app = app.replace(' onPreview={next=>setPreferences(next)}', '');
fs.writeFileSync(files.app, app);

console.log('\n=== ShakeChat Audio Stability v3.0 uygulandi ===');
console.log('- Tek audible path: GTCRN -> gate -> LiveKit');
console.log('- GTCRN init olmazsa RNNoise fallback');
console.log('- 48 kHz / mono / AGC kapali / browser NS kapali');
console.log('- Live toggle/rebuild kaldirildi');
console.log('- Kapali / Dengeli / Guclu profilleri eklendi');
console.log('- Kaydet sonrasi aktif mic yalnizca bir kez kontrollu restart olur');
console.log('\nSiradaki adim: node tools/verify-audio-stability-v3.0.mjs');
