# v1.7 kurulumu

1. `npm run dev` açıksa Ctrl+C.
2. `guncelleme` klasörünün içindekileri proje köküne kopyala.
3. Çalıştır:

```powershell
npm run db:generate
npm run db:migrate:v17
npm run typecheck
npm run build
npm test
```

`prisma migrate reset` ve `docker compose down -v` çalıştırma.
