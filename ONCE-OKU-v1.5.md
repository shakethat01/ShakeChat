# ShakeChat v1.5 — Bir kez oku

Bu sürümde migration vardır.

Proje kökünde sırayla:

```powershell
npm install
npm run db:generate
npm run db:migrate:v15
npm run typecheck
npm run build
npm test
```

Ardından:

```powershell
npm run dev
```

## Manuel test

1. İki veya üç hesapla aynı alana gir.
2. Yetkili hesapla normal bir üyeyi çıkar.
3. Sunucu ayarları > İşlem geçmişi bölümünde `Alandan çıkarıldı` kaydını doğrula.
4. Bir üyeyi neden yazarak yasakla.
5. İşlem geçmişinde ban nedeni ve tarih/saat görünmeli.
6. Yasaklılar sekmesinden yasağı kaldır.
7. İşlem geçmişinde `Yasak kaldırıldı` görünmeli.
8. İşlem türü filtresini `Yasaklama` seç ve yalnızca ban kayıtlarının kaldığını doğrula.
9. Yetkisiz MEMBER hesabında İşlem geçmişi sekmesi görünmemeli; endpoint doğrudan çağrılırsa 403 dönmeli.

## Çalıştırma

Şunları kullanma:

```text
prisma migrate reset
docker compose down -v
```

Prisma reset isterse onaylama; çıktıyı paylaş.
