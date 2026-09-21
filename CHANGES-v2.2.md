# ShakeChat v2.2 — Unified User Menu + Presence

Bu tur kullanıcı etkileşimleri ve ses kanalı kontrolleri tek bir Discord-benzeri akışta birleştirildi.

## Tek kullanıcı menüsü

- Ses kanalındaki kullanıcıya sağ tık artık ayrı bir voice menüsü açmaz; uygulamanın genel kullanıcı menüsünü açar.
- Aynı menü içinde profil, DM, arkadaşlık, engelleme ve yetkiye bağlı moderasyon işlemleri korunur.
- Ses kanalındaki uzak kullanıcı için aynı menüde ek olarak:
  - yerel sessize al / sesi aç,
  - kişi bazlı ses seviyesi,
  - %25 / %50 / %75 / %100 hızlı seviye düğmeleri,
  - konuşuyor / mikrofon kapalı / LIVE ekran paylaşımı durumu bulunur.
- Voice state ile global menü arasında küçük bir browser event bridge kullanılır; LiveKit odasına ikinci bir bağlantı açılmaz.
- LiveKit participant identity doğrudan ShakeChat user id olduğu için voice satırları kullanıcıyla id üzerinden eşleştirilir.

## Presence görünümü

Mevcut backend profil modları korunarak Discord-benzeri isimlendirme kullanıldı:

- `AVAILABLE` → Çevrimiçi
- `AWAY` → Boşta
- `FOCUS` → Rahatsız etmeyin
- socket offline → Çevrimdışı

Forge temasında durum renkleri:

- Çevrimiçi: molten orange
- Boşta: amber/sarı
- Rahatsız etmeyin: kırmızı
- Çevrimdışı: graphite/gri

Sağ üye listesi, arkadaş satırları, kullanıcı çubuğu ve profil kartı bu durum dilini kullanır.

## Regresyon

- Voice testindeki eski ayrı context-menu testi event bridge testiyle değiştirildi.
- Ses kullanıcı satırının gerçek user id taşıdığı, snapshot yayınladığı ve global menüden gelen local mute / volume aksiyonlarının mevcut `useVoice` state'ine ulaştığı test edilir.

## Dokunulmayan alanlar

- LiveKit bağlantı/ICE mimarisi
- Cloudflare public browser testi
- Router 7881/TCP + 7882/UDP medya yönlendirmesi
- Mesajlaşma ve backend permission enforcement
