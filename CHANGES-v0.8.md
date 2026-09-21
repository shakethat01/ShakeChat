# ShakeChat v0.8

- MinIO tabanlı gerçek dosya yükleme eklendi.
- Kanal mesajlarına resim/video/dosya eki eklenebilir.
- Sürükle-bırak ve panodan görsel yapıştırma eklendi.
- Tek dosya 25 MB, mesaj başına en fazla 10 dosya.
- Dosya adı depolama anahtarı olarak kullanılmıyor; rastgele UUID object key üretiliyor.
- MIME türü ve boyut kontrolleri backend'de yapılıyor.
- Mesaja gerçek reply ilişkisi eklendi.
- Kendi mesajını düzenleme ve `(düzenlendi)` göstergesi eklendi.
- Emoji reaction altyapısı eklendi. İlk hızlı reaction 👍; mevcut reaction'a tıklamak kaldırır.
- `MANAGE_MESSAGES` yetkisiyle mesaj sabitleme/kaldırma eklendi.
- Mesaj güncellemeleri Socket.IO ile diğer istemcilere anlık yayılıyor.
- Mesaj silinince MinIO'daki bağlı objeler de temizleniyor.
- Resim önizleme, video player ve diğer dosyalar için indirme/açma kartı eklendi.

Not: v0.8 bu özellikleri sunucu metin kanallarında uygular. DM medya özellikleri sonraki cilalama sürümüne bırakıldı.
