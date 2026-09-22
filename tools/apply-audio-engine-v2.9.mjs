import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const files = {
  preferences: path.join(root, 'apps/web/src/preferences.ts'),
  noiseGate: path.join(root, 'apps/web/src/noiseGate.ts'),
  settings: path.join(root, 'apps/web/src/AppSettings.tsx'),
  voice: path.join(root, 'apps/web/src/useVoice.ts'),
};

for (const [name, file] of Object.entries(files)) {
  if (!fs.existsSync(file)) throw new Error(`${name} bulunamadı: ${file}`);
}

function replaceOnce(text, from, to, label) {
  const first = text.indexOf(from);
  if (first < 0) throw new Error(`${label}: hedef bulunamadı`);
  if (text.indexOf(from, first + from.length) >= 0) throw new Error(`${label}: hedef birden fazla bulundu`);
  return text.slice(0, first) + to + text.slice(first + from.length);
}

let preferences = fs.readFileSync(files.preferences, 'utf8');
if (!preferences.includes('aiNoiseSuppression: boolean;')) {
  preferences = replaceOnce(
    preferences,
    '  noiseSuppression: boolean;\n  autoGainControl: boolean;\n',
    '  noiseSuppression: boolean;\n  aiNoiseSuppression: boolean;\n  autoGainControl: boolean;\n',
    'preferences type',
  );

  preferences = replaceOnce(
    preferences,
    '  noiseSuppression: true,\n  autoGainControl: true,\n',
    '  noiseSuppression: false,\n  aiNoiseSuppression: true,\n  autoGainControl: false,\n',
    'preferences defaults',
  );

  preferences = replaceOnce(
    preferences,
    "      noiseSuppression: typeof parsed.noiseSuppression === 'boolean' ? parsed.noiseSuppression : DEFAULT_PREFERENCES.noiseSuppression,\n      autoGainControl: typeof parsed.autoGainControl === 'boolean' ? parsed.autoGainControl : DEFAULT_PREFERENCES.autoGainControl,\n",
    "      // The legacy browser noise suppressor is intentionally disabled when the\n      // dedicated on-device AI pipeline is available. Old preference records did\n      // not have aiNoiseSuppression, so they migrate to AI on + AGC off.\n      noiseSuppression: false,\n      aiNoiseSuppression: typeof parsed.aiNoiseSuppression === 'boolean' ? parsed.aiNoiseSuppression : DEFAULT_PREFERENCES.aiNoiseSuppression,\n      autoGainControl: typeof parsed.aiNoiseSuppression === 'boolean' && typeof parsed.autoGainControl === 'boolean' ? parsed.autoGainControl : false,\n",
    'preferences migration',
  );
}
fs.writeFileSync(files.preferences, preferences);

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

async function createSuppressor(context: AudioContext): Promise<{ node: SuppressorNode; kind: Exclude<SuppressorKind, 'raw'> } | null> {
  if (context.sampleRate !== 48_000 || typeof AudioWorkletNode === 'undefined') {
    console.warn('[voice] AI suppression skipped: 48 kHz AudioWorklet context unavailable', {
      sampleRate: context.sampleRate,
      audioWorklet: typeof AudioWorkletNode !== 'undefined',
    });
    return null;
  }

  const module = await loadSuppressorModule();

  try {
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
    const node = new module.GtcrnWorkletNode(context, {
      wasmBinary: await gtcrnBinaryPromise,
      maxChannels: 2,
    }) as SuppressorNode;
    console.info('[voice] AI suppression ready', { engine: 'GTCRN', sampleRate: context.sampleRate });
    return { node, kind: 'gtcrn' };
  } catch (error) {
    console.warn('[voice] GTCRN unavailable, trying RNNoise fallback', error);
  }

  try {
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
    const node = new module.RnnoiseWorkletNode(context, {
      wasmBinary: await rnnoiseBinaryPromise,
      maxChannels: 2,
    }) as SuppressorNode;
    console.info('[voice] AI suppression ready', { engine: 'RNNoise fallback', sampleRate: context.sampleRate });
    return { node, kind: 'rnnoise' };
  } catch (error) {
    console.warn('[voice] RNNoise unavailable, falling back to raw mic + gate', error);
    return null;
  }
}

export class NoiseGateProcessor implements TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> {
  readonly name = 'shakechat-ai-noise-gate';
  processedTrack?: MediaStreamTrack;

