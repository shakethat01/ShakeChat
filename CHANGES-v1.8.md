# ShakeChat v1.8 — Kanal Kilidi + Toplu Mesaj Temizleme

v1.8, v1.7 slow-mode tabanının üstüne iki moderasyon aracı ekler.

## Kanal kilidi

- Yazı akışları `isLocked` alanıyla kilitlenebilir.
- Kilitli akışta normal `SEND_MESSAGES` yetkisi tek başına yazmak için yeterli değildir.
- `ADMINISTRATOR`, `MANAGE_MESSAGES` veya `MANAGE_CHANNELS` yetkili kullanıcılar moderasyon duyurusu yazmaya devam edebilir.
- Dosyalı mesajlar da aynı backend kilidine tabidir.
- Socket.IO `typing` olayı da kilidi aşamaz.
- Kilit değişikliği `channel:updated` ile sunucudaki açık istemcilere bildirilir; istemciler kanal durumunu yeniler.
- Akış başlığında `KİLİTLİ` durumu ve kullanıcıya açıklayıcı kilit bandı görünür.
- Sunucu ayarları > Akış düzeni ekranından da kilit açılıp kapatılabilir.

## Toplu mesaj temizleme

- `MANAGE_MESSAGES` yetkili kullanıcılar aktif yazı akışındaki son 2–100 mesajı tek işlemle silebilir.
- Backend yalnızca istenen aktif kanaldaki en yeni mesajları siler.
- Mesaj attachment kayıtları cascade ile silinir; MinIO nesneleri de temizlenir.
- Silinen her mesaj için mevcut `message:deleted` gerçek-zamanlı olayı yayınlanır, açık istemciler F5 olmadan güncellenir.

## Veri değişikliği

Yeni migration yalnızca `Channel.isLocked BOOLEAN NOT NULL DEFAULT false` alanını ekler.
Mevcut kanallar açık kalır. Mesaj, üye, rol veya dosya verisi silinmez.
