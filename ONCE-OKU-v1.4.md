# ShakeChat v1.4 — Bir Kez Oku

Bu paket **çalışan v1.3.2 tabanı üzerine** uygulanmalıdır.

1. `npm run dev` açıksa `Ctrl+C` ile durdur.
2. ZIP içindeki `guncelleme` klasörünün içindekileri mevcut ShakeChat klasörünün üzerine kopyala.
3. Proje klasöründe:

```powershell
npm run typecheck
npm run build
npm test
```

Hepsi temizse:

```powershell
npm run dev
```

## Migration / dependency

v1.4 için **Prisma migration yoktur** ve **yeni npm paketi yoktur**. `npm install` veya migration komutu gerekli değildir.

## Bas-konuş manuel testi

1. Ayarlar > Ses & görüntü > Bas-konuş seç.
2. İstersen `Bas-konuş tuşunu değiştir` ile bir tuş ata ve ayarları kaydet.
3. Ses kanalına gir; mikrofon kapalı başlamalı.
4. Atanan tuşu basılı tut; mikrofon aktif olmalı ve karşı hesap sesi duymalı.
5. Tuşu bırak; mikrofon tekrar kapanmalı.
6. Tuş basılıyken başka pencereye geç; mikrofon takılı kalmamalı.
7. Tekrar `Ses algılama` moduna dön; normal mikrofon aç/kapat kontrolü çalışmalı.

## Kişi sesi manuel testi

1. İki hesapla aynı ses kanalına gir.
2. Karşı kullanıcının kartındaki ses seviyesini örneğin %40 yap; sadece bu tarayıcıda ses azalmalı.
3. Yerel sustur düğmesine bas; karşı kullanıcı yalnızca sende susmalı.
4. Global `Sağırlaştır` aç/kapat; kişi bazlı susturma seçimi korunmalı.
