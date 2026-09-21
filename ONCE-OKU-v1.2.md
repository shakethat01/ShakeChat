# ShakeChat v1.2 — Bir Kez Oku

Bu paket **v1.1.1 üzerine** uygulanmalıdır.

1. Çalışan `npm run dev` terminalini `Ctrl+C` ile durdur.
2. İstersen mevcut proje klasörünün yedeğini al.
3. Paketteki `guncelleme` klasörünün **içindekileri** mevcut ShakeChat klasörünün üzerine kopyala.
4. PowerShell'de proje klasöründe şu komutları çalıştır:

```powershell
npm install
npm run db:generate
npm run db:migrate:v12
npm run typecheck
npm run build
npm test
```

Hepsi temizse:

```powershell
npm run dev
```

## Önemli

v1.2 migration içerir ama veri silmez. Şunları çalıştırma:

```powershell
prisma migrate reset
docker compose down -v
```

Prisma reset isterse kabul etme ve çıktıyı incele.

## Hızlı manuel test

- Hesap A → Uygulama Ayarları → Gizlilik → arkadaşlık isteklerini `Hiç kimse` yap.
- Hesap B'den A'ya istek gönder; backend reddetmeli.
- A ayarı `Yalnızca ortak alan üyeleri` yap; ortak sunucusu olmayan hesap reddedilmeli.
- A grup DM davetlerini kapat; bir arkadaş A'yı yeni grup sohbetine ekleyememeli.
- A'da `Diğer oturumları geçersiz kıl` çalıştır; başka tarayıcıdaki eski oturum bir sonraki API/WebSocket işleminde çıkmalı.
- Şifreyi değiştir; eski şifreyle login başarısız, yeni şifreyle başarılı olmalı.
