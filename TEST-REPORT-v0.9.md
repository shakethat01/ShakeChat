# ShakeChat v0.9 — test raporu

## Bu ortamda yapılan kontroller

- v0.8.4 tabanı üzerine v0.9 değişiklikleri incremental uygulandı.
- 61 adet TS/TSX kaynak dosyası TypeScript `transpileModule` ile syntax/transpile kontrolünden geçirildi.
- Sonuç: **0 syntax/transpile hatası**.
- Migration SQL'i, Prisma şema değişiklikleri ve upgrade dosya listesi statik olarak incelendi.
- v0.9 arayüzü önceki mor/blurple ağırlıklı görünümden ayrıştırılarak amber/mint/grafit özgün tema override'larıyla güncellendi.

## Tam test durumu

Bu çalışma ortamında npm registry erişimi tamamlanmadığı için `npm install` 120 saniye içinde sonuçlanmadı. Bu nedenle burada tam Nest/Vite build ve test suite çalıştırılamadı.

Kullanıcının Windows ortamında şu komutlar nihai doğrulamadır:

```powershell
npm install
npm run db:generate
npm run db:migrate:v09
npm run typecheck
npm run build
npm test
```

Frontend App testlerine v0.9 için ayrıca mention önerisi, profil kaydetme ve sunucu-geneli arama senaryoları eklendi.

## Beklenen regresyon alanları

Özellikle şunlar manuel olarak tekrar doğrulanmalı:

- invite/member/realtime backend testleri
- v0.8 dosya yükleme/reply/edit/reaction/pin
- LiveKit ses + kamera + ekran paylaşımı
- rol ve kanal izinleri
- yeni unread/mention sayaçları
- profil ve tarayıcı bildirimi
- akış sıralama/gruplama

## Veri güvenliği

Migration additive'dir. Test veya kurulum için `prisma migrate reset` ya da `docker compose down -v` gerekmez.
