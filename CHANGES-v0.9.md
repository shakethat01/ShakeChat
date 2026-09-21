# ShakeChat v0.9 — değişiklikler

## 1. ShakeChat'e ait özgün arayüz kimliği

v0.9 ile ana arayüzün görsel dili yeniden ele alındı. Amaç başka bir sohbet ürününün görünümünü birebir taklit etmek değil, ShakeChat'in kendi sistemini oluşturmaktır.

- grafit / koyu orman tonlarında ana zemin
- sıcak amber ana vurgu, mint durum rengi
- yüzen, geniş radiuslu panel/kart geometrisi
- daire sunucu ikon dizisi yerine asimetrik squircle/sekme biçimli alan dock'u
- farklı aktif akış, okunmamış, mention, profil ve ayar kartları
- menü dilinde `Alan`, `Akış`, `Bölüm` gibi ShakeChat terminolojisi

Not: Bu tasarım yaklaşımı benzerlik riskini azaltmak için kasıtlı olarak ayrıştırılmıştır; hukuki/telif garantisi değildir.

## 2. Mention sistemi

- Mesajlarda `@kullanici` parçaları ayrı vurgulanır.
- Kullanıcının kendisine yapılan mention daha belirgin görünür.
- Mesaj yazarken `@` + kullanıcı adı başlangıcı girildiğinde erişilebilir kanal üyeleri önerilir.
- Realtime aktivite olayı mention bilgisini alıcı bazında hesaplar.

## 3. Okunmamış mesaj ve mention sayaçları

- Yeni `ChannelReadState` modeli kanal başına son okunma zamanını tutar.
- Aktif yazı akışı otomatik olarak okundu işaretlenir.
- Diğer akışlarda yeni mesaj sayısı görünür.
- Mention sayısı normal unread sayısından ayrı ve daha belirgin rozetle gösterilir.
- Alan dock'unda alan toplam aktivitesi özetlenir.
- `VIEW_CHANNEL` izni olmayan kanallardan sayaç/aktivite sızdırılmaz.

## 4. Masaüstü bildirimleri

- Profil kartından isteğe bağlı açılır/kapatılır.
- Tarayıcı izni kullanıcı etkileşimiyle istenir.
- Sekme gizliyken veya pencere odakta değilken yeni mesaj bildirimi gösterilebilir.
- Ayar sadece o tarayıcıda `localStorage` ile tutulur.

## 5. Mesaj arama

- Aktif alandaki erişilebilir TEXT akışlarında sunucu-geneli arama.
- Minimum 2, maksimum 80 karakter sorgu.
- En fazla 50 sonuç.
- Arama backend'de yalnızca `VIEW_CHANNEL` yetkisi olan kanalları kapsar.
- Sonuca tıklanınca ilgili akış açılır ve mesaj mevcut 100 mesajlık geçmiş içindeyse vurgulanır.

## 6. Profil kartı ve durum

Kullanıcı profiline şunlar eklendi:

- görünen ad
- avatar URL
- kısa durum metni
- `AVAILABLE` / `FOCUS` / `AWAY` profil modu

Yeni endpoint'ler:

- `GET /api/auth/me`
- `PATCH /api/auth/me`

Şifre hash'i ve e-posta güvenli kullanıcı cevabından çıkarılır.

## 7. Akış gruplama ve sıralama

- Kanallara opsiyonel `groupName` alanı eklendi.
- Alan ayarlarında `Akış düzeni` bölümü eklendi.
- Akışlar yukarı/aşağı taşınabilir.
- Aynı bölüm etiketine sahip akışlar sol menüde birlikte gösterilir.
- Düzenleme `MANAGE_CHANNELS` ile backend'de zorlanır.

## 8. Realtime aktivite

`message:new` korunur. Buna ek olarak alıcıya özel `channel:activity` olayı gönderilir. Olay yalnızca ilgili kullanıcı kanalı görebiliyorsa gönderilir ve bildirim için kısa preview + mention bayrağı taşır. Aktivite üretimindeki ikincil bir hata normal mesaj teslimatını engellemez.

## Veritabanı

v0.9 gerçek Prisma migration içerir:

`apps/api/prisma/migrations/20260909184500_v09_identity_activity/migration.sql`

Eklenenler:

- `ProfileMode` enum
- `User.statusText`
- `User.profileMode`
- `Channel.groupName`
- `ChannelReadState`

Mevcut mesaj, kullanıcı, rol, davet, arkadaşlık ve medya tabloları silinmez.
