# ShakeChat v1.8 — Test Raporu

Paket hazırlanırken yapılan statik kontroller:

- 64 TypeScript / TSX dosyası TypeScript parser/transpile kontrolü: **0 syntax hata**
- `tests/*.cjs` dosyalarının tamamı `node --check`: **temiz**
- Yeni backend testleri:
  - kilitli kanalda normal kullanıcı mesajının reddedilmesi
  - `MANAGE_MESSAGES` moderatörünün kilit bypass'ı
  - toplu temizlemenin son N mesajı ve ilgili MinIO nesnelerini temizlemesi
  - toplu temizleme için `MANAGE_MESSAGES` zorunluluğu
- Frontend mevcut slow-mode testi, aynı Akış düzeni ekranından kanal kilidi çağrısını da doğrulayacak şekilde genişletildi.

Bu çalışma ortamında proje `node_modules` klasörü bulunmadığından tam Nest/Vite build ve Vitest suite çalıştırılamadı. Son doğrulama kullanıcının Windows ortamında:

```powershell
npm run db:generate
npm run db:migrate:v18
npm run typecheck
npm run build
npm test
```

ile yapılmalıdır.
