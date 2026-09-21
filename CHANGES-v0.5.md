# ShakeChat v0.5 — Roller ve Yetkiler

## Eklendi
- Sunucuya özel custom roller.
- Yönetilen temel roller: Sahip, Yönetici, Moderatör, Üye.
- Rol oluşturma, düzenleme, silme ve üyeye rol atama/kaldırma.
- Backend effective-permission resolver.
- İzinler: ADMINISTRATOR, MANAGE_SERVER, MANAGE_CHANNELS, MANAGE_ROLES, KICK_MEMBERS, MANAGE_MESSAGES, MANAGE_INVITES, VIEW_CHANNEL, SEND_MESSAGES, CONNECT_VOICE, SPEAK.
- Rol bazlı kanal permission override (Varsayılan / İzin ver / Reddet).
- Kanal görünürlüğü ve mesaj gönderme kontrolleri.
- Kanal oluşturma ve silme yetkisi.
- Davet yönetimini rol izinlerine bağlama.
- Kick işlemini KICK_MEMBERS + sistem rol hiyerarşisine bağlama.
- Kendi mesajını silme; MANAGE_MESSAGES ile başkasının mesajını silme.
- Message deletion için Socket.IO realtime olayı.
- Rol/kanal izni değişince online istemcilerin permission snapshot yenilemesi ve artık görülemeyen kanal odalarından anında çıkarılması.
- Sunucu ayarlarında Roller ve Kanal izinleri ekranları.
- Üye listesinde atanmış roller.

## Güvenlik
Frontend yalnızca buton görünürlüğünü iyileştirir. Yetki kararı API ve WebSocket tarafında tekrar doğrulanır. `VIEW_CHANNEL` kaybeden bir kullanıcı mevcut Socket.IO kanal odasından çıkarılır; böylece eski bağlantı üzerinden yeni mesaj almaya devam edemez.

## Bilerek v0.5 dışında bırakılanlar
- Sunucu sahipliği devri.
- Ban sistemi.
- Rol sürükle-bırak sıralaması.
- Kullanıcıya özel channel override (v0.5 yalnızca role override uygular).
- LiveKit ses kanalında CONNECT_VOICE/SPEAK uygulaması; ses UI v0.6'da bağlanacak.
