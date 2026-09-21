# ShakeChat v2.3 — sidebar categories

- Kanal kategorileri artık Discord benzeri şekilde tıklanarak daraltılıp açılabiliyor.
- Daraltılmış kategori durumu tarayıcıda saklanıyor ve yenilemeden sonra korunuyor.
- Kategori başlığına sağ tık menüsü eklendi: aç/daralt, okundu işaretle, kategori adını değiştir, aynı kategori içinde metin veya ses akışı oluştur.
- Okunmamış mesaj bulunan kategoriler başlıkta amber durum noktası gösteriyor.
- Kanal sürükle-bırak akışı state yerine ref tabanlı hale getirildi; sürükleme sırasında event listener yeniden kurulumu kaldırıldı.
- Farklı tipteki varsayılan kategoriler arasında sürüklemede hedef kategori adı korunuyor.
- Sidebar MutationObserver yalnızca DOM çocuk değişikliklerini izliyor; class değişikliklerini izleyip kendi kendini tetikleme ihtimali kaldırıldı.
