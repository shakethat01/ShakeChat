# ÖNCE OKU — ShakeChat v0.7

Bu paket **çalışan v0.6.1'in üzerine** uygulanır.

1. `npm run dev` açıksa `Ctrl+C` ile kapat.
2. Mevcut ShakeChat klasörünün yedeğini al.
3. ZIP içindeki `guncelleme` klasörünün **içindekileri** mevcut ShakeChat klasörünün üzerine kopyala.
4. Docker Desktop açık olsun.
5. PowerShell'de proje klasöründe:

```powershell
npm install
npm run typecheck
npm run build
npm test
npm run dev
```

**v0.7 için Prisma migration yok.**

Şunları çalıştırma:

```powershell
prisma migrate reset
docker compose down -v
```

## Manuel kamera testi

- İki farklı hesapla aynı ses kanalına gir.
- Bir hesapta `Kamerayı aç` düğmesine bas.
- Chrome kamera izni isterse izin ver.
- Yerel preview ve diğer hesaptaki kamera görüntüsü görünmeli.
- Birden fazla kamera varsa `KAMERA` listesinden cihaz değiştir.
- Kamerayı kapatınca görüntü kartı iki tarafta da kaybolmalı.

## Manuel ekran paylaşımı testi

- `Ekran paylaş` düğmesine bas.
- Chrome'un açtığı seçim ekranından ekran / pencere / sekme seç.
- Diğer hesapta paylaşım video kartı olarak görünmeli.
- Tarayıcının kendi `Paylaşımı durdur` düğmesini kullanırsan ShakeChat düğmesi de tekrar `Ekran paylaş` durumuna dönmeli.
- Chrome paylaşım sesini desteklediği yüzeylerde `Sekme sesini paylaş / Sistem sesi` seçeneğini ayrıca gösterebilir.

Aynı PC'de iki hesabı test ederken ses feedback'i yaşamamak için kulaklık kullan.
