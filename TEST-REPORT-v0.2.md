# ShakeChat v0.2 test raporu

## Başlangıç durumu

Kaynak: mevcut `shakechat-v0.2-full.zip`. 42 dosyanın kaynakları, package.json dosyaları, Prisma şeması, Docker Compose, NestJS modülleri ve frontend incelendi. `shakechat-v0.2-upgrade.zip` ve v0.1 kaynakları da güncelleme dosyalarının uyumluluğu için kullanıldı.

Değişiklik öncesi `npm install`, Prisma generation ve API + web production derlemesi başarılıydı. İlk API başlatma denemesi bu ortama özgü eksik DATABASE_URL nedeniyle başlayamadı. Docker kurulu değildi. Çalışan kullanıcı bilgisayarına veya kullanıcı veritabanına erişilmedi.

## Sonuçlar

| Kontrol | Sonuç |
|---|---|
| Prisma Client generation | Geçti — Prisma 6.19.3 |
| API ve frontend TypeScript kontrolü | Geçti |
| NestJS ve Vite production build | Geçti |
| NestJS/Socket.IO otomatik testleri | 5/5 geçti |
| React hook ve arayüz testleri (JSDOM) | 9/9 geçti |
| Gerçek NestJS + Prisma + ayrı PGlite ile kayıt/giriş | Geçti |
| İki farklı JWT hesabıyla karşılıklı Socket.IO mesajları | Geçti |
| Sunucu, TEXT ve VOICE veri kayıtları | Geçti |
| Mesajın ORM üzerinden okunması | Geçti |
| Test veritabanı kapatılıp yeniden açılınca mesaj | Korundu |
| Prisma şeması, Docker Compose, LiveKit config karşılaştırması | Değişmedi |
| Windows 11 / Docker PostgreSQL 16 çalıştırma | Bu ortamda yapılmadı |
| İki gerçek tarayıcı oturumunda uçtan uca test | Tamamlanamadı |
| Canlı ses görüşmesi veya ekran paylaşımı | v0.2 kapsamında değil |

PGlite kontrolü, Docker/PostgreSQL 16 ortamına eşdeğer bir test iddiası değildir. Testte uygulamanın gerçek PrismaClient'ı test modülü içinde `pglite-prisma-adapter@0.6.1` ile bağlandı. Üretim PrismaService kodu ve şeması değiştirilmedi. Şemanın SQL'i `prisma migrate diff --from-empty` ile üretildi; test verileri yalnızca geçici ortamda tutuldu. [PGlite belgeleri](https://pglite.dev/docs/).

Tarayıcı önizlemesi, çalışma alanı sınırı nedeniyle monorepo kökündeki Vite bağımlılığına erişemedi. Çalışan mimariyi önizleme için değiştirmek yerine tarayıcı testi eksik olarak kaydedildi. JSDOM kontrolleri gerçek tarayıcı oturumu testinin yerine geçmiş sayılmıyor.

## Otomatik test kapsamı

1. Tek mesaj olayı, ayrı kanallar, bağlantı kopması ve yeniden bağlanma.
2. Yazıyor bilgisinin stop olayı olmadan sona ermesi; kanal terk etme ve bağlantı kapanması.
3. Bir hesapta iki bağlantı; biri kapanınca çevrimiçi kalma, sonuncuda çevrimdışı olma.
4. Geçersiz/süresi dolmuş JWT, silinmiş kullanıcı, üye olmayan hesap, bozuk kanal ID'si, ses kanalına mesaj, boş/çok uzun mesaj reddi.
5. 110 mesaj içinde en yeni 100 kaydın kronolojik getirilmesi.
6. Geçmiş yüklenirken gelen olayların korunması ve aynı mesajın çift gösterilmemesi.
7. Kanal değişince önceki isteğin veya geç dönen gönderim yanıtının yeni kanala karışmaması.
8. Yeniden bağlantıda odaya katılıp kaçırılan geçmişi çekme.
9. İstemcide yazıyor süresi dolması ve kişinin kendi yazıyor olayını göstermeme.
10. Mesaj sıralama/ID bazlı birleştirme.
11. Sunucu modalının oluşturma servisine bağlanması.
12. Ses kanalı düğmesinin VOICE seçili açılması ve kaydetmesi.
13. Çok satırlı taslak, Shift+Enter, Enter ile gönderme.
14. Gerçek üyelerden çevrimiçi/çevrimdışı sayaçları.

## Windows'ta elle test

1. Normal pencere ve gizli pencerede aynı hesabı açın; aynı metin kanalını seçin. İki yönde mesaj gönderin. Yenilemeden görünmeli, çift kayıt olmamalı.
2. Bir oturumu başka kanala geçirin. Eski kanaldaki yeni mesaj bu kanala karışmamalı. Sonra geri dönün.
3. Bir oturumda bağlantıyı kısa süre kesin; diğerinden mesaj gönderin. Bağlantı dönünce kaçırılan mesajlar gelmeli.
4. Shift+Enter ile iki satır yazın; Enter ile gönderin; sayfayı yenileyip satırların ve mesajın korunduğunu görün.
5. İki sekmeden birini kapatın; diğerinde hesabınız çevrimiçi kalmalı.
6. Aynı sunucuya üye iki FARKLI hesabınız varsa yazıyor göstergesini ve son bağlantı kapanınca çevrimdışı durumunu kontrol edin. Aynı hesap iki oturumda kendi yazıyor göstergesini görmez.
7. Sunucu ve metin/ses kanalı oluşturun. Escape, İptal ve başarısız giriş doğrulamalarını kontrol edin.
8. Mesaj üzerine gelince kopyalama ve alıntılama düğmelerini deneyin.
9. API'yi durdurup mesaj göndermeyi deneyin; taslak korunmalı. API döndüğünde bağlantı yeniden kurulmalı.

Mevcut paketlerde lint yapılandırması yoktu. Ayrı bir lint sistemi eklenmedi; TypeScript, production build ve davranış testleri çalıştırıldı.
