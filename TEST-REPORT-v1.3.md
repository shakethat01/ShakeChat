# ShakeChat v1.3 — Test Notları

## Eklenen otomatik test kapsamı

- Muted LiveKit kamera publication'ının aktif kamera sayılmaması.
- DM okunmamış sayacının `lastReadAt` sonrasındaki diğer kullanıcı mesajlarını sayması.
- `markRead` sonrasında DM unread özetinin temizlenmesi.
- Conversation üyesi olmayan kullanıcının DM'yi okundu işaretleyememesi.
- Web uygulamasında persisted DM unread rozetinin gösterilmesi ve konuşma açılınca `markDmRead` çağrısı.

## Paket hazırlanırken yapılan statik kontroller

- TypeScript/TSX parser/transpile syntax kontrolü.
- Tüm Node `.cjs` test dosyalarında `node --check`.
- Upgrade overlay bütünlük/simülasyon kontrolü paket oluşturma sırasında yapılmalıdır.

## Kullanıcı ortamında zorunlu son doğrulama

```powershell
npm run db:generate
npm run db:migrate:v13
npm run typecheck
npm run build
npm test
```

Ardından kamera ve iki hesaplı DM unread/bildirim manuel testi yapılmalıdır.
