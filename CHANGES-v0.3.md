# ShakeChat v0.3 değişiklikleri

## Backend

- Prisma'ya `Invite` modeli eklendi: benzersiz kod, oluşturucu, süre, maksimum kullanım, kullanım sayacı ve iptal zamanı.
- `InvitesModule` eklendi.
- Yeni API uçları:
  - `GET /api/invites/:code/preview`
  - `POST /api/invites/:code/join`
  - `POST /api/servers/:serverId/invites`
  - `GET /api/servers/:serverId/invites`
  - `DELETE /api/servers/:serverId/invites/:inviteId`
  - `GET /api/servers/:serverId/members`
  - `DELETE /api/servers/:serverId/members/me`
  - `DELETE /api/servers/:serverId/members/:userId`
- Davet katılımı transaction içinde çalışır. `useCount` optimistic guard ile güncellenir; son kullanım slotunun eşzamanlı iki kullanıcı tarafından tüketilmesi engellenir.
- Süresi dolmuş, iptal edilmiş ve limiti dolmuş davetler reddedilir.
- Aynı sunucuya ikinci kez katılım reddedilir.
- Davet preview/join uçlarına bellek-içi rate limit eklendi.
- OWNER sunucudan ayrılamaz. Kick yalnızca OWNER tarafından yapılabilir.
- Kick/leave sonrası ilgili Socket.IO sunucu ve kanal odaları anında temizlenir.
- `member:joined`, `member:removed`, `server:removed` gerçek zamanlı olayları eklendi.

## Frontend

- `/invite/<kod>` bağlantısı algılanır.
- Giriş yapmamış kullanıcı davetle geldiğini görür; giriş/kayıttan sonra davet önizlemesi açılır.
- Davet modalı sunucu adı, üye sayısı ve varsa son kullanma bilgisini gösterir.
- Sunucu ayarları ekranı eklendi: **Üyeler** ve **Davetler**.
- Davet süresi/kullanım limiti seçilebilir, bağlantı kopyalanabilir ve davet iptal edilebilir.
- Üye çıkarma ve normal üyeler için sunucudan ayrılma akışı eklendi.
- Üye katılma/çıkarma olayları sağ panelde gerçek zamanlı güncellenir.
- Kullanıcı kicklenirse seçili sunucu istemciden anında kaldırılır.

## Veritabanı

Yeni migration: `20260909133500_v0_3_invites`.

Mevcut tablolar değiştirilmez; yalnızca `Invite` tablosu ve ilişkili index/foreign key'ler eklenir.
