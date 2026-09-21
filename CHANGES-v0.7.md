# ShakeChat v0.7 — Kamera, ekran paylaşımı ve medya ayarları

## Eklenenler

- Ses kanalında kamera aç/kapat.
- Canlı kamera görüntülerinin ses kanalında video kartları olarak gösterilmesi.
- Ekran / pencere / sekme paylaşımı için LiveKit screen-share akışı.
- Tarayıcı destekliyorsa ekran paylaşımındaki sesi de yakalama isteği (`audio: true`).
- Birden fazla kamera veya ekran paylaşımı olduğunda otomatik video grid.
- Ekran paylaşımı kamera görüntülerinden daha büyük/uygun oranlı gösterilir.
- Yerel kamera görüntüsü sessiz (`muted`) preview olarak gösterilir; ses mikrofon akışından gelir.
- Kamera cihazı seçimi.
- Mikrofon + hoparlör + kamera seçimleri aynı medya ayarları bölümünde toplandı.
- Ses kanalının alt dock'una kamera ve ekran paylaşımı kısayolları eklendi.
- Kullanıcı kartında kamera ve ekran paylaşımı durumu ikonla gösterilir.
- Kullanıcı tarayıcının "Paylaşımı durdur" düğmesiyle ekran paylaşımını bitirirse arayüz durumu LiveKit eventleriyle senkronize edilir.
- Kamera izni yalnızca kamera açıldığında istenir; yalnızca ses kanalına katılmak kamera izni istemez.

## Yetkiler

v0.7 yeni permission enum eklemez. Mevcut v0.5/v0.6 modeli korunur:

- `CONNECT_VOICE`: ses/video odasına girebilme.
- `SPEAK`: LiveKit üzerinde medya yayınlayabilme. Mikrofon, kamera ve ekran paylaşımı bu publish yetkisine bağlıdır.

`SPEAK` kaldırıldığında LiveKit `canPublish=false` olur ve kullanıcı yeni medya yayını başlatamaz; sunucu tarafındaki mevcut permission enforcement korunur.

## Veritabanı

Prisma şeması değişmedi. **v0.7 için migration yoktur.**

## Yeni bağımlılık

Yok. v0.6'da eklenen `livekit-client` kullanılmaya devam eder.

## Kapsam dışı

- Kamera çözünürlük/FPS profili seçimi.
- Kullanıcı başına ses seviyesi.
- Push-to-talk.
- Arka plan bulanıklaştırma / sanal arka plan.
- Uzak internet deployment için TURN/TLS.
