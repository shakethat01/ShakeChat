# ShakeChat v1.1 — önce bunu oku

Bu paket **v1.0.3 üzerine incremental upgrade** olarak hazırlanmıştır.

## Kurulum

1. Çalışan `npm run dev` terminalini `Ctrl+C` ile durdur.
2. Mevcut proje klasörünün yedeğini al.
3. ZIP içindeki `guncelleme` klasörünün **içindekileri** mevcut ShakeChat klasörünün üzerine kopyala.
4. Docker Desktop ve mevcut PostgreSQL/Redis/MinIO/LiveKit container'larını silme.
5. Proje klasöründe çalıştır:

```powershell
npm install
npm run db:generate
npm run db:migrate:v11
npm run typecheck
npm run build
npm test
```

Hepsi başarılıysa:

```powershell
npm run dev
```

## Önemli

v1.1 gerçek Prisma migration içerir. Migration mevcut veriyi silmek için değil yeni moderasyon/DM tablolarını ve alanlarını eklemek içindir.

**Çalıştırma:**

```powershell
prisma migrate reset
docker compose down -v
```

Prisma herhangi bir nedenle reset önerirse onaylama; hata çıktısını paylaş.

## Kısa manuel test

- İki kullanıcı arkadaş olsun; A, B'yi engellesin. Arkadaşlık silinmeli ve eski birebir DM salt-okunur olmalı.
- Engeli kaldırınca otomatik arkadaş olunmamalı; yeniden arkadaşlık isteği gönderilebilmeli.
- A, en az iki arkadaş seçerek grup DM açsın; diğer hesaplarda F5 olmadan görünmeli.
- Grup DM'de reply, edit, reaction, pin ve dosya yükleme dene.
- Sunucu sahibi/yetkili bir üyeyi yasaklasın. Yasaklanan hesap aynı davet koduyla yeniden katılamamalı.
- Yasağı kaldır; aynı kullanıcı tekrar davetle katılabilmeli.
