# ShakeChat v2.6

## Stable UI identities

- Sunucu ve kanal satırları DOM üzerinde gerçek `serverId` / `channelId` ile eşleştiriliyor.
- Kanal sağ-tık ve sürükle-bırak işlemleri aynı isimli kanallarda yalnız görünen ada bağımlı kalmıyor.
- Üye listesi, grup DM üyesi, DM profil kartı ve mesaj satırları mümkün olduğunda gerçek `userId` ile işaretleniyor.
- Kullanıcı sağ-tık menüsü tekrar açıldığında kullanıcı eşlemesi görünen ada daha az bağımlı oluyor; aynı görünen ada sahip kullanıcılar için yanlış kişiye işlem uygulamamak adına belirsiz eşleşme atlanıyor.
- Aktif sunucu değiştiğinde kimlik eşlemeleri yeniden tazeleniyor; DOM yeniden çizildiğinde mevcut cache kullanılarak satırlar tekrar etiketleniyor.
- Bu tur yalnız frontend güvenilirlik/polish değişikliğidir; backend veya LiveKit restart gerektirmez.
