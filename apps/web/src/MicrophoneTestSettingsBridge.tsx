import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { AudioProcessorOptions } from 'livekit-client';
import { Activity, Headphones, Mic } from 'lucide-react';
import { NoiseGateProcessor } from './noiseGate';
import { loadVoiceDevices } from './voiceDevicePreferences';

type MicTestSettings = {
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
  noiseGateEnabled: boolean;
  noiseGateThreshold: number;
};

type AppliedBrowserSettings = {
  echoCancellation: boolean | null;
  noiseSuppression: boolean | null;
  autoGainControl: boolean | null;
  sampleRate: number | null;
  channelCount: number | null;
};

type ListenSource = 'captured' | 'processed';

function settingCheckbox(labelText: string, fallback: boolean) {
  const list = document.querySelector('.audio-toggle-list');
  if (!list) return fallback;
  const label = Array.from(list.querySelectorAll('label.setting-toggle')).find(item => item.textContent?.includes(labelText));
  const input = label?.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
  return input ? input.checked : fallback;
}

function readSettings(): MicTestSettings {
  const threshold = document.querySelector('input[aria-label="Gate Threshold"]') as HTMLInputElement | null;
  return {
    noiseSuppression: settingCheckbox('Gürültü azaltma', true),
    echoCancellation: settingCheckbox('Yankı engelleme', true),
    autoGainControl: settingCheckbox('Otomatik kazanç', false),
    noiseGateEnabled: settingCheckbox('Ses kapısı', true),
    noiseGateThreshold: threshold ? Number(threshold.value) : -48,
  };
}

function browserSettings(track: MediaStreamTrack): AppliedBrowserSettings {
  const settings = track.getSettings() as MediaTrackSettings & Record<string, unknown>;
  const bool = (key: string) => typeof settings[key] === 'boolean' ? settings[key] as boolean : null;
  return {
    echoCancellation: bool('echoCancellation'),
    noiseSuppression: bool('noiseSuppression'),
    autoGainControl: bool('autoGainControl'),
    sampleRate: typeof settings.sampleRate === 'number' ? settings.sampleRate : null,
    channelCount: typeof settings.channelCount === 'number' ? settings.channelCount : null,
  };
}

function browserSettingLabel(value: boolean | null) {
  return value === null ? 'BİLDİRMİYOR' : value ? 'AÇIK' : 'KAPALI';
}

function meterPercent(db: number) {
  return Math.max(0, Math.min(100, ((db + 70) / 60) * 100));
}

function analyserDb(analyser: AnalyserNode, samples: Float32Array<ArrayBuffer>) {
  analyser.getFloatTimeDomainData(samples);
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) sum += samples[i] * samples[i];
  return 20 * Math.log10(Math.max(Math.sqrt(sum / samples.length), 1e-7));
}

function sameBrowserProcessing(a: MicTestSettings | null, b: MicTestSettings) {
  return !!a
    && a.echoCancellation === b.echoCancellation
    && a.noiseSuppression === b.noiseSuppression
    && a.autoGainControl === b.autoGainControl;
}