  private context?: AudioContext;
  private source?: MediaStreamAudioSourceNode;
  private suppressor?: SuppressorNode;
  private suppressorKind: SuppressorKind = 'raw';
  private aiGain?: GainNode;
  private rawGain?: GainNode;
  private mix?: GainNode;
  private analyser?: AnalyserNode;
  private delay?: DelayNode;
  private gateGain?: GainNode;
  private destination?: MediaStreamAudioDestinationNode;
  private meterTimer?: number;
  private samples?: Float32Array<ArrayBuffer>;

  private aiEnabled = true;
  private gateEnabled = true;
  private thresholdDb = -48;
  private openUntil = 0;
  private aboveSince = 0;
  private noiseFloorDb = -70;

  private readonly lookAheadSeconds = 0.045;
  private readonly minimumVoiceMs = 28;
  private readonly holdMs = 220;
  private readonly closedGain = 0.001;

  constructor(aiEnabled = true, gateEnabled = true, thresholdDb = -48) {
    this.setSettings(aiEnabled, gateEnabled, thresholdDb);
  }

  setSettings(aiEnabled: boolean, gateEnabled: boolean, thresholdDb: number) {
    this.aiEnabled = aiEnabled;
    this.gateEnabled = gateEnabled;
    this.thresholdDb = Math.max(-70, Math.min(-25, thresholdDb));
    this.aboveSince = 0;
    this.applyRoutingState();
  }

  getEngine() {
    return this.aiEnabled ? this.suppressorKind : 'raw';
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
    const aiGain = context.createGain();
    const rawGain = context.createGain();
    const mix = context.createGain();
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.1;
    const delay = context.createDelay(0.1);
    delay.delayTime.value = this.lookAheadSeconds;
    const gateGain = context.createGain();
    const destination = context.createMediaStreamDestination();

    this.source = source;
    this.aiGain = aiGain;
    this.rawGain = rawGain;
    this.mix = mix;
    this.analyser = analyser;
    this.delay = delay;
    this.gateGain = gateGain;
    this.destination = destination;

    const suppressor = await createSuppressor(context);
    if (suppressor) {
      this.suppressor = suppressor.node;
      this.suppressorKind = suppressor.kind;
      source.connect(suppressor.node);
      suppressor.node.connect(aiGain);
    } else {
      this.suppressor = undefined;
      this.suppressorKind = 'raw';
      source.connect(aiGain);
    }

    source.connect(rawGain);
    aiGain.connect(mix);
    rawGain.connect(mix);
    mix.connect(analyser);
    mix.connect(delay);
    delay.connect(gateGain);
    gateGain.connect(destination);

    this.processedTrack = destination.stream.getAudioTracks()[0];
    this.samples = new Float32Array(new ArrayBuffer(analyser.fftSize * Float32Array.BYTES_PER_ELEMENT));
    this.openUntil = 0;
    this.aboveSince = 0;
    this.noiseFloorDb = -70;
    this.applyRoutingState();
    this.meterTimer = window.setInterval(() => this.updateGate(), 10);
  }

  private applyRoutingState() {
    const context = this.context;
    const aiGain = this.aiGain;
    const rawGain = this.rawGain;
    const gateGain = this.gateGain;
    if (!context || !aiGain || !rawGain || !gateGain) return;

    const useAiPath = this.aiEnabled && this.suppressorKind !== 'raw';
    aiGain.gain.cancelScheduledValues(context.currentTime);
    rawGain.gain.cancelScheduledValues(context.currentTime);
    gateGain.gain.cancelScheduledValues(context.currentTime);
    aiGain.gain.setTargetAtTime(useAiPath ? 1 : 0, context.currentTime, 0.008);
    rawGain.gain.setTargetAtTime(useAiPath ? 0 : 1, context.currentTime, 0.008);

    if (!this.gateEnabled) {
      gateGain.gain.setTargetAtTime(1, context.currentTime, 0.008);
    } else if (performance.now() > this.openUntil) {
      gateGain.gain.setTargetAtTime(this.closedGain, context.currentTime, 0.008);
    }
  }

