# ShakeChat v2.4

## Sidebar / Discord-style navigation

- Kategori başlıkları artık klavye ile de açılıp kapanabilir (`Enter` / `Space`) ve `aria-expanded` durumunu taşır.
- İlk görünür okunmamış kanalın üstünde Forge temalı `YENİ` ayıracı gösterilir.
- Daraltılmış kategoriler okunmamış içerik varsa amber/turuncu durum noktası göstermeye devam eder.
- Kanal sürükle-bırak artık doğrudan kategori başlığına bırakmayı destekler; böylece kanal başka kategoriye tek hareketle taşınabilir.
- Kategori hedefi sürükleme sırasında belirgin Forge vurgusu gösterir.
- Drag state React state yerine ref tabanlı tutulmaya devam eder; sidebar dekorasyon observer'ı yalnız DOM child-list değişikliklerini izler. Bu, önceki UI kilitlenmesi riskini azaltır.
- Varsayılan `Sohbet` / `Ses Alanı` gruplarına bırakmada gereksiz özel `groupName` oluşturulmaz; farklı tipte bir kanal bilinçli olarak o kategoriye taşınırsa kategori adı korunur.

Bu tur backend veya LiveKit bağlantı akışını değiştirmez.