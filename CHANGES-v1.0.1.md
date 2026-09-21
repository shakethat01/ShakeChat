# ShakeChat v1.0.1 — yüksek kaliteli ekran paylaşımı

## Neden bu sürüm var?
v1.0 kalite seçimini ekran yakalama (capture) hedeflerine bağlıyordu; ancak LiveKit/WebRTC gönderim encoder'ının bitrate ve FPS tavanı aynı profille açıkça yükseltilmiyordu. Bu nedenle 1080p/1440p profilleri pratikte birbirine yakın görünebiliyordu. v1.0.1 capture + publish + receive katmanlarını aynı kalite profiline bağlar.

## Yeni ekran paylaşımı profilleri
- Otomatik
- Kaynak / native (8K / 144 FPS tavan hedefi)
- 720p 30 FPS
- 1080p 30 / 60 / 120 / 144 FPS
- 2K / 1440p (2560×1440) 30 / 60 / 120 / 144 FPS

## Gerçek medya davranışı
- Her profil capture çözünürlüğü ve frame-rate hedefi gönderir.
- Her profil LiveKit `screenShareEncoding` için ayrı maksimum bitrate ve FPS belirler.
- 120/144 FPS profilleri `maintain-framerate` ile akıcılığı önceliklendirir.
- Çözünürlük ağırlıklı profiller netliği korumaya çalışır.
- Uzak ekran paylaşımında istenen yüksek çözünürlük ve FPS, adaptive-stream kararına açık tercih olarak iletilir.
- Paylaşım kartında tarayıcının gerçek medya track'inde bildirdiği çözünürlük ve FPS gösterilir.

## Önemli sınır
144 FPS bir hedeftir. Chrome/Edge, ekran kaynağı, Windows capture katmanı, GPU/WebRTC encoder, codec, ağ veya alıcı sistem bunu daha düşük değere sınırlayabilir. Kartta görünen gerçek değer hedef değil, tarayıcının bildirdiği fiili track ayarıdır.

## Veritabanı
Prisma şeması değişmedi. Migration yoktur.
