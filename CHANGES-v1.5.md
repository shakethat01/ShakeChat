# ShakeChat v1.5 — Moderasyon İşlem Geçmişi

v1.5, v1.4 tabanına sunucu moderasyon görünürlüğü ekler.

## Yeni

- Sunucu ayarlarına **İşlem geçmişi** sekmesi eklendi.
- Son 100 moderasyon işlemi görüntülenir.
- Kayıtlar şu eylemleri kapsar:
  - üye çıkarma (kick)
  - üye yasaklama (ban)
  - yasağı kaldırma (unban)
- Her kayıtta işlemi yapan kişi, hedef kullanıcı, zaman ve varsa ban nedeni saklanır.
- Kullanıcı daha sonra görünen adını değiştirse bile geçmişteki olayın isim snapshot'ı korunur.
- İşlem türüne göre filtreleme eklendi.
- Audit geçmişi yalnızca sunucu yönetimi / kick / ban yetkisi olan kullanıcılara açıktır.

## Veri modeli

Yeni `AuditAction` enumu ve `ServerAuditLog` tablosu eklendi.
Migration yalnızca yeni audit tablosunu ve enumu oluşturur; mevcut mesaj, üye, DM veya dosya verilerini değiştirmez.

## Güvenlik

Audit erişim kontrolü backend tarafında yapılır. UI'da sekmenin gizlenmesi tek güvenlik katmanı değildir.
Kick/ban işlemi ile audit kaydı aynı Prisma transaction içinde yazılır.
