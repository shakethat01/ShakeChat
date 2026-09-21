# ShakeChat v2.6

## Stable UI identities

- Sunucu ve kanal satırları DOM üzerinde gerçek `serverId` / `channelId` ile eşleştiriliyor.
- Kanal sağ-tık ve sürükle-bırak işlemleri aynı isimli kanallarda yalnız görünen ada bağımlı kalmıyor.
- Üye listesi, grup DM üyesi, DM profil kartı ve mesaj satırları mümkün olduğunda gerçek `userId` ile işaretleniyor.
- Kullanıcı sağ-tık menüsü tekrar açıldığında kullanıcı eşlemesi görünen ada daha az bağımlı oluyor; aynı görünen ada sahip kullanıcılar için yanlış kişiye işlem uygulamamak adına belirsiz eşleşme atlanıyor.
- Aktif sunucu değiştiğinde kimlik eşlemeleri yeniden tazeleniyor; DOM yeniden çizildiğinde mevcut cache kullanılarak satırlar tekrar etiketleniyor.

## Üye listesi / kullanıcı UX

- Sağdaki üye panelinde çevrimiçi ve çevrimdışı bölümleri artık tıklanarak daraltılıp açılabilir.
- Bölüm açık/kapalı durumları sunucu bazında localStorage üzerinde korunur; sunucu değiştirince birbirine karışmaz.
- Bölüm başlıkları klavye ile (`Enter` / `Space`) de kontrol edilebilir ve `aria-expanded` bilgisi taşır.
- Üye satırları kararlı `userId` işaretleri geldiğinde otomatik olarak ses durumu ile eşleştirilir.
- Ses kanalındaki kullanıcılar sağ panelde `SES`, konuşurken `KONUŞUYOR`, ekran paylaşırken `YAYIN` rozeti gösterir.
- Konuşan kullanıcı Forge/amber vurgusu ile daha hızlı ayırt edilir; yerel sessiz/mikrofon kapalı durumu daha düşük yoğunlukta gösterilir.
- Üye satırlarında sağ tık kullanıcı menüsü için tooltip bulunur.
- Uzun üye listeleri artık sağ panel içinde kendi kaydırma alanını kullanır.

Bu tur yalnız frontend güvenilirlik/polish değişikliğidir; backend veya LiveKit restart gerektirmez.
