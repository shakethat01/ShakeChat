# ShakeChat v2.5

## Shared-server direct messages

- Aynı sunucuda bulunan iki kullanıcı artık arkadaş olmadan birebir özel mesaj başlatabilir.
- Kullanıcı engelleme kontrolü korunur; taraflardan biri diğerini engellediyse DM başlatılamaz veya mevcut birebir konuşmada yeni mesaj gönderilemez.
- Ortak sunucu veya arkadaşlık yoksa yeni bir DM başlatılamaz.
- Sunucu üye listesi, ses katılımcısı sağ-tık menüsü ve profil kartı ortak sunucu üyelerine `Özel mesaj / Mesaj gönder` seçeneğini gösterebilir.
- Birebir konuşma ilk kez oluşturulduğunda konuşma-değişikliği olayı iki kullanıcıya da yayınlanır; hedef kullanıcının DM listesi gerçek zamanlı güncellenebilir.

Bu değişiklik Prisma şemasında migration gerektirmez.
