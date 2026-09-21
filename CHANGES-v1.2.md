# ShakeChat v1.2 — Hesap Güvenliği ve Gizlilik

v1.2, v1.1.1 çalışan tabanını bozmadan hesap güvenliği ve gizlilik kontrollerini tamamlar.

## Eklenenler

- Kullanıcı başına `authVersion`.
- JWT payload'ına oturum sürümü (`v`) eklenmesi.
- HTTP `AuthGuard` içinde kullanıcı + token sürümü doğrulaması.
- Socket.IO handshake sırasında oturum sürümü doğrulaması.
- Açık Socket.IO bağlantılarında her paket öncesi ve 30 saniyede bir oturum sürümü kontrolü.
- Mevcut şifre doğrulamasıyla şifre değiştirme.
- Şifre değişiminde tüm eski tokenların geçersiz kılınması ve yeni token üretilmesi.
- Diğer cihaz/oturum tokenlarını geçersiz kılma işlemi.
- `401 Unauthorized` alan web istemcisinin oturumu temizleyip güvenli biçimde giriş ekranına dönmesi.
- Arkadaşlık isteği politikası:
  - `EVERYONE`
  - `SHARED_SERVERS`
  - `NOBODY`
- Grup DM davetlerini kabul etme/kapatma tercihi.
- Uygulama Ayarları içinde yeni **Hesap** ve **Gizlilik** sekmeleri.

## Veri modeli

Yeni enum:

`FriendRequestPolicy = EVERYONE | SHARED_SERVERS | NOBODY`

`User` modeline eklenen alanlar:

- `authVersion Int @default(0)`
- `friendRequestPolicy FriendRequestPolicy @default(EVERYONE)`
- `allowGroupDmInvites Boolean @default(true)`

Migration mevcut satırları silmez veya yeniden oluşturmaz.

## Güvenlik notları

Eski, v1.2 öncesi tokenlarda `v` alanı yoksa bunlar `0` kabul edilir. Kullanıcının `authVersion` değeri 0 olduğu sürece mevcut oturumlar çalışmaya devam eder. Şifre değiştirme veya oturumları geçersiz kılma işlemi `authVersion` değerini artırdığı anda eski tokenlar reddedilir.

Gizlilik alanları public kullanıcı objelerine eklenmez; ayrı `/auth/privacy` endpoint'i üzerinden yalnızca oturum sahibi tarafından okunur/değiştirilir.
