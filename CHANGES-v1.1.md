# ShakeChat v1.1 — değişiklikler

## Moderasyon

- Yeni sunucu izni: `BAN_MEMBERS`.
- Sunucu ayarlarına **Yasaklılar** bölümü eklendi.
- Yetkili kullanıcılar üyeyi isteğe bağlı nedenle yasaklayabilir ve yasağı kaldırabilir.
- Yasaklanan aktif üye üyelikten çıkarılır; Socket.IO/LiveKit tarafında sunucudan uzaklaştırılır.
- Yasaklı kullanıcı, geçerli bir davet koduna sahip olsa bile backend tarafından tekrar katılamaz.
- `BAN_MEMBERS` Owner/Admin için `ADMINISTRATOR` üzerinden kullanılabilir ve özel rollere ayrıca verilebilir. Moderatör temel rolüne otomatik eklenmez.

## Kullanıcı engelleme

- Arkadaşlar alanında kullanıcı engelleme ve engeli kaldırma eklendi.
- Engelleme iki kullanıcı arasındaki arkadaşlığı ve bekleyen arkadaşlık isteklerini temizler.
- Taraflardan biri diğerini engellediyse yeni arkadaşlık isteği ve birebir DM gönderimi reddedilir.
- Var olan birebir DM geçmişi silinmez; konuşma salt-okunur görünür.

## Grup DM

- Kullanıcı + 2–8 arkadaş ile grup özel sohbeti oluşturulabilir (toplam 3–9 kişi).
- İsteğe bağlı grup adı desteklenir.
- Grup oluşturma yalnızca oluşturan kullanıcının arkadaş listesinden seçim yapmasına izin verir.
- Yeni grup, üyelerin açık istemcilerine Socket.IO ile anında bildirilir.

## DM mesaj özellikleri

Birebir ve grup DM'lerde:

- Yanıtla
- Kendi mesajını düzenle
- Tepki ekle/kaldır
- Sabitle / sabitlemeyi kaldır
- Kendi mesajını sil
- MinIO dosya yükleme
- Görsel/video önizleme
- Sürükle-bırak ve panodan dosya/görsel yapıştırma
- Maksimum 10 dosya, dosya başına 25 MB ve backend MIME kontrolü
- Mesaj güncelleme/silme olaylarının gerçek zamanlı senkronizasyonu

## Veri modeli

Yeni tablolar:

- `UserBlock`
- `ServerBan`
- `DirectMessageAttachment`
- `DirectMessageReaction`

`DirectMessageConversation` grup konuşmaları için nullable `pairKey` ve `title` alanı aldı. `DirectMessage` reply/pin/edit alanları aldı.

## Tasarım

Yeni ekranlar ShakeChat'in grafit/orman + amber/mint görsel dilini kullanır. Discord'un renk paleti, sunucu rayı, menü oranları veya marka öğeleri kopyalanmaz.
