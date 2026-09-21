# Önce Oku — v0.8

Bu paket v0.7 çalışan kurulumunun üstüne uygulanır.

1. `npm run dev` açıksa Ctrl+C ile kapat.
2. `guncelleme` klasörünün içeriğini mevcut ShakeChat klasörünün üstüne kopyala.
3. Docker Desktop ve MinIO açık olmalı.
4. Aşağıdaki komutları çalıştır:

```powershell
npm install
npm run db:generate
npm run db:migrate:v08
npm run typecheck
npm run build
npm test
npm run dev
```

Prisma `reset` isterse kabul etme. `prisma migrate reset` ve `docker compose down -v` çalıştırma.

İlk manuel test:
- küçük PNG/JPG sürükle-bırak
- Ctrl+V ile ekran görüntüsü yapıştır
- MP4 gönder
- ZIP/PDF gönder
- başka hesapta F5 olmadan göründüğünü kontrol et
- reply, edit, 👍 reaction ve pin test et
- F5 sonrası hepsinin kalıcı olduğunu doğrula
