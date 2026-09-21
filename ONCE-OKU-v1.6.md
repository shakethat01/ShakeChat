# ShakeChat v1.6 — Bir kez oku

Bu sürümde Prisma migration vardır. Mevcut mesaj/DM verilerini silmez; `ServerMember` üzerine iki nullable alan ve iki enum değeri ile yeni bir izin ekler.

Kurulum:
```powershell
npm run db:generate
npm run db:migrate:v16
npm run typecheck
npm run build
npm test
```

`prisma migrate reset` veya `docker compose down -v` çalıştırma. Prisma reset isterse dur ve çıktıyı paylaş.
