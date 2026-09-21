# ShakeChat v0.4 değişiklikleri

## Veritabanı

Yeni Prisma modelleri:

- `FriendRequest`
- `Friendship`
- `DirectMessageConversation`
- `DirectMessageMember`
- `DirectMessage`

Yeni migration: `apps/api/prisma/migrations/20260909140700_v0_4_friends_dms/migration.sql`

Mevcut v0.3 tabloları değiştirilmez veya silinmez.

## Backend

Yeni `friends` modülü:

- `GET /api/friends`
- `GET /api/friends/requests`
- `POST /api/friends/requests`
- `POST /api/friends/requests/:requestId/accept`
- `DELETE /api/friends/requests/:requestId`
- `DELETE /api/friends/:friendId`

Yeni `direct-messages` modülü:

- `GET /api/dms`
- `POST /api/dms/with/:friendId`
- `GET /api/dms/:conversationId/messages`
- `POST /api/dms/:conversationId/messages`

Socket.IO `/chat` namespace'ine:

- `friends:snapshot`
- `friend:presence`
- `friend:request`
- `friendship:changed`
- `dm:join`
- `dm:leave`
- `dm:new`
- `dm:typing`
- `dm:conversation-update`

eklendi.

Her socket kendi `user:<userId>` odasına girer. Bu oda yalnızca arkadaşlık/DM bildirim fanout'u için kullanılır. DM odasına katılım veritabanındaki `DirectMessageMember` kaydıyla doğrulanır.

## Frontend

- ShakeChat ana düğmesi artık Arkadaşlar/DM görünümünü açar.
- Arkadaşlık isteği gönderme, kabul, ret, iptal ve arkadaşlıktan çıkarma UI'sı eklendi.
- Özel mesaj konuşmaları sol sidebar'da listelenir.
- DM mesaj geçmişi, realtime mesaj, typing ve reconnect desteği eklendi.
- Arkadaş online/offline bilgisi canlı güncellenir.

## Testler

- Arkadaşlık servis güvenlik/akış testleri
- DM servis erişim ve son-100 geçmiş testi
- Socket.IO DM oda erişimi, realtime mesaj ve typing testi
- DM React hook reconnect/dedup/typing testleri
- Arkadaşlar ana ekranına geçiş testi

Mevcut v0.2/v0.3 testleri korunmuştur.
