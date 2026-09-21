# ShakeChat v0.7 test raporu

## Bu ortamda tamamlanan kontroller

- Çalışan v0.6.1 baseline üzerine incremental değişiklik hazırlandı.
- 59 TypeScript/TSX dosyası TypeScript parser/transpile kontrolünden geçti: **0 syntax error**.
- Prisma schema değiştirilmedi.
- Docker Compose / LiveKit ağ hotfix'i korunuyor; v0.7 bu dosyalara dokunmuyor.
- NPM bağımlılığı eklenmedi.
- Kamera izninin sırf voice join sırasında istenmemesi için kamera device enumeration izinsiz yapılıyor; kamera izni `setCameraEnabled(true)` sırasında tarayıcı tarafından istenir.

## Eklenen frontend testleri

`apps/web/src/Voice.test.tsx`:

1. Aktif voice kanalında kamera ve ekran paylaşım kontrollerinin çağrıldığını doğrular.
2. `canSpeak=false` olduğunda kamera ve ekran paylaşım düğmelerinin disabled olduğunu doğrular.

## Burada tamamlanamayanlar

Bu çalışma ortamında npm registry bağlantısı timeout verdiği için tam `npm run typecheck`, `npm run build` ve `npm test` turu burada çalıştırılamadı. Kullanıcının Windows ortamında doğrulanmalıdır.

Gerçek kamera ve `getDisplayMedia` ekran paylaşımı da bu bulut ortamında fiziksel medya cihazı olmadığı için manuel olarak doğrulanamaz.

## Manuel kabul kriterleri

- Ses akışı v0.6.1'deki gibi çalışmaya devam eder.
- Kamera açıldığında yerel ve uzak istemcide görüntü görünür.
- Kamera kapatıldığında görüntü kaybolur.
- Kamera cihazı değiştirilebilir.
- Ekran paylaşımı diğer kullanıcıda görünür.
- Tarayıcı UI'sinden ekran paylaşımı durdurulunca ShakeChat state'i güncellenir.
- Kamera + ekran paylaşımı aynı anda açık olabilir.
- İki farklı katılımcının medya akışları grid içinde birlikte gösterilir.
- `SPEAK` olmayan kullanıcı kamera veya ekran paylaşımı başlatamaz.
