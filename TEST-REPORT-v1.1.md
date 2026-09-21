# ShakeChat v1.1 — test raporu

## Bu ortamda yapılan kontroller

- 64 TypeScript/TSX kaynak dosyası `transpileModule` ile syntax/transpile kontrolünden geçirildi: **0 syntax diagnostic**.
- `tests/*.cjs` dosyalarının tamamı `node --check` ile doğrulandı.
- v1.1 için sosyal test mock'u engelleme, grup DM ve DM reply/edit/reaction/pin akışlarını kapsayacak şekilde genişletildi.
- invite test mock'u `ServerBan` modelini destekleyecek şekilde genişletildi ve yasaklı kullanıcının davetle yeniden katılamaması senaryosu eklendi.
- Upgrade dosyaları v1.0.3 tabanına overlay edilerek hedef ağaçla karşılaştırılacaktır.

## Ortam kısıtı

Bu çalışma ortamında proje `node_modules` bağımlılıkları bulunmadığı için tam `npm run typecheck`, `npm run build` ve `npm test` çalıştırılamadı. Tam doğrulama kullanıcının mevcut Windows geliştirme ortamında yapılmalıdır.

## Beklenen Windows doğrulama komutları

```powershell
npm install
npm run db:generate
npm run db:migrate:v11
npm run typecheck
npm run build
npm test
```

Migration reset gerektirmez ve veri volume'larına dokunulmamalıdır.
