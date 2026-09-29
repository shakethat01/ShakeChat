import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { AudioProcessorOptions } from 'livekit-client';
import { Activity, Headphones, Mic } from 'lucide-react';
import { NoiseGateProcessor } from './noiseGate';
import { loadVoiceDevices } from './voiceDevicePreferences';
import { acquireMicrophoneTestIsolation } from './microphoneTestIsolation';
import { isMicrophonePermissionError, microphoneErrorMessage } from './microphoneAccess';
import { MicrophoneAccessHelp } from './MicrophoneAccessHelp';

type MicTestSettings = {
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
  noiseGateEnabled: boolean;
  noiseGateThreshold: number;
};

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

function meterPercent(db: number) {
  return Math.max(0, Math.min(100, ((db + 70) / 60) * 100));
}

function analyserDb(analyser: AnalyserNode, samples: Float32Array<ArrayBuffer>) {
  analyser.getFloatTimeDomainData(samples);
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) sum += samples[i] * samples[i];
  return 20 * Math.log10(Math.max(Math.sqrt(sum / samples.length), 1e-7));
}

export function MicrophoneTest() {
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [inputDb, setInputDb] = useState(-140);
  const [outputDb, setOutputDb] = useState(-140);
  const [gateEnabled, setGateEnabled] = useState(true);
  const [threshold, setThreshold] = useState(-48);
  const [deviceLabel, setDeviceLabel] = useState('');
  const [monitoring, setMonitoring] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<NoiseGateProcessor | null>(null);
  const rawTrackRef = useRef<MediaStreamTrack | null>(null);
  const rawSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processedSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const meterTimerRef = useRef<number | null>(null);
  const monitorRef = useRef<HTMLAudioElement | null>(null);
  const operationRef = useRef(0);
  const mountedRef = useRef(true);
  const releaseIsolationRef = useRef<(() => Promise<void>) | null>(null);

  async function stop() {
    operationRef.current += 1;
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
    for (const track of streamRef.current?.getTracks() || []) track.stop();
    streamRef.current = null;
    rawTrackRef.current = null;
    const context = contextRef.current;
    contextRef.current = null;
    const release = releaseIsolationRef.current;
    releaseIsolationRef.current = null;
    if (mountedRef.current) {
      setActive(false);
      setBusy(false);
      setMonitoring(false);
      setInputDb(-140);
      setOutputDb(-140);
    }
    try {
      await processor?.destroy();
      if (context && context.state !== 'closed') await context.close();
    } catch {
      // Capture tracks and local playback were already stopped synchronously.
    } finally {
      // Resume transmission only after the local monitor and capture are gone.
      try { await release?.(); }
      catch { if (mountedRef.current) setError('Test durdu; kanaldaki sesi geri açmak için mikrofon kontrolünü kullan.'); }
    }
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; void stop(); };
  }, []);

  useEffect(() => {
    const audio = monitorRef.current;
    const processed = processorRef.current?.processedTrack;
    if (!audio || !processed || !active || !monitoring) {
      if (audio) {
        audio.pause();
        audio.srcObject = null;
      }
      return;
    }
    audio.srcObject = new MediaStream([processed]);
    audio.volume = 0.75;
    void audio.play().catch(() => undefined);
  }, [active, monitoring]);

  useEffect(() => {
    if (!active) return;
    const applyLiveSettings = () => {
      const next = readSettings();
      setGateEnabled(next.noiseGateEnabled);
      setThreshold(next.noiseGateThreshold);
      processorRef.current?.setSettings(next.noiseGateEnabled, next.noiseGateThreshold, next.noiseSuppression);
      void rawTrackRef.current?.applyConstraints({
        echoCancellation: next.echoCancellation,
        noiseSuppression: false,
        autoGainControl: next.autoGainControl,
      }).catch(() => undefined);
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
    const operation = ++operationRef.current;
    setBusy(true);
    setError('');
    setPermissionDenied(false);
    try {
      const release = await acquireMicrophoneTestIsolation();
      if (operation !== operationRef.current) { await release(); return; }
      releaseIsolationRef.current = release;
      const settings = readSettings();
      setGateEnabled(settings.noiseGateEnabled);
      setThreshold(settings.noiseGateThreshold);
      const preferredDevice = loadVoiceDevices().audioinput;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 48_000,
          channelCount: 2,
          echoCancellation: settings.echoCancellation,
          noiseSuppression: false,
          autoGainControl: settings.autoGainControl,
          ...(preferredDevice ? { deviceId: { exact: preferredDevice } } : {}),
        },
      });
      if (operation !== operationRef.current) { stream.getTracks().forEach(track => track.stop()); return; }
      streamRef.current = stream;
      const track = stream.getAudioTracks()[0];
      if (!track) throw new Error('Mikrofon ses izi bulunamadı.');
      rawTrackRef.current = track;
      setDeviceLabel(track.label || 'Varsayılan mikrofon');

      const context = new AudioContext({ sampleRate: 48_000, latencyHint: 'interactive' });
      contextRef.current = context;
      if (context.state === 'suspended') await context.resume();
      if (operation !== operationRef.current) return;

      const processor = new NoiseGateProcessor(settings.noiseGateEnabled, settings.noiseGateThreshold, settings.noiseSuppression);
      processorRef.current = processor;
      await processor.init({ audioContext: context, track } as unknown as AudioProcessorOptions);
      if (operation !== operationRef.current) return;
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
      setActive(true);
    } catch (cause) {
      if (operation === operationRef.current) {
        await stop();
        if (mountedRef.current) {
          setError(microphoneErrorMessage(cause));
          setPermissionDenied(isMicrophonePermissionError(cause));
        }
      }
    } finally {
      if (mountedRef.current && operation === operationRef.current) setBusy(false);
    }
  }

  const gateOpen = !gateEnabled || outputDb > -96;
  return <div className="setting-block mic-test-card">
    <div className="setting-title"><Mic size={18}/><div><b>Mikrofon testi</b><small>Test sırasında mikrofonun kanala gönderilmez. Kendini dinlerken sesin yayına karışmasın diye paylaşılan sistem sesi de geçici duraklatılır; görüntü devam eder.</small></div></div>
    <div className="mic-test-toolbar">
      <button type="button" className={active?'ghost':'primary compact'} disabled={busy} onClick={()=>active?void stop():void start()}>{busy?'Başlatılıyor…':active?'Testi durdur':'Mikrofon testini başlat'}</button>
      <label className="mic-monitor-toggle"><input type="checkbox" checked={monitoring} onChange={event=>setMonitoring(event.target.checked)} disabled={!active}/><Headphones size={15}/><span>Kendimi dinle</span></label>
      {deviceLabel&&<small className="mic-test-device">{deviceLabel}</small>}
    </div>
    {error&&<div className="error mic-test-error">{error}</div>}
    {permissionDenied&&<MicrophoneAccessHelp onRetry={start}/>}
    <div className="mic-test-meters" aria-live="polite">
      <div className="mic-meter-row"><span>Giriş</span><div className="mic-meter-track"><i style={{width:`${meterPercent(inputDb)}%`}}/></div><b>{active?`${Math.round(inputDb)} dB`:'—'}</b></div>
      <div className="mic-meter-row processed"><span>İşlenmiş</span><div className="mic-meter-track"><i style={{width:`${meterPercent(outputDb)}%`}}/></div><b>{active?`${Math.round(outputDb)} dB`:'—'}</b></div>
    </div>
    <div className="mic-test-status-grid">
      <div><small>GATE</small><b className={active&&gateOpen?'mic-status-open':'mic-status-closed'}>{!active?'Bekliyor':gateEnabled?(gateOpen?'AÇIK · ses geçiyor':'KAPALI · ses kesiliyor'):'DEVRE DIŞI'}</b></div>
      <div><small>THRESHOLD</small><b>{threshold} dB</b></div>
      <div><small>İŞLEME</small><b><Activity size={13}/>{active?' Canlı':' Hazır'}</b></div>
    </div>
    <div className="quality-note">Kendimi dinle seçeneğinde geri besleme olmaması için kulaklık kullan. Slider veya mikrofon işleme anahtarlarını değiştirirken test canlı olarak yeni ayarları uygular.</div>
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