  private updateGate() {
    const context = this.context;
    const analyser = this.analyser;
    const gateGain = this.gateGain;
    const samples = this.samples;
    if (!context || !analyser || !gateGain || !samples) return;

    if (!this.gateEnabled) {
      gateGain.gain.setTargetAtTime(1, context.currentTime, 0.008);
      return;
    }

    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (let i = 0; i < samples.length; i += 1) sum += samples[i] * samples[i];
    const rms = Math.sqrt(sum / samples.length);
    const db = 20 * Math.log10(Math.max(rms, 1e-7));
    const now = performance.now();

    if (now > this.openUntil && db < this.thresholdDb + 6) {
      this.noiseFloorDb = (this.noiseFloorDb * 0.97) + (db * 0.03);
    }

    const adaptiveMargin = this.aiEnabled && this.suppressorKind !== 'raw' ? 8 : 10;
    const effectiveThreshold = Math.max(this.thresholdDb, this.noiseFloorDb + adaptiveMargin);
    const above = db >= effectiveThreshold;

    if (above) {
      if (!this.aboveSince) this.aboveSince = now;
      if (now - this.aboveSince >= this.minimumVoiceMs) {
        this.openUntil = now + this.holdMs;
        gateGain.gain.setTargetAtTime(1, context.currentTime, 0.004);
      }
    } else {
      this.aboveSince = 0;
    }

    if (now > this.openUntil && !above) {
      gateGain.gain.setTargetAtTime(this.closedGain, context.currentTime, 0.11);
    }
  }

