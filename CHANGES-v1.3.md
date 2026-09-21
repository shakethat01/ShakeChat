# ShakeChat v1.3 — Bildirimler, Okunmamış Yönetimi ve Kamera Düzeltmesi

v1.3, çalışan v1.2 tabanını bozmadan masaüstü bildirimlerini/okunmamış yönetimini tamamlar ve kamera kapatma durumundaki siyah görüntü hatasını düzeltir.

## Kamera düzeltmesi

Önceki sürümde LiveKit kamerayı kapatırken yayın kaydı/track nesnesi bazı durumlarda bellekte kalıyor fakat `muted` duruma geçiyordu. Arayüz yalnızca `publication.track` var mı diye baktığı için:

- görüntü siyaha dönüyor,
- kamera kartı ekranda kalıyor,
- kamera düğmesi hâlâ `Kamerayı kapat` durumunu gösteriyordu.

v1.3 artık medya yayınını **track var + publication muted değil** koşuluyla aktif sayar. Kamera kapatıldığında tile kaldırılır, katılımcı kamera işareti temizlenir ve düğme tekrar `Kamerayı aç` durumuna döner. Aynı koruma ekran paylaşımı publication durumuna da uygulanır.

## DM okunmamışları

- `DirectMessageMember.lastReadAt` eklendi.
- DM okunmamış sayısı backend'de kullanıcı/konuşma bazında hesaplanır.
- Tarayıcı kapalıyken gelen mesajlar sonraki girişte de okunmamış kalır.
- Bir DM açıldığında backend'de okundu zamanı güncellenir.
- Özel mesaj listesinde konuşma başına okunmamış rozeti gösterilir.
- Ana ShakeChat düğmesinde DM + gelen arkadaşlık isteği dikkat rozeti gösterilir.
- `Tüm özel mesajları okundu işaretle` kontrolü eklendi.

## Bildirim ve masaüstü cilası

- Arka plandaki aktif kanal/DM artık yanlışlıkla okundu sayılmaz; pencere gerçekten odaktaysa okundu kabul edilir.
- Pencereye dönüldüğünde aktif kanal veya DM otomatik okundu işaretlenir.
- Masaüstü DM bildirimleri eklendi.
- Bildirime tıklayınca ilgili kanal veya DM açılır ve pencere öne gelir.
- Tarayıcı sekme başlığı toplam dikkat sayısını gösterir: `(N) ShakeChat`.
- Aktif alandaki tüm okunmamış metin akışlarını tek düğmeyle temizleme eklendi.
- `Ctrl/Cmd + K`: mevcut alanda mesaj arama.
- `Ctrl/Cmd + ,`: uygulama ayarlarını açma.
- DM edit/reaction/pin gibi güncellemeler yeni mesaj olarak sayılmaz; realtime event'lerine `kind` ayrımı eklendi.

## Veri modeli

`DirectMessageMember` modeline:

- `lastReadAt DateTime @default(now())`
- `@@index([userId, lastReadAt])`

eklendi.

Migration mevcut DM mesajlarını veya üyelikleri silmez. Mevcut üyelikler migration anında okundu kabul edilir; yalnızca bundan sonra gelen mesajlar yeni okunmamış sayacına girer.
