# ShakeChat v1.8 — Bir kez oku

Bu paket çalışan v1.7 klasörünün üzerine uygulanır.

1. `npm run dev` açıksa `Ctrl+C`.
2. ZIP içindeki `guncelleme` klasörünün **içindekileri** proje klasörünün üzerine kopyala.
3. Docker Desktop açık kalsın.
4. PowerShell:

```powershell
cd C:\Users\shake\Downloads\shakechat-mvp-0.1\shakechat
npm run db:generate
npm run db:migrate:v18
npm run typecheck
npm run build
npm test
```

Migration sadece mevcut kanallara `isLocked=false` alanı ekler.

**Çalıştırma:**
- `prisma migrate reset`
- `docker compose down -v`

Testler temizse:

```powershell
npm run dev
```

Manuel hızlı test:
- Normal kullanıcı + moderatör aynı yazı akışında olsun.
- Moderatör üstteki kilit düğmesiyle akışı kilitlesin.
- Normal kullanıcı mesaj/dosya gönderememeli ve typing üretmemeli.
- Moderatör mesaj gönderebilmeli.
- Kilidi açınca normal kullanıcı tekrar yazabilmeli.
- `Son mesajları temizle` ile örn. 10 mesaj sil; iki istemcide de anında kaybolmalı.
