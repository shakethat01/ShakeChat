# ShakeChat Desktop Native Audio v0.1

## Hedef

ShakeChat arayüzü React olarak korunur. Tarayıcı sürümü mevcut LiveKit JS/WebAudio motorunu kullanmaya devam eder. Tauri masaüstü sürümünde ses yolu Rust tarafına alınır.

```text
Windows WASAPI mikrofon
  -> LiveKit Rust PlatformAudio
  -> native libwebrtc Audio Processing Module
     - Echo Cancellation
     - Noise Suppression
     - Automatic Gain Control
  -> Opus (DTX kapalı, RED açık, 192 kbps hedef)
  -> mevcut ShakeChat LiveKit sunucusu
```

Gelen ses de `PlatformAudio` üzerinden Windows playout cihazına gider. Böylece masaüstü ses çağrısı browser WebAudio/AudioWorklet/GTCRN yaşam döngüsüne bağlı değildir.

## Neden

Web sürümündeki GTCRN/RNNoise/custom gate hattı prototip ve fallback olarak kalır. Desktop native yolunda varsayılan olarak GTCRN ve custom JavaScript gate yoktur. Konuşma başı/ortası/sonu kesme problemini ayrı bir kazanç yamasıyla saklamak yerine native WebRTC APM kullanılmaktadır.

## Dosyalar

- `apps/desktop/`: Tauri 2 masaüstü shell.
- `apps/desktop/src-tauri/src/native_voice.rs`: native LiveKit/WASAPI ses motoru.
- `apps/web/src/useNativeVoice.ts`: React UI ile Tauri command köprüsü.
- `apps/web/src/useVoiceRuntime.ts`: browser/native engine seçimi.
- `tools/apply-desktop-native-voice-v0.1.mjs`: mevcut App.tsx üzerinde tek importluk güvenli runtime switch.
- `tools/apply-desktop-api-cors-v0.1.mjs`: Tauri originleri için Socket.IO CORS patch'i.
- `tools/deploy-desktop-backend-v0.1.sh`: VPS API build/restart runner.
- `scripts/start-desktop-windows.ps1`: Windows tek-komut launcher.

## İlk çalıştırma

VPS:

```bash
cd /opt/shake/shakechat
git pull --ff-only
bash tools/deploy-desktop-backend-v0.1.sh
```

Windows repo:

```powershell
git pull
powershell -ExecutionPolicy Bypass -File .\scripts\start-desktop-windows.ps1
```

Release EXE:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-desktop-windows.ps1 -Build
```

## v0.1 kapsamı

Native mikrofon capture/playout, AEC/NS/AGC, mute, deafen, mikrofon/hoparlör cihaz değiştirme, ses odasına native bağlanma ve katılımcı snapshot'ı vardır. Kamera ve ekran paylaşımı bu ilk native ses checkpoint'inde browser/native ayrımından sonra taşınacaktır. Kullanıcı bazlı 0-100 ara ses gain'i Rust SDK platform playout hattına ayrıca eklenecektir; 0% yerel mute davranışı korunur.

## Kabul kriteri

İki Windows istemcisi aynı odaya bağlandığında konuşma başı/sonu kesilmemeli; ses seviyesi dakikalar içinde karakter değiştirmemeli; başka kullanıcının odaya girip çıkması yerel APM zincirini yeniden kurmamalı; mute oda değişiminden bağımsız kullanıcı tercihi olarak korunmalıdır.
