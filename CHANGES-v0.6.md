# ShakeChat v0.6 — LiveKit ses kanalları

## Eklenenler

- `POST /api/voice/channels/:channelId/token`
  - JWT oturumu zorunlu.
  - Kanalın gerçekten `VOICE` olması zorunlu.
  - `VIEW_CHANNEL` + `CONNECT_VOICE` backend tarafından kontrol edilir.
  - `SPEAK` yoksa LiveKit tokenı dinleme yetkisiyle verilir fakat yayın yapamaz.
- LiveKit access token üretimi backend'e eklendi; API secret tarayıcıya gönderilmez.
- Ses kanalına tıklayınca gerçek LiveKit bağlantısı başlatılır.
- Mikrofon aç/kapat.
- Deafen: gelen sesleri kapatır ve açık mikrofonu da kapatır.
- Aktif konuşan kişi göstergesi.
- Bağlı katılımcı listesi.
- Mikrofon cihazı seçimi.
- Hoparlör cihazı seçimi (tarayıcı destekliyorsa).
- Ses bağlantısı açıkken başka metin kanalına/DM ekranına geçilebilir; bağlantı alttaki ses dock'unda yaşamaya devam eder.
- Başka ses kanalına tıklayınca eski LiveKit odasından çıkıp yeni odaya geçilir.
- Rol/kanal izni değişiklikleri LiveKit tarafına da uygulanır:
  - `CONNECT_VOICE` kaybedilirse katılımcı odadan çıkarılır ve eski token revoke edilir.
  - `SPEAK` kaybedilirse yayın izni canlı olarak kaldırılır.
- Sunucudan ayrılma/kick durumunda kullanıcının LiveKit bağlantısı da sonlandırılır.
- Ses kanalı silinirse aktif LiveKit odası kapatılmaya çalışılır.

## Veritabanı

Prisma şeması değişmedi. **v0.6 için migration yoktur.**

## Yeni bağımlılıklar

- API: `livekit-server-sdk`
- Web: `livekit-client`

## Yerel varsayılan LiveKit ayarları

Mevcut Docker `infrastructure/livekit/livekit.yaml` ile uyumlu varsayılanlar:

- API URL: `http://localhost:7880`
- Browser URL: `ws://localhost:7880`
- API key: `devkey`
- API secret: `devsecret-change-me`

Bunlar `.env` ile değiştirilebilir. Mevcut localhost kurulumu için `.env` değişikliği zorunlu değildir.

## Kapsam dışı

- Kamera/video
- Ekran paylaşımı
- Push-to-talk
- Kullanıcı başına ses seviyesi
- Noise suppression ayar ekranı
- Uzak internet deployment/TURN/TLS yapılandırması
