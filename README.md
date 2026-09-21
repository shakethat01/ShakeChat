# ShakeChat v1.8 — özel arkadaş grubu iletişim uygulaması

ShakeChat, küçük bir arkadaş grubu için geliştirilen özel gerçek zamanlı iletişim uygulamasıdır. React/Vite + NestJS + Prisma/PostgreSQL + Socket.IO + Redis + MinIO + LiveKit mimarisi kullanılır. v1.0 ile uygulama ayarları, özgün görünüm profilleri, arayüz yoğunluğu, erişilebilirlik tercihleri ve kamera/ekran paylaşımı kalite profilleri eklendi. Arayüz başka bir ürünün tema, renk, menü geometrisi veya marka dilini birebir kopyalamak yerine ShakeChat’e ait görsel sistemi korur.

## v0.4 ile gelenler

- Kullanıcı adıyla arkadaşlık isteği gönderme
- Gelen isteği kabul/ret, gönderilen isteği iptal etme
- Arkadaş listesinden çıkarma
- Arkadaşların gerçek çevrimiçi/çevrimdışı durumu
- Sol üst ShakeChat düğmesinden **Arkadaşlar / Özel Mesajlar** alanı
- Arkadaşla tek tıkla birebir özel mesaj (DM) başlatma
- Birebir DM geçmişinin PostgreSQL'de kalıcı tutulması
- DM mesajlarının Socket.IO ile anlık iletilmesi
- DM için `yazıyor…` göstergesi ve reconnect sonrası geçmiş tamamlama
- DM erişiminde backend üyelik kontrolü; konuşmaya dahil olmayan kullanıcı okuyamaz/yazamaz/Socket.IO odasına katılamaz
- Yeni mesaj geldiğinde konuşma listesinin gerçek zamanlı yenilenmesi
- Arkadaşlık isteği spam'ine basit bellek-içi rate limit

v0.3'teki sunucu davetleri, üyelik yönetimi, kick/leave ve kanal güvenliği aynen korunur.

## v0.3 kurulumunu v0.4'e yükseltme

**Mevcut proje klasörünün adını değiştirme.** Docker Compose proje adı değişirse farklı volume kullanılabilir.

1. `npm run dev` çalışan terminalde `Ctrl+C` yap.
2. Mevcut ShakeChat klasörünün yedeğini al.
3. v0.4 paketindeki `guncelleme` klasörünün **içindekileri** mevcut ShakeChat klasörünün üzerine kopyala.
4. Docker Desktop açık kalsın.
5. PowerShell'de mevcut ShakeChat klasöründe:

```powershell
npm install
npm run db:generate
npm run db:migrate:v04
npm run typecheck
npm run build
npm test
npm run dev
```

`db:migrate:v04`, v0.3 `Invite` migration'ını korur ve yalnızca v0.4 için gereken `FriendRequest`, `Friendship`, `DirectMessageConversation`, `DirectMessageMember` ve `DirectMessage` tablolarını ekler. Mevcut kullanıcı, sunucu, kanal, davet ve mesaj verilerini silmez.

**Şunları çalıştırma:** `docker compose down -v`, `prisma migrate reset` veya veri kaybı isteyen herhangi bir reset komutu.

Web: http://localhost:5173  
API: http://localhost:4000/api

## v0.4 manuel test

1. İki farklı hesapla giriş yap.
2. Sol üstteki **S** düğmesine basıp Arkadaşlar ekranını aç.
3. Hesap A'dan hesap B'nin kullanıcı adına arkadaşlık isteği gönder.
4. B'nin ekranında gelen istek yenileme yapmadan görünmeli; kabul et.
5. İki kullanıcı da birbirini arkadaş listesinde görmeli ve online durumu doğru görünmeli.
6. **Mesaj** düğmesine bas; birebir DM açılmalı.
7. A mesaj gönderdiğinde B'de F5 olmadan görünmeli; B cevap verdiğinde A'da anında görünmeli.
8. Yazmaya başlayınca karşı tarafta `yazıyor…` çıkmalı ve yazmayı bırakınca kaybolmalı.
9. Bir pencereyi kapatıp tekrar aç; DM geçmişi PostgreSQL'den geri gelmeli ve mesajlar çiftlenmemeli.
10. Üçüncü bir hesap, başka iki kullanıcının DM conversation ID'siyle REST veya Socket.IO üzerinden erişememeli.
11. Arkadaşlık isteği iptal/ret ve arkadaşlıktan çıkarma iki tarafta da gerçek zamanlı yenilenmeli.

## Bilinen kapsam sınırları

