# ShakeChat v0.6 test raporu

## Bu ortamda tamamlanan kontroller

- v0.5.2 baseline üzerine incremental diff hazırlandı.
- v0.5.2 realtime test hotfix baseline'a dahil edildi; eski hata geri getirilmedi.
- 58 TypeScript/TSX kaynak dosyası TypeScript parser/transpile kontrolünden geçti: **0 syntax error**.
- `tests/voice.test.cjs` ve `tests/realtime.test.cjs` Node syntax kontrolünden geçti.
- Prisma schema değiştirilmedi.
- Docker Compose ve LiveKit YAML değiştirilmedi.
- Upgrade overlay sadece v0.6 ile ilgili dosyaları değiştiriyor.

## Eklenen otomatik testler

`tests/voice.test.cjs` şunları doğrular:

1. Ses tokenında kanal/room eşlemesi ve SPEAK davranışı.
2. SPEAK olmayan kullanıcının listen-only token alması.
3. TEXT kanalından voice token üretilememesi.
4. CONNECT_VOICE iptalinde bağlı katılımcının kaldırılması.
5. SPEAK değişiminde LiveKit publish izninin güncellenmesi.

Frontend App testi ayrıca mevcut bir ses kanalına tıklamanın voice join akışını başlattığını kontrol eder.

## Burada tamamlanamayanlar

Bu çalışma ortamında npm registry erişimi timeout verdiği için yeni `livekit-client` ve `livekit-server-sdk` paketleri indirilemedi. Bu nedenle **tam `npm run typecheck`, `npm run build` ve `npm test` turunun geçtiği iddia edilmemektedir**. Bunlar kullanıcının Windows ortamında `npm install` sonrasında doğrulanmalıdır.

Ayrıca gerçek WebRTC ses akışı burada test edilmedi. Windows + Docker Desktop + iki gerçek tarayıcı oturumu manuel testte doğrulanmalıdır.

## Manuel kabul kriterleri

- İki kullanıcı aynı VOICE kanalına bağlanır ve birbirini duyar.
- Konuşan kişinin kartında speaking göstergesi görünür.
- Mic mute/unmute iki tarafta doğru görünür ve ses akışını etkiler.
- Deafen gelen sesi kapatır ve yerel mikrofonu da kapatır.
- Mikrofon cihazı değiştirilebilir.
- Desteklenen tarayıcıda hoparlör cihazı değiştirilebilir.
- Metin kanalına geçmek voice bağlantısını kesmez.
- Başka ses kanalına geçmek eski odadan çıkarır.
- SPEAK yetkisi kaldırılınca kullanıcı konuşamaz ama kanalda kalabilir.
- CONNECT_VOICE kaldırılınca kullanıcı odadan anında düşer.
- Kick/leave voice bağlantısını sonlandırır.