  private disconnect(stopOutput: boolean) {
    if (this.meterTimer !== undefined) window.clearInterval(this.meterTimer);
    this.meterTimer = undefined;
    try { this.source?.disconnect(); } catch {}
    try { this.suppressor?.destroy(); } catch {}
    try { this.suppressor?.disconnect(); } catch {}
    try { this.aiGain?.disconnect(); } catch {}
    try { this.rawGain?.disconnect(); } catch {}
    try { this.mix?.disconnect(); } catch {}
    try { this.analyser?.disconnect(); } catch {}
    try { this.delay?.disconnect(); } catch {}
    try { this.gateGain?.disconnect(); } catch {}

    if (stopOutput) {
      try { this.processedTrack?.stop(); } catch {}
    }

    this.source = undefined;
    this.suppressor = undefined;
    this.suppressorKind = 'raw';
    this.aiGain = undefined;
    this.rawGain = undefined;
    this.mix = undefined;
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

let voice = fs.readFileSync(files.voice, 'utf8');
const voiceStart = voice.indexOf('  const microphoneCaptureOptions = useCallback');
const voiceEnd = voice.indexOf('  const syncParticipants = useCallback', voiceStart);
if (voiceStart < 0 || voiceEnd < 0) throw new Error('useVoice mikrofon ayar bloğu bulunamadı');
const voiceBlock = String.raw`  const microphoneCaptureOptions = useCallback((deviceId?: string) => ({
    sampleRate: 48_000,
    channelCount: 2,
    echoCancellation: preferences.echoCancellation,
    // Browser NS is kept off so it does not fight the dedicated GTCRN/RNNoise path.
    noiseSuppression: false,
    autoGainControl: preferences.autoGainControl,
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
  }), [preferences.autoGainControl, preferences.echoCancellation]);

  const applyMicrophoneTuning = useCallback(async (room: Room, publication?: LocalTrackPublication) => {
    const activePublication = publication ?? room.localParticipant.getTrackPublication(Track.Source.Microphone) as LocalTrackPublication | undefined;
    const track = activePublication?.track;
    if (!(track instanceof LocalAudioTrack)) return;

    const constraints = {
      echoCancellation: preferences.echoCancellation,
      noiseSuppression: false,
      autoGainControl: preferences.autoGainControl,
    };
    try {
      await track.applyConstraints(constraints);
      console.info('[voice] live microphone constraints applied', constraints);
    } catch (error) {
      console.warn('[voice] microphone constraints could not be fully applied', { constraints, error });
    }

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

    if (track.getProcessor()?.name !== processor.name) await track.setProcessor(processor);
    console.info('[voice] microphone processing applied', {
      aiNoiseSuppression: preferences.aiNoiseSuppression,
      aiEngine: processor.getEngine(),
      noiseGateEnabled: preferences.noiseGateEnabled,
      noiseGateThreshold: preferences.noiseGateThreshold,
      echoCancellation: preferences.echoCancellation,
      autoGainControl: preferences.autoGainControl,
      maxBitrate: 192_000,
      priority: 'high',
    });
  }, [
    preferences.aiNoiseSuppression,
    preferences.autoGainControl,
    preferences.echoCancellation,
    preferences.noiseGateEnabled,
    preferences.noiseGateThreshold,
  ]);

  const setMicrophone = useCallback(async (room: Room, enabled: boolean, deviceId?: string) => {
    if (!enabled) {
      await room.localParticipant.setMicrophoneEnabled(false);
      return;
    }
    const publication = await room.localParticipant.setMicrophoneEnabled(true, microphoneCaptureOptions(deviceId), MICROPHONE_PUBLISH_OPTIONS);
    if (publication) await applyMicrophoneTuning(room, publication);
  }, [applyMicrophoneTuning, microphoneCaptureOptions]);

  // Media preferences are live controls: saving the settings while connected
  // immediately reconfigures the active microphone instead of requiring rejoin.
  useEffect(() => {
    const room = roomRef.current;
    if (!room || status === 'disconnected') return;
    const publication = room.localParticipant.getTrackPublication(Track.Source.Microphone) as LocalTrackPublication | undefined;
    if (!publication?.track) return;
    void applyMicrophoneTuning(room, publication);
  }, [applyMicrophoneTuning, status]);

`;
voice = voice.slice(0, voiceStart) + voiceBlock + voice.slice(voiceEnd);
fs.writeFileSync(files.voice, voice);

let settings = fs.readFileSync(files.settings, 'utf8');
const settingsStartNeedle = '          <div className="setting-block"><div className="setting-title"><AudioLines size={18}/><div><b>Mikrofon işleme</b>';
const settingsStart = settings.indexOf(settingsStartNeedle);
const settingsEnd = settings.indexOf('\n        </>}\n\n        {(tab===', settingsStart);
if (settingsStart < 0 || settingsEnd < 0) throw new Error('AppSettings mikrofon işleme bloğu bulunamadı');
const settingsBlock = String.raw`          <div className="setting-block"><div className="setting-title"><AudioLines size={18}/><div><b>Mikrofon işleme</b><small>AI temizleme cihazında çalışır; ayarlar ses kanalındayken de canlı uygulanır.</small></div></div><div className="audio-toggle-list">
            <label className="setting-toggle"><span><b>AI Gürültü Engelleme</b><small>Konuşurken bile klavye, fan ve oda sesini ayırmaya çalışır. Önce GTCRN, gerekirse RNNoise fallback kullanılır.</small></span><input type="checkbox" checked={draft.aiNoiseSuppression} onChange={e=>setDraft(p=>({...p,aiNoiseSuppression:e.target.checked}))}/><i/></label>
            <label className="setting-toggle"><span><b>Yankı engelleme</b><small>Hoparlörden mikrofona geri dönen sesi WebRTC tarafında azaltır.</small></span><input type="checkbox" checked={draft.echoCancellation} onChange={e=>setDraft(p=>({...p,echoCancellation:e.target.checked}))}/><i/></label>
            <label className="setting-toggle"><span><b>Otomatik kazanç</b><small>Varsayılan kapalıdır. Sesin çok düşük/yüksek değişiyorsa aç; klavye artıklarını da yükseltebilir.</small></span><input type="checkbox" checked={draft.autoGainControl} onChange={e=>setDraft(p=>({...p,autoGainControl:e.target.checked}))}/><i/></label>
            <label className="setting-toggle"><span><b>Noise Gate</b><small>Yalnızca konuşmadığın anlarda kalan minik tık ve oda artıklarını keser.</small></span><input type="checkbox" checked={draft.noiseGateEnabled} onChange={e=>setDraft(p=>({...p,noiseGateEnabled:e.target.checked}))}/><i/></label>
            <label className="privacy-select">GATE THRESHOLD · {draft.noiseGateThreshold} dB<input aria-label="Gate Threshold" type="range" min="-70" max="-25" step="1" value={draft.noiseGateThreshold} disabled={!draft.noiseGateEnabled} onChange={e=>setDraft(p=>({...p,noiseGateThreshold:Number(e.target.value)}))}/><small>Daha sağa = daha agresif. Bu ayar yalnızca gate'i etkiler; konuşurken klavyeyi AI Gürültü Engelleme temizler.</small></label>
          </div></div>`;
settings = settings.slice(0, settingsStart) + settingsBlock + settings.slice(settingsEnd);
fs.writeFileSync(files.settings, settings);

console.log('\n=== ShakeChat AI Audio Engine v2.9 uygulandı ===');
console.log('- GTCRN birincil AI suppression');
console.log('- RNNoise fallback');
console.log('- Noise Gate ayrı ve bağımsız');
console.log('- Browser noise suppression devre dışı');
console.log('- AGC eski ayarlarda kapalıya migrate olur');
console.log('- Echo / AGC / AI / Gate ayarları canlı mikrofona uygulanır');
console.log('\nŞimdi: npm run typecheck');
