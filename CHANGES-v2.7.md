# ShakeChat v2.7 — Hızlı Geçiş

Bu turda uygulamaya global **Hızlı Geçiş** katmanı eklendi.

## Yeni

- `Ctrl+K` / `Cmd+K` ile uygulamanın her yerinden Hızlı Geçiş açılır.
- Alanlar (sunucular), metin akışları, ses akışları ve özel mesajlar tek arama kutusunda aranır.
- Sonuçlar ad eşleşmesine göre önceliklendirilir; alan adı ve grup/akış bilgileri de aramaya dahildir.
- Klavye ile `↑` / `↓` seçme, `Enter` ile açma, `Esc` ile kapatma desteklenir.
- Sol alt Forge kısayolu Hızlı Geçişi fareyle de açar.
- Başka bir alandaki akış seçildiğinde önce ilgili alan açılır, ardından hedef akış güvenli biçimde bulunup seçilir.
- Birebir DM geçişinde kararlı `userId` eşlemesi kullanılır; grup DM'lerde başlık eşlemesi yedek yol olarak kullanılır.
- Yeni arayüz ShakeChat'in graphite / sıcak amber / mint tasarım dilini korur; Discord görsel düzeni kopyalanmaz.

## Teknik not

- Değişiklik yalnız frontend tarafındadır.
- Backend, Prisma, PostgreSQL, Redis, MinIO ve LiveKit'e dokunulmadı.
- Mevcut `DomIdentityBridge` tarafından eklenen kararlı `data-server-id` / `data-channel-id` işaretleri kullanılır; bunlar henüz hazır değilse güvenli DOM yedek eşlemesi devreye girer.
- Hızlı Geçiş yalnız oturum açıkken ve `.app-shell` mevcutken görünür.
