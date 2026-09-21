# ShakeChat v1.3 — Bir Kez Oku

Bu paket **v1.2 çalışan tabanı üzerine** uygulanmalıdır.

1. `npm run dev` açıksa `Ctrl+C` ile durdur.
2. Paketteki `guncelleme` klasörünün **içindekileri** mevcut ShakeChat klasörünün üzerine kopyala.
3. PowerShell'de proje klasöründe:

```powershell
npm install
npm run db:generate
npm run db:migrate:v13
npm run typecheck
npm run build
npm test
```

Hepsi temizse:

```powershell
npm run dev
```

## Önemli

v1.3 migration içerir ancak veri silmez. Şunları çalıştırma:

```powershell
prisma migrate reset
docker compose down -v
```

Prisma reset isterse kabul etme.

## Kamera manuel testi

1. İki hesapla aynı ses kanalına gir.
2. Hesap A'da `Kamerayı aç` de.
3. Hesap B, A'nın görüntüsünü görmeli.
4. Hesap A aynı düğmeye tekrar basıp kamerayı kapatsın.
5. A'nın kamera tile'ı kaybolmalı; siyah kutu kalmamalı.
6. Düğme/ikon yeniden `Kamerayı aç` durumuna dönmeli.
7. Hesap B tarafında da A'nın kamera işareti/tile'ı kalkmalı.

## DM okunmamış manuel testi

1. Hesap A ve B açık olsun.
2. B, A'nın açık olmayan bir DM konuşmasına mesaj atsın.
3. A'da konuşma rozeti ve ana ShakeChat dikkat rozeti artmalı.
4. Sekme başlığında `(1) ShakeChat` görünmeli.
5. DM'yi açınca rozet sıfırlanmalı.
6. A başka sekmedeyken B tekrar mesaj atsın; masaüstü bildirimi gelmeli.
7. Bildirime tıklayınca doğru DM açılmalı.
8. Bir DM mesajına yalnızca reaction/edit/pin yap; okunmamış sayısı artmamalı.
