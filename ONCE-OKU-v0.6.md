# ÖNCE OKU — ShakeChat v0.6

Bu paket **çalışan v0.5.2'nin üzerine** uygulanır.

1. `npm run dev` açıksa `Ctrl+C` ile kapat.
2. Mevcut ShakeChat klasörünün yedeğini al.
3. ZIP içindeki `guncelleme` klasörünün **içindekileri** mevcut ShakeChat klasörünün üzerine kopyala.
4. Docker Desktop açık olsun ve `docker compose ps` ile LiveKit/PostgreSQL/Redis/MinIO servislerini kontrol et.
5. PowerShell'de proje klasöründe:

```powershell
npm install
npm run typecheck
npm run build
npm test
npm run dev
```

**v0.6 için Prisma migration yok.** `npm run db:migrate:*` çalıştırman gerekmiyor.

Şunları çalıştırma:

```powershell
prisma migrate reset
docker compose down -v
```

## İlk ses testi

- `http://localhost:5173` aç.
- İki ayrı hesap kullan: normal pencere + gizli pencere yeterli.
- Aynı ses kanalına iki hesapla gir.
- Tarayıcı mikrofon iznini sorarsa izin ver.
- İki pencere aynı fiziksel PC'de olduğu için feedback/eko yaşamamak adına kulaklık kullan veya pencerelerden birini mute/deafen yap.

## Başka fiziksel PC'den test edeceksen

`ws://localhost:7880` karşı bilgisayarda kendi bilgisayarını gösterir. Bu nedenle `LIVEKIT_PUBLIC_URL` değerini ShakeChat/LiveKit'i çalıştıran bilgisayarın erişilebilir adresine göre ayarlamak gerekir. İnternet üzerinden gerçek dağıtım için ayrıca TLS/ICE/TURN ağ ayarları yapılacaktır; bu v0.6 yerel geliştirme paketinin kapsamı değildir.