- v0.4 yalnızca **birebir DM** içerir; grup DM sonraki sürüme bırakıldı.
- DM unread/mention sayaçları henüz yok.
- Arkadaşlık rate limit'i tek NestJS sürecinin belleğindedir; çoklu API instance için Redis'e taşınmalıdır.
- Roller için tam permission editor henüz yoktur.
- Ses kanalı modeli ve LiveKit altyapısı mevcut olsa da mikrofon/ses UI'sı henüz bağlanmadı.
- Dosya yükleme, ekran paylaşımı ve gelişmiş bildirimler sonraki sürümlerdedir.
- Kanal ve DM geçmişi şimdilik son 100 mesajla sınırlıdır.

Ayrıntılar `CHANGES-v0.4.md`, `UPGRADE-v0.4.txt` ve `TEST-REPORT-v0.4.md` dosyalarındadır.

## v0.5 — Roller ve yetkiler

v0.5 ile sunucu rolleri ve backend tarafından zorlanan izin sistemi eklendi. Sunucu sahibi/yetkili kullanıcılar özel roller oluşturabilir, üyelere rol atayabilir, rol izinlerini düzenleyebilir ve kanal bazında rol override'ları tanımlayabilir. Mesaj gönderme/görme, kanal yönetimi, davet yönetimi, üye çıkarma ve başkasının mesajını silme kontrolleri frontend'e güvenmeden API/WebSocket katmanında uygulanır.

Sürüm yükseltmesinde `npm run db:generate` ve `npm run db:migrate:v05` çalıştırılmalıdır. Veritabanını resetlemeyin.

## v0.6 — LiveKit ses kanalları

v0.6 ile VOICE kanalları gerçek LiveKit odalarına bağlandı. Ses kanalına tıklayınca backend, mevcut rol ve kanal izinlerini kontrol ederek kısa ömürlü bir LiveKit tokenı üretir. Kullanıcılar mikrofon aç/kapat, deafen, mikrofon/hoparlör cihazı seçimi ve aktif konuşan göstergesiyle sesli görüşebilir. `CONNECT_VOICE` ve `SPEAK` değişiklikleri bağlı LiveKit katılımcısına da uygulanır.

v0.6 Prisma şemasını değiştirmez; migration gerekmez. Yükseltmede `npm install`, `npm run typecheck`, `npm run build` ve `npm test` çalıştırılmalıdır. Yerel Docker kurulumu mevcut `devkey / devsecret-change-me` LiveKit ayarlarıyla varsayılan olarak çalışır.

## v0.7 — Kamera ve ekran paylaşımı

v0.7 ile LiveKit voice odaları görüntülü görüşmeye genişletildi. Kullanıcılar ses kanalında kamera açıp kapatabilir, kamera cihazını seçebilir ve ekran/pencere/sekme paylaşabilir. Kamera ve ekran akışları aynı voice stage üzerinde dinamik grid olarak gösterilir. Kamera ve ekran paylaşımı mevcut `SPEAK`/LiveKit publish yetkisine bağlıdır; yeni Prisma migration yoktur.

## v0.8
Sunucu metin kanallarında MinIO dosya/medya yükleme, yanıt, düzenleme, tepki ve sabitleme desteği eklendi. Ayrıntılar `CHANGES-v0.8.md` içinde.


## v0.9 — ShakeChat kimliği, mention, okunmamışlar ve arama

v0.9, mevcut özelliklerin üstüne özgün bir ShakeChat görsel dili ve günlük kullanım özellikleri ekler:

- Grafit/orman koyusu zemin, sıcak amber vurgu ve mint durum rengi kullanan özgün tema
- Yuvarlak Discord sunucu ikon dizisini taklit etmeyen squircle/sekme biçimli alan dock'u
- `@kullanıcı` mention vurgusu ve yazarken üye önerileri
- Kanal/akış başına okunmamış mesaj ve mention sayaçları
- İsteğe bağlı tarayıcı masaüstü bildirimleri
- Erişilebilen yazı akışlarında sunucu-geneli mesaj arama
- Görünen ad, avatar URL, kısa durum ve Uygun/Odak/Uzakta profil modları
- Kanal/akışları bölüm etiketi altında gruplama ve sıralama
- Yetki kontrollü arama, okunmamış ve kanal düzenleme API'leri

v0.9 Prisma şemasını değiştirir. Yükseltmede `npm run db:generate` ve `npm run db:migrate:v09` çalıştırılmalıdır. Migration kullanıcı, mesaj veya mevcut kanal verilerini silmez; yalnızca profil/durum alanlarını, akış bölüm alanını ve okundu durum tablosunu ekler.

**Veritabanını resetlemeyin.** `prisma migrate reset` veya `docker compose down -v` bu yükseltme için gerekli değildir.


