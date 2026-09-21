# ShakeChat v0.9 — önce bunu oku

Bu paket **v0.8.4 çalışan kurulumunun üzerine** uygulanmak için hazırlanmıştır.

## Kurulum

1. `npm run dev` açıksa `Ctrl+C` ile durdur.
2. Mevcut proje klasörünün yedeğini al.
3. ZIP içindeki `guncelleme` klasörünün **içindekileri** mevcut ShakeChat klasörünün üzerine kopyala.
4. Docker Desktop açık kalsın.
5. PowerShell'de proje klasöründe çalıştır:

```powershell
cd C:\Users\shake\Downloads\shakechat-mvp-0.1\shakechat
npm install
npm run db:generate
npm run db:migrate:v09
npm run typecheck
npm run build
npm test
```

Hepsi yeşilse:

```powershell
npm run dev
```

## Önemli

v0.9 migration içerir ama reset istemez.

**Çalıştırma:**

```powershell
prisma migrate reset
docker compose down -v
```

Bunlar mevcut veriyi silebilir ve v0.9 yükseltmesi için gerekli değildir.

## Hızlı manuel test

- İki hesap aynı alanda açık olsun.
- B hesabı başka yazı akışındayken A mesaj atsın: B'de unread rozeti artmalı.
- A, `@bob` gibi B'nin gerçek kullanıcı adını mention etsin: B'de mention rozeti görünmeli.
- B ilgili akışı açınca sayaç sıfırlanmalı.
- Profil kartından görünen ad/kısa durum kaydet; F5 sonrası kalmalı.
- Profil kartından masaüstü bildirimini aç; başka sekmeye geçip diğer hesaptan mesaj gönder.
- Üstteki arama düğmesinden eski bir mesajı ara.
- Alan ayarları > Akış düzeni bölümünden bir akışa bölüm adı ver ve sırasını değiştir.
- Roller/kanal izinları, ses, kamera, ekran paylaşımı ve v0.8 medya özelliklerinin hâlâ çalıştığını kontrol et.

## Tasarım notu

v0.9'un tema ve menü yapısı başka bir mesajlaşma ürününün görünümünü birebir kopyalamak için yapılmadı. ShakeChat'in kendi renk, kart, dock, rozet ve terminoloji sistemi kullanıldı. Bu teknik/tasarım yaklaşımı benzerlik riskini azaltır; hukuki görüş veya garanti yerine geçmez.
