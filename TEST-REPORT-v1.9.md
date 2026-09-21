# ShakeChat v1.9 test raporu

## Bu pakette eklenen regresyon kontrolü

Frontend `App.test.tsx` içine birleşik moderasyon araç kutusu testi eklendi. Test:

- Moderasyon araçları menüsünün açıldığını,
- slow mode değişikliğinin doğru API payload'ını ürettiğini,
- kanal kilidinin doğru API çağrısını yaptığını,
- toplu mesaj temizlemenin onay sonrası seçilen sayıyla çağrıldığını

doğrular.

## Paket ön kontrolleri

- TypeScript/TSX kaynakları TypeScript parser ile syntax kontrolünden geçirilmelidir.
- `.cjs` test dosyaları `node --check` ile kontrol edilmelidir.
- Final doğrulama kullanıcının gerçek Windows bağımlılık ortamında:
  - `npm run typecheck`
  - `npm run build`
  - `npm test`

v1.9 migration içermez.