function MicrophoneTest() {
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [inputDb, setInputDb] = useState(-140);
  const [outputDb, setOutputDb] = useState(-140);
  const [gateEnabled, setGateEnabled] = useState(true);
  const [threshold, setThreshold] = useState(-48);
  const [deviceLabel, setDeviceLabel] = useState('');
  const [monitoring, setMonitoring] = useState(false);
  const [listenSource, setListenSource] = useState<ListenSource>('processed');
  const [applied, setApplied] = useState<AppliedBrowserSettings | null>(null);
  const [captureGeneration, setCaptureGeneration] = useState(0);

  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<NoiseGateProcessor | null>(null);
  const rawTrackRef = useRef<MediaStreamTrack | null>(null);
  const rawSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processedSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const meterTimerRef = useRef<number | null>(null);
  const restartTimerRef = useRef<number | null>(null);
  const monitorRef = useRef<HTMLAudioElement | null>(null);
  const captureSettingsRef = useRef<MicTestSettings | null>(null);
  const restartingRef = useRef(false);

  function closeCapture(markIdle: boolean) {
    if (meterTimerRef.current !== null) window.clearInterval(meterTimerRef.current);
    meterTimerRef.current = null;
    try { rawSourceRef.current?.disconnect(); } catch {}
    try { processedSourceRef.current?.disconnect(); } catch {}
    rawSourceRef.current = null;
    processedSourceRef.current = null;
    if (monitorRef.current) {
      monitorRef.current.pause();
      monitorRef.current.srcObject = null;
    }
    const processor = processorRef.current;
    processorRef.current = null;
    if (processor) void processor.destroy();
    for (const track of streamRef.current?.getTracks() || []) track.stop();
    streamRef.current = null;
    rawTrackRef.current = null;
    const context = contextRef.current;
    contextRef.current = null;
    if (context && context.state !== 'closed') void context.close().catch(() => undefined);
    setInputDb(-140);
    setOutputDb(-140);
    if (markIdle) {
      captureSettingsRef.current = null;
      setApplied(null);
      setActive(false);
    }
  }

  function stop() {
    if (restartTimerRef.current !== null) window.clearTimeout(restartTimerRef.current);
    restartTimerRef.current = null;
    restartingRef.current = false;
    closeCapture(true);
  }

  useEffect(() => () => stop(), []);

  useEffect(() => {
    const audio = monitorRef.current;
    const track = listenSource === 'captured' ? rawTrackRef.current : processorRef.current?.processedTrack;
    if (!audio || !track || !active || !monitoring) {
      if (audio) {
        audio.pause();
        audio.srcObject = null;
      }
      return;
    }
    audio.pause();
    audio.srcObject = new MediaStream([track]);
    audio.volume = 0.75;
    void audio.play().catch(() => undefined);
  }, [active, monitoring, listenSource, captureGeneration]);

  async function openCapture(settings: MicTestSettings) {
    const preferredDevice = loadVoiceDevices().audioinput;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 48_000,
        channelCount: 2,
        echoCancellation: settings.echoCancellation,
        noiseSuppression: settings.noiseSuppression,
        autoGainControl: settings.autoGainControl,
        ...(preferredDevice ? { deviceId: { exact: preferredDevice } } : {}),
      },
    });
    streamRef.current = stream;
    const track = stream.getAudioTracks()[0];
    if (!track) throw new Error('Mikrofon ses izi bulunamadı.');
    rawTrackRef.current = track;
    captureSettingsRef.current = settings;
    setApplied(browserSettings(track));
    setDeviceLabel(track.label || 'Varsayılan mikrofon');

    const context = new AudioContext({ sampleRate: 48_000, latencyHint: 'interactive' });
    contextRef.current = context;
    if (context.state === 'suspended') await context.resume();

    const processor = new NoiseGateProcessor(settings.noiseGateEnabled, settings.noiseGateThreshold, settings.noiseSuppression);
    processorRef.current = processor;
    await processor.init({ audioContext: context, track } as unknown as AudioProcessorOptions);
    if (!processor.processedTrack) throw new Error('İşlenmiş mikrofon izi oluşturulamadı.');

    const rawSource = context.createMediaStreamSource(new MediaStream([track]));
    const processedSource = context.createMediaStreamSource(new MediaStream([processor.processedTrack]));
    rawSourceRef.current = rawSource;
    processedSourceRef.current = processedSource;
    const rawAnalyser = context.createAnalyser();
    const processedAnalyser = context.createAnalyser();
    rawAnalyser.fftSize = 512;
    processedAnalyser.fftSize = 512;
    rawAnalyser.smoothingTimeConstant = 0.12;
    processedAnalyser.smoothingTimeConstant = 0.12;
    rawSource.connect(rawAnalyser);
    processedSource.connect(processedAnalyser);
    const rawSamples = new Float32Array(new ArrayBuffer(rawAnalyser.fftSize * Float32Array.BYTES_PER_ELEMENT));
    const processedSamples = new Float32Array(new ArrayBuffer(processedAnalyser.fftSize * Float32Array.BYTES_PER_ELEMENT));

    meterTimerRef.current = window.setInterval(() => {
      setInputDb(analyserDb(rawAnalyser, rawSamples));
      setOutputDb(analyserDb(processedAnalyser, processedSamples));
    }, 40);
    setCaptureGeneration(value => value + 1);
    setActive(true);
  }

  async function restartCapture(settings: MicTestSettings) {
    if (restartingRef.current) return;
    restartingRef.current = true;
    setBusy(true);
    setError('');
    try {
      closeCapture(false);
      await openCapture(settings);
    } catch (cause) {
      closeCapture(true);
      setError(cause instanceof Error ? cause.message : 'Mikrofon yeniden başlatılamadı.');
    } finally {
      restartingRef.current = false;
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!active) return;
    const applyLiveSettings = () => {
      const next = readSettings();
      setGateEnabled(next.noiseGateEnabled);
      setThreshold(next.noiseGateThreshold);
      processorRef.current?.setSettings(next.noiseGateEnabled, next.noiseGateThreshold, next.noiseSuppression);

      if (!sameBrowserProcessing(captureSettingsRef.current, next)) {
        if (restartTimerRef.current !== null) window.clearTimeout(restartTimerRef.current);
        restartTimerRef.current = window.setTimeout(() => {
          restartTimerRef.current = null;
          void restartCapture(readSettings());
        }, 160);
      }
    };
    document.addEventListener('input', applyLiveSettings, true);
    document.addEventListener('change', applyLiveSettings, true);
    return () => {
      document.removeEventListener('input', applyLiveSettings, true);
      document.removeEventListener('change', applyLiveSettings, true);
    };
  }, [active]);

  async function start() {
    if (busy || active) return;
    setBusy(true);
    setError('');
    try {
      const settings = readSettings();
      setGateEnabled(settings.noiseGateEnabled);
      setThreshold(settings.noiseGateThreshold);
      await openCapture(settings);
    } catch (cause) {
      closeCapture(true);
      setError(cause instanceof Error ? cause.message : 'Mikrofon testi başlatılamadı.');
    } finally {
      setBusy(false);
    }
  }

  const gateOpen = !gateEnabled || outputDb > -96;
  const requested = readSettings();
  return <div className="setting-block mic-test-card">
    <div className="setting-title"><Mic size={18}/><div><b>Mikrofon testi</b><small>Seçili mikrofonu aynı RNNoise + VAD + Noise Gate zincirinden geçirerek canlı test eder. Ses kanalına yayın yapmaz.</small></div></div>
    <div className="mic-test-toolbar">
      <button type="button" className={active?'ghost':'primary compact'} disabled={busy} onClick={()=>active?stop():void start()}>{busy?'Yeniden uygulanıyor…':active?'Testi durdur':'Mikrofon testini başlat'}</button>
      <label className="mic-monitor-toggle"><input type="checkbox" checked={monitoring} onChange={event=>setMonitoring(event.target.checked)} disabled={!active}/><Headphones size={15}/><span>Kendimi dinle</span></label>
      {deviceLabel&&<small className="mic-test-device">{deviceLabel}</small>}
    </div>

    <div className="mic-ab-row" aria-label="Dinleme kaynağı">
      <span>DİNLEME A/B</span>
      <div className="mic-ab-buttons">
        <button type="button" className={listenSource==='captured'?'selected':''} disabled={!active} onClick={()=>setListenSource('captured')}>HAM GİRİŞ</button>
        <button type="button" className={listenSource==='processed'?'selected':''} disabled={!active} onClick={()=>setListenSource('processed')}>İŞLENMİŞ</button>
      </div>
      <small>{listenSource==='captured'?'Tarayıcıdan yakalanan ses; RNNoise/VAD/Gate uygulanmadan önce.':'Karşı tarafa gidecek RNNoise + VAD + Gate çıkışı.'}</small>
    </div>

    {error&&<div className="error mic-test-error">{error}</div>}
    <div className="mic-test-meters" aria-live="polite">
      <div className="mic-meter-row"><span>Giriş</span><div className="mic-meter-track"><i style={{width:`${meterPercent(inputDb)}%`}}/></div><b>{active?`${Math.round(inputDb)} dB`:'—'}</b></div>
      <div className="mic-meter-row processed"><span>İşlenmiş</span><div className="mic-meter-track"><i style={{width:`${meterPercent(outputDb)}%`}}/></div><b>{active?`${Math.round(outputDb)} dB`:'—'}</b></div>
    </div>

    <div className="mic-test-status-grid">
      <div><small>GATE</small><b className={active&&gateOpen?'mic-status-open':'mic-status-closed'}>{!active?'Bekliyor':gateEnabled?(gateOpen?'AÇIK · ses geçiyor':'KAPALI · ses kesiliyor'):'DEVRE DIŞI'}</b></div>
      <div><small>THRESHOLD</small><b>{threshold} dB</b></div>
      <div><small>İŞLEME</small><b><Activity size={13}/>{active?' Canlı':' Hazır'}</b></div>
    </div>

    <div className="mic-browser-state">
      <div className="mic-browser-state-head"><b>TARAYICININ GERÇEKTEN UYGULADIĞI</b><small>AEC / NS / AGC değişince test capture'ı yeniden açılır. Böylece sadece checkbox değil gerçek WebRTC ayarı değişir.</small></div>
      <div className="mic-browser-state-grid">
        <div><small>YANKI (AEC)</small><b>{active&&applied?browserSettingLabel(applied.echoCancellation):'—'}</b><span>İstek: {requested.echoCancellation?'AÇIK':'KAPALI'}</span></div>
        <div><small>NOISE SUPPRESSION</small><b>{active&&applied?browserSettingLabel(applied.noiseSuppression):'—'}</b><span>İstek: {requested.noiseSuppression?'AÇIK':'KAPALI'}</span></div>
        <div><small>AUTO GAIN</small><b>{active&&applied?browserSettingLabel(applied.autoGainControl):'—'}</b><span>İstek: {requested.autoGainControl?'AÇIK':'KAPALI'}</span></div>
        <div><small>CAPTURE</small><b>{active&&applied?`${applied.sampleRate??'?'} Hz · ${applied.channelCount??'?'} ch`:'—'}</b><span>Hedef: 48000 Hz</span></div>
      </div>
    </div>

    <div className="quality-note">Yankı engellemeyi kulaklıkla kendi sesini dinlerken belirgin duymaman normaldir; hoparlör sesi mikrofona geri döndüğünde çalışır. AGC ve tarayıcı noise suppression farkını görmek için HAM GİRİŞ modunu da dene. RNNoise + VAD + Gate farkı ise İŞLENMİŞ modunda duyulur.</div>
    <audio ref={monitorRef}/>
  </div>;
}

export function MicrophoneTestSettingsBridge() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const sync = () => {
      const list = document.querySelector('.audio-toggle-list');
      const block = list?.closest('.setting-block') as HTMLElement | null;
      if (!block || !block.parentElement) {
        setHost(null);
        return;
      }
      let next = block.parentElement.querySelector(':scope > .shakechat-mic-test-host') as HTMLElement | null;
      if (!next) {
        next = document.createElement('div');
        next.className = 'shakechat-mic-test-host';
        block.insertAdjacentElement('afterend', next);
      }
      setHost(current => current === next ? current : next);
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  return host ? createPortal(<MicrophoneTest/>, host) : null;
}
