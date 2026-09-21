# ÖNCE OKU — ShakeChat v0.4

Bu paket **çalışan v0.3 projesinin üzerine yükseltme** içindir. Baştan kurulum değildir.

## Uygulama

1. `npm run dev` açıksa `Ctrl+C` ile durdur.
2. Mevcut `shakechat` klasörünün yedeğini al.
3. ZIP içindeki `guncelleme` klasörünün **içindeki dosyaları** mevcut proje klasörünün üzerine kopyala ve değiştirmeyi onayla.
4. Docker Desktop'ı açık tut.
5. Proje klasöründe PowerShell:

```powershell
npm install
npm run db:generate
npm run db:migrate:v04
npm run typecheck
npm run build
npm test
npm run dev
```

## Önemli

v0.4 gerçek Prisma migration içerir. Yeni arkadaş/DM tabloları eklenir; mevcut veriler silinmez.

Eğer Prisma sana veritabanını **resetlemeyi/sıfırlamayı** teklif ederse kabul etme ve çıktıyı ChatGPT'ye gönder.

Şunları çalıştırma:

```powershell
prisma migrate reset
docker compose down -v
```

## İlk test

İki hesapla **S → Arkadaşlar** ekranını aç. Arkadaşlık isteği gönder/kabul et, ardından Mesaj düğmesiyle DM aç. Mesajın diğer pencerede F5 olmadan görünmesi gerekir.
