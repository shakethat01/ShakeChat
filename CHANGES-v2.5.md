# ShakeChat v2.5

## Shared-server direct messages

- Aynı sunucuda bulunan iki kullanıcı artık arkadaş olmadan birebir özel mesaj başlatabilir.
- Kullanıcı engelleme kontrolü korunur; taraflardan biri diğerini engellediyse DM başlatılamaz veya mevcut birebir konuşmada yeni mesaj gönderilemez.
- Ortak sunucu veya arkadaşlık yoksa yeni bir DM başlatılamaz.
- Sunucu üye listesi, ses katılımcısı sağ-tık menüsü ve profil kartı ortak sunucu üyelerine `Özel mesaj / Mesaj gönder` seçeneğini gösterebilir.
- Birebir konuşma ilk kez oluşturulduğunda konuşma-değişikliği olayı iki kullanıcıya da yayınlanır; hedef kullanıcının DM listesi gerçek zamanlı güncellenebilir.

## Sidebar canlı senkron

- Kanal sürükle-bırak sonrası `window.location.reload()` kaldırıldı; aktif sohbet/socket bağlantısı kopmadan kanal sırası ve kategori değişiklikleri yenileniyor.
- Kanal adı, kategori, kilit durumu, yukarı/aşağı taşıma, kategori yeniden adlandırma ve kategori içinde kanal oluşturma işlemleri de tam sayfa yenileme yapmıyor.
- Kanal oluşturma ve silme artık backend tarafından `channel:updated` olayıyla sunucu odasına yayınlanıyor. Mevcut `reloadAccess()` akışı React tarafındaki sunucu/kanal listesini kendisi tazeliyor.
- Aktif kanal silinirse mevcut erişim yenileme akışı uygun sonraki kanalı seçmeye devam ediyor.

## Sidebar yetki algılama

- Sidebar `MANAGE_CHANNELS` yetkisini yalnız seçili kanal üzerinden beklemiyor; aktif sunucunun kendi yetkisini doğrudan sorguluyor.
- Aktif sunucu çözümleme, aktif server düğmesine ek olarak sol paneldeki alan başlığını da fallback olarak kullanıyor.
- Yetki sonucu geldikten sonra kanal sürüklenebilirliği anında tekrar uygulanıyor; kullanıcının önce bir kanala tıklaması gerekmiyor.
- Sunucu değiştirildiğinde yetki zorla tazeleniyor; eski sunucunun drag yetkisi yeni sunucuya taşınmıyor.

Not: `Okundu işaretle` işlemleri mevcut okunmamış sayaç davranışını korumak için şimdilik eski tam-yenileme yolunda bırakıldı. Kanal düzenleme/drag işlemleri artık reloadsuzdur.

Bu değişiklikler Prisma şemasında migration gerektirmez.
