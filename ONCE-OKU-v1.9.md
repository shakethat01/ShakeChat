# ShakeChat v1.9 — önce oku

Bu paket **v1.8 temiz baseline** üzerine uygulanır.

1. Çalışan `npm run dev` sürecini `Ctrl+C` ile durdur.
2. ZIP içindeki `guncelleme` klasörünün **içindekileri** mevcut ShakeChat proje klasörünün üzerine kopyala.
3. Migration veya yeni paket kurulumu yoktur.
4. Proje kökünde çalıştır:

```powershell
npm run typecheck
npm run build
npm test
```

Hepsi yeşilse:

```powershell
npm run dev
```

## Hızlı manuel kontrol

- Bir yazı kanalında üstteki **Moderasyon araçları** düğmesini aç.
- Slow mode'u 10 veya 30 saniye yap ve sayfanın güncellendiğini kontrol et.
- Kanalı kilitle / aç.
- Toplu temizlemede bir kez onay verdikten sonra işlemin tek kez çalıştığını kontrol et.
- Başarı/hata mesajlarının sağ altta toast olarak çıktığını kontrol et.
- İkinci tarayıcıda bağlantıyı kısa süre kesip başlıktaki `Bağlanıyor` durumunu kontrol et.

`prisma migrate reset` veya `docker compose down -v` çalıştırma.