## v1.0 — ürünleştirme, görünüm ve medya kalitesi

v1.0 yeni bir veritabanı özelliği eklemek yerine çalışan v0.9 tabanını ürün seviyesinde cilalar. Kullanıcı çubuğundaki uygulama ayarlarından Köz/Gelgit/Grafit görünüm profili, Rahat/Sıkı yoğunluk ve hareket azaltma seçilebilir. Ses & görüntü bölümünde kamera için 720p30–1080p60; ekran paylaşımı için 720p30–1440p60 hedef profilleri ile gürültü azaltma, yankı engelleme ve otomatik kazanç tercihleri bulunur.

İlk uygulama yüklemesine markalı loading/error yüzeyi de eklendi. Ayarlar tarayıcıda yerel saklanır. **v1.0 Prisma migration içermez.** Ayrıntılar `CHANGES-v1.0.md`, `ONCE-OKU-v1.0.md` ve `TEST-REPORT-v1.0.md` dosyalarındadır.


## v1.0.1 — yüksek kaliteli ekran paylaşımı

v1.0.1 ekran paylaşımı profillerini yalnızca capture isteği olmaktan çıkarıp LiveKit publish encoding katmanına da bağlar. Kaynak/native, 1080p 120/144 FPS ve 2K/1440p 120/144 FPS profilleri eklenmiştir. Yüksek FPS profilleri hareket akıcılığını, çözünürlük odaklı profiller görüntü netliğini önceliklendirir. Uzak ekran paylaşımlarında yüksek çözünürlük/FPS katmanı açıkça talep edilir; video kartında tarayıcının gerçekten sağladığı çözünürlük ve FPS gösterilir. Tarayıcı/GPU/WebRTC encoder/ağ sınırları hedef değerden daha düşük gerçek değer üretebilir. Prisma migration yoktur.

## v1.1 — moderasyon ve özel sohbetlerin tamamlanması

v1.1, medya katmanını değiştirmeden moderasyon ve özel sohbet akışlarını güçlendirir:

- Sunucu düzeyinde `BAN_MEMBERS` izni, yasaklı kullanıcı listesi, neden kaydı ve yasak kaldırma
- Yasaklanan üyenin sunucudan anında çıkarılması ve aktif davet koduyla yeniden katılmasının backend'de engellenmesi
- Kullanıcı engelleme / engeli kaldırma; engelleme arkadaşlığı ve bekleyen istekleri temizler
- Engellenen birebir DM geçmişi görünür kalır fakat yeni mesaj gönderilemez
- 3–9 kişilik grup özel sohbetleri (oluşturan kişi + 2–8 arkadaş)
- DM'lerde sunucu mesajlarıyla aynı temel mesaj araçları: yanıt, düzenleme, tepki, sabitleme, kendi mesajını silme
- DM'lerde MinIO dosya/medya yükleme, sürükle-bırak ve yapıştırma
- DM güncelleme/silme olaylarının Socket.IO ile açık konuşmaya gerçek zamanlı yayılması

v1.1 Prisma migration içerir. Yükseltmede `npm run db:generate` ve `npm run db:migrate:v11` çalıştırılmalıdır. Migration mevcut kullanıcı, sunucu, mesaj, arkadaşlık veya DM geçmişini silmez.

**Veritabanını resetlemeyin.** `prisma migrate reset` ve `docker compose down -v` bu yükseltmenin parçası değildir.

## v1.2 — hesap güvenliği ve gizlilik

v1.2, çalışan v1.1.1 tabanının üstüne hesap/oturum güvenliği ve kullanıcı gizlilik kontrolleri ekler:

- Şifre değiştirme; mevcut şifre backend'de doğrulanır
- Şifre değişince önceki JWT sürümleri geçersiz olur ve kullanıcı yeni bir erişim tokenı alır
- “Diğer oturumları geçersiz kıl” işlemi ile eski cihaz/token oturumlarını iptal etme
- HTTP `AuthGuard` ve Socket.IO bağlantılarında `authVersion` doğrulaması
- Açık WebSocket oturumlarının da paket sırasında ve periyodik olarak oturum sürümünü yeniden doğrulaması
- 401 alan istemcinin yerel oturumu kapatıp giriş ekranına dönmesi
- Arkadaşlık isteği gizlilik seçenekleri: Herkes / yalnızca ortak alan üyeleri / hiç kimse
- Grup DM davetlerini kapatma tercihi
- Hesap ve Gizlilik sekmelerinin ShakeChat uygulama ayarlarına eklenmesi

