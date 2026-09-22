# ShakeChat Audio Stability v3.1

Bu tur yeni ozellik eklemek yerine mikrofon zincirini deterministik ve uzun sure stabil hale getirmeye odaklanir.

## Bulunan ana problemler

1. v2.9.1 ayar onizlemesi, ayar penceresindeki her toggle/slider degisiminde uygulama `preferences` state'ini degistiriyor ve aktif mikrofon isleme zincirini yeniden ayarlayabiliyordu.
2. `useVoice.ts` icinde mikrofon tuning icin iki ayri effect yolu olusmustu. Ayni tercih degisiminde birden fazla tuning islemi tetiklenebiliyordu.
3. LiveKit 2.22.x bir `TrackProcessor` restart ederken yeni track'i verir fakat `audioContext` alanini tekrar gondermez. Processor restart sirasinda ilk init'teki AudioContext'i korumali.
4. Deneysel v2.9 graph'inda AI ve raw yollar icin paralel gain/mix yapisi vardi. v3 tek audible path kullanir.
5. `@sapphi-red/web-noise-suppressor` 0.4.0'da destroy edilmis worklet processor'larinin yasam dongusu ile ilgili upstream duzeltme sonradan yapildi. v3.1 normal mic/device restartlarinda AI worklet'i yok edip yeniden yaratmak yerine ayni worklet ve ayni output track'i yeniden kullanir.
6. Browser noise suppression + AGC + harici AI suppressor ayni anda calistiginda artefakt ve seviye pompalamasi riski artar. Stabil profil bunlari kapali tutar; echo cancellation ayri kalir.

## v3.1 zinciri

`Mic capture 48 kHz mono -> WebRTC Echo Cancellation -> GTCRN (RNNoise fallback) -> hafif residual gate -> Opus -> LiveKit`

- GTCRN birincil motor.
- GTCRN initialize edilemezse RNNoise fallback.
- Browser `noiseSuppression` kapali.
- Browser `autoGainControl` kapali.
- Gate konusurken klavye temizlemek icin degil, sessizlikte AI'dan kalan minik tiklari toplamak icin kullanilir.
- `Dengeli`: gate -60 dB.
- `Guclu`: gate -54 dB.
- Ayarlar canli slider gibi processor rebuild yapmaz. `Ayarlari kaydet` sonrasi bir kontrollu input-track restart uygulanir.
- Processor output MediaStreamTrack ve AI worklet normal restartlarda yeniden kullanilir.

## Sabah uygulanacak ana komut

```bash
cd /opt/shake/shakechat
git pull
bash tools/run-audio-stability-v3.0.sh
```

Runner otomatik olarak:

1. mevcut 4 ses/arayuz dosyasini `/opt/shake/backups/` altina yedekler,
2. stabilite patch'ini uygular,
3. duplicate runtime effect'i temizler,
4. worklet reuse v3.1'i uygular,
5. statik verify calistirir,
6. `git diff --check` calistirir,
7. typecheck calistirir,
8. production build ve tum testleri calistirir.

Herhangi bir adim hata verirse kaynak dosyalari otomatik geri yukler ve onceki web build'ini yeniden kurmaya calisir.

## Gercek kullanim kabul testi

### A. Ham referans

- Profil `Kapali`.
- 20-30 saniye normal konus.
- Sessizlikte klavye yaz.
- Konusurken hizli klavye yaz.
- Bu kayit/dinleme AI'nin gercek farkini anlamak icin referanstir.

### B. Dengeli

- Profil `Dengeli` ve Kaydet.
- Sessizlikte klavye: minik tiklar mumkun oldugunca yok olmali.
- Konusurken klavye: klavye belirgin sekilde geride kalmali; kelime baslari kesilmemeli.
- 30-50 cm uzaktan normal sesle konus: robotlasma/pompalama olmamali.
- 5 dakika araliksiz sohbet et.

### C. Guclu

- Profil `Guclu` ve Kaydet.
- B testlerini tekrarla.
- Sessizlik temizligi artmali; ancak yumusak konusmada hece kesilmesi baslarsa Dengeli tercih edilmeli.

### D. Lifecycle / stabilite

- Mute/unmute 15 kez.
- Ekran paylasimini 5 kez ac/kapat; her seferinde mic toggle calismaya devam etmeli.
- Aktif input mikrofonunu 3-5 kez degistir; kanaldan cikmadan ses devam etmeli.
- 15-30 dakika ses kanalinda kal.
- Ses seviyesi zamanla degismemeli; processor birikmesine bagli artan CPU/robotlasma olmamali.

## Console'da beklenen log deseni

Ilk AI acilisinda bir kez:

- `[voice:v3.1] AI worklet created`
- `[voice:v3.1] processor initialized`

Mikrofon cihazi/profil capture restartinda:

- `[voice:v3.1] input track swapped; worklet/output reused`

Normal bir input restartinda yeniden tekrar tekrar `AI worklet created` gorulmemesi hedeflenir. AI ilk basta Kapali iken sonradan acilirsa ilk acilista bir kez worklet olusturulmasi normaldir.

## A/B motor karsilastirmasi

GTCRN ses karakteri/kararliligi hala istenen sonucu vermezse tum diger mimariyi ayni tutup yalniz birincil motoru RNNoise'a cevir:

```bash
node tools/switch-audio-engine-v3.0.1.mjs rnnoise
npm run typecheck
VITE_API_ORIGIN=same-origin npm run build
LIVEKIT_PUBLIC_URL=ws://localhost:7880 npm test
```

GTCRN'a donmek icin:

```bash
node tools/switch-audio-engine-v3.0.1.mjs gtcrn
npm run typecheck
VITE_API_ORIGIN=same-origin npm run build
```

Bu A/B testinde gate, capture, bitrate ve LiveKit yolu ayni kalir; sadece AI motor sirasi degisir.

## Opsiyonel DTX testi

Ses tamamen temiz oldugu halde sessizlikten konusmaya donuste ilk hecede cut-in/kopukluk hissedilirse Opus DTX'i kapatmak icin:

```bash
node tools/apply-audio-continuous-opus-v3.0.2.mjs
npm run typecheck
VITE_API_ORIGIN=same-origin npm run build
LIVEKIT_PUBLIC_URL=ws://localhost:7880 npm test
```

Bu patch ilk tercih degildir; yalniz DTX/cut-in suphelerinde denenir.

## Commit kurali

Gercek iki-kisilik test gecmeden kaynak degisikliklerini commit/push etme. Test basariliysa once `git status --short` ve `git diff --check`, ardindan kaynak dosyalari commit et.
