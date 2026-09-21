# ShakeChat v1.0.1 — bir kez oku

1. `npm run dev` açıksa `Ctrl+C` ile kapat.
2. v1.0.1 ZIP içindeki `guncelleme` klasörünün içeriğini mevcut ShakeChat klasörünün üzerine kopyala.
3. PowerShell'de proje kökünde:

```powershell
npm run typecheck
npm run build
npm test
npm run dev
```

Bu sürümde yeni dependency ve Prisma migration yoktur; `npm install` zorunlu değildir.

## Manuel test
- İki hesapla aynı ses kanalına gir.
- Ayarlar > Ses & görüntü > Ekran paylaşımı bölümünden önce 1080p 30, sonra 2K/1440p 60, sonra 2K/1440p 144 seç.
- Her profil değişiminde mevcut paylaşımı durdurup yeniden başlat. Profil çalışan bir paylaşımın encoder ayarını ortada değiştirmez.
- Video kartındaki gerçek `genişlik×yükseklik · FPS` rozetini karşılaştır.
- Son olarak `Kaynak · native` seçip paylaşımı yeniden başlat.

`prisma migrate reset` veya `docker compose down -v` çalıştırma.
