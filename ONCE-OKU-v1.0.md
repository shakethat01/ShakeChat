# ShakeChat v1.0 — önce bunu oku

Bu paket mevcut **v0.9 / v0.9.x** projesinin üzerine uygulanır. Baştan kurulum paketi değildir.

## Kurulum

1. `npm run dev` açıksa `Ctrl+C` ile durdur.
2. Mevcut proje klasörünün yedeğini al.
3. ZIP içindeki `guncelleme` klasörünün **içindekileri** mevcut ShakeChat klasörünün üzerine kopyala.
4. PowerShell'de proje klasöründe:

```powershell
npm install
npm run typecheck
npm run build
npm test
```

5. Hepsi geçerse:

```powershell
npm run dev
```

## Migration var mı?

**Hayır.** v1.0 Prisma şemasını ve mevcut veritabanını değiştirmez.

`prisma migrate reset` veya `docker compose down -v` çalıştırma.

## Manuel test

1. Kullanıcı çubuğundaki **Uygulama ayarları** düğmesini aç.
2. Köz/Gelgit/Grafit profillerinden birini kaydet; arayüz vurguları değişmeli.
3. Sıkı yoğunluğu seçip kaydet; akışlar ve mesaj aralıkları sıkılaşmalı.
4. Sayfayı yenile; ayarlar bu tarayıcıda korunmalı.
5. Ses kanalına gir.
6. Ses & görüntü ayarından kamera kalitesini 1080p60 seç; kamerayı kapatıp aç.
7. Ekran paylaşımını 1440p60 seç; paylaşımı başlat ve ikinci hesapta görüntünün geldiğini doğrula.
8. Gürültü/yankı/kazanç seçeneklerini değiştirip mikrofonun çalışmaya devam ettiğini kontrol et.
9. İki hesap arasında ses, kamera ve ekran paylaşımının v0.9 davranışını koruduğunu doğrula.