v1.2 Prisma migration içerir. Yükseltmede `npm run db:generate` ve `npm run db:migrate:v12` çalıştırılmalıdır. Migration yalnızca `User` tablosuna güvenlik/gizlilik alanları ekler ve yeni `FriendRequestPolicy` enum'unu oluşturur; mevcut kullanıcı, sunucu, mesaj, dosya veya DM verilerini silmez.

**Veritabanını resetlemeyin.** `prisma migrate reset` ve `docker compose down -v` bu yükseltmenin parçası değildir.

## v1.3 — bildirimler, okunmamış yönetimi ve kamera durum düzeltmesi

v1.3 DM okunmamış durumunu `DirectMessageMember.lastReadAt` üzerinden kalıcı hale getirir; konuşma bazlı rozetler, ana dikkat rozeti, sekme başlığı sayacı, DM masaüstü bildirimi, bildirimden doğru konuşmaya geçiş ve alan/DM için toplu okundu işlemleri ekler. Arka planda açık duran içerik artık otomatik okunmuş sayılmaz; pencere yeniden odaklanınca aktif içerik okundu işaretlenir.

Aynı sürüm, LiveKit kamera kapatıldıktan sonra publication track nesnesinin muted halde kalmasından doğan siyah kamera tile'ı ve yanlış `Kamerayı kapat` ikon durumunu düzeltir. Aktif kamera/ekran durumu artık yalnızca track varlığına değil publication'ın muted durumuna da bakar.

v1.3 Prisma migration içerir. `npm run db:generate` ve `npm run db:migrate:v13` çalıştırılmalıdır. Migration mevcut verileri silmez.


## v1.4 — ses kullanım kontrolleri

v1.4 ses kanalındaki günlük kullanımı tamamlar. Uygulama ayarlarının **Ses & görüntü** bölümüne `Ses algılama` ve `Bas-konuş` giriş modları eklenir. Bas-konuş modunda varsayılan tuş `` ` `` (Backquote) olup kullanıcı istediği klavye tuşunu arayüzden kaydedebilir. Mikrofon yalnızca seçilen tuş basılı tutulurken yayınlanır ve tuş bırakıldığında tekrar kapanır. Pencere odağını kaybederse takılı kalmış mikrofonu önlemek için bas-konuş otomatik bırakılır.

Ses kanalındaki uzak katılımcılar için kişi bazlı **0–100% yerel ses seviyesi** ve **yalnızca sende susturma** kontrolü eklenir. Ses seviyesi bu tarayıcıda saklanır; sunucudaki kullanıcının mikrofonuna veya diğer dinleyicilere müdahale etmez. Global sağırlaştırma kişi bazlı sessize alma durumlarını ezmez.

v1.4 yalnızca web istemcisini değiştirir; Prisma migration veya yeni paket bağımlılığı yoktur. v1.3 kamera kapatma düzeltmesi ve v1.3.2 unread test düzeltmesi korunur.

## v1.5
Sunucu moderasyon işlem geçmişi: kick / ban / unban audit kayıtları, neden ve zaman bilgisi, yetki kontrollü görüntüleme ve filtreleme.


## v1.6
Süreli sunucu yazma kısıtları, `MODERATE_MEMBERS` izni ve audit entegrasyonu eklendi.


## v1.7
Yazı akışlarına sunucu taraflı yavaş mod eklendi. Akış düzeninden mesaj aralığı seçilebilir; normal üyeler süre dolmadan yeni metin veya dosyalı mesaj gönderemez. Moderasyon için ADMINISTRATOR / MANAGE_MESSAGES kullanıcıları muaftır.


## v1.8
Yazı akışlarına backend kontrollü kanal kilidi ve `MANAGE_MESSAGES` yetkili moderatörler için son 2–100 mesajı toplu temizleme aracı eklendi. Kilit normal kullanıcıların metin, dosya ve typing göndermesini engeller; moderasyon yetkilileri duyuru yazmaya devam edebilir. Kilit değişiklikleri açık istemcilere gerçek zamanlı bildirilir. v1.8 migration yalnızca `Channel.isLocked` alanını ekler.

## v1.9
v1.8 moderasyon özellikleri ürün cilasıyla tek araç kutusunda birleştirildi. Kanal başlığındaki **Moderasyon araçları** paneli slow mode, kanal kilidi, toplu mesaj temizleme ve izin varsa kanal silme işlemlerini tek yerde sunar. Destructive/async kanal işlemlerinde çift tetiklemeyi önleyen istemci kilidi, sağ altta başarı/hata toast sistemi ve daha görünür `Canlı / Bağlanıyor` bağlantı durumu eklendi. v1.9 migration ve yeni dependency içermez.
