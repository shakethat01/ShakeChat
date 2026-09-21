# ShakeChat v1.2 — Test Raporu

Bu üretim ortamında proje bağımlılıkları tam kurulu olmadığı için tam Nest/Vite build ve test suite çalıştırılamadı. Son doğrulama Windows geliştirme ortamında yapılmalıdır.

## Burada yapılan kontroller

- 64 TS/TSX dosyası TypeScript parser/transpile kontrolü: **0 syntax error**
- Tüm `tests/*.cjs` dosyaları `node --check`: **OK**
- Migration SQL manuel bütünlük kontrolü: yalnızca enum + üç `User` alanı ekliyor
- v1.1.1 tabanı ile diff kontrolü: değişiklikler v1.2 kapsamıyla sınırlı

## Eklenen/güncellenen otomatik testler

- `tests/auth.test.cjs`
  - session rotation eski JWT sürümünü geçersiz kılar
  - yeni token geçerli kalır
  - yanlış mevcut şifre reddedilir
  - şifre değişimi authVersion artırır
  - eski şifre login'i reddedilir, yeni şifre çalışır
  - privacy alanları yalnızca özel endpoint üzerinden yönetilir
- `tests/realtime.test.cjs`
  - yanlış `authVersion` taşıyan WebSocket JWT handshake'i reddedilir
- `tests/social.test.cjs`
  - `NOBODY` arkadaşlık isteği politikası
  - `SHARED_SERVERS` ortak alan kontrolü
  - grup DM daveti kapalı kullanıcıyı yeni gruba eklememe
- `apps/web/src/App.test.tsx`
  - yeni Hesap ayarları yüzeyi
  - Gizlilik sekmesinden politika kaydetme

## Windows'ta son doğrulama

```powershell
npm install
npm run db:generate
npm run db:migrate:v12
npm run typecheck
npm run build
npm test
```
