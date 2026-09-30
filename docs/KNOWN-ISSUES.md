# ShakeChat — güncel sorun listesi

Son eşleştirme: **30 Eylül 2026**. Proje: `shakethat01/ShakeChat` (Discord benzeri sohbet uygulaması).

Bu dosya güncel takip kaydıdır. `KNOWN-ISSUES-1.9.10.md` ve `WORK-CHECKPOINT-1.9.10.md` tarihsel kayıtlardır. Kullanıcının sonraki olumlu test sonuçları korunmuştur; eski dosyada “test bekliyor” yazması kapanmış bir hatayı yeniden açmaz.

## Doğrulanmış devam noktası

- **Resmî sürüm 1.9.13 yayımlandı:** `app-v1.9.13`, `1c7ae2cf1b6caf484ca5d8de64653ca65461f9e8`; 29 Eylül 2026 **22:35 Türkiye saati**. [İndirme ve sürüm](https://github.com/shakethat01/ShakeChat/releases/tag/app-v1.9.13).
- **Windows doğrulaması tamam:** CI `36616633823`, 111 web + 71 API = **182 test**, 1 Rust testi, TypeScript, Cargo check, imzalı NSIS ve updater imzası başarılı. Test edilen `2d930547e5762cf67c7760c18eff2b1f5e6c671e` ile yayımlanan commit aynı kaynak ağacını içerir.
- **Sunucu da güncellendi:** Web/API Deploy `36619044733` ve Desktop Release `36619044813` başarılı. Native `/screen-token` endpoint'i için gereken API dağıtımı artık tamamdır.
- **Bu sürümde:** Windows ekranı + WASAPI sistem sesi; mevcut JS/RNNoise konuşma hattı korunur. Mikrofon izin toparlaması, native test izolasyonu, kendi yayın sesini geri oynatmama, yayıncı/izleyici eşlemesi, kesintisiz kaynak/kalite değişimi ve geç tamamlanan paylaşım temizliği eklendi. Konuşma bağlantısı kapanmış olsa da izin geri alınınca ayrı yayıncı kapatılır.
- Önceki resmî sürüm 1.9.12 idi (`9b76125a45141739e7de499dfa8a32a8e7417a19`). Eski 1.9.13 test kurulumu aynı sürüm numarasını taşıdığı için updater yeni paket göstermeyebilir; bu durumda resmî 1.9.13 kurulumunu kullan. 1.9.12 istemciler uygulama içinden güncellenebilir.

**Özet: 23 madde; 15'i önceki kullanıcı testleriyle kapalı, 8'i son kabul bekliyor.** Otomatik/derleme başarısı gerçek Windows ses/FPS ve etkilenen cihazdaki mikrofon izni testinin yerine geçmez.

**Durumlar:** “Kapalı” kullanıcı testinde doğrulanmış işlevdir. “Yayımlandı / kabul bekliyor” kod ve dağıtım doğrulanmış, sonraki kullanıcı kabulü alınmamış demektir. “1.9.13 doğrulaması” yeni native yolun ek kabulüdür; önceki çalışan yolun sonucunu silmez.

## Tam liste

| Kimlik | Sorun / istek | Güncel durum |
| --- | --- | --- |
| SC-01 | Mikrofon değişiminde `createMediaStreamSource` hatası ve ses kaybı | **Kapalı — kullanıcı testi.** Önceki düzeltme korunuyor. Mikrofon izni ayrı SC-22'de. |
| SC-02 | Mikrofon testinin diğer kişilere duyulması | **Kapalı — mevcut ses hattında kullanıcı testi.** 1.9.13'ün yeni WASAPI hattı da test izolasyonuna bağlandı; monitor başlamadan iki hat beklenir. Native kabul SC-21'de. |
| SC-03 | Sistem/oyun/müzik sesinin konuşmayı aşırı bastırması | **Kapalı — kullanıcı testi.** Native yolda AGC/NS/AEC kapalı, kendi yayın sesini geri oynatma engellendi. Yeni yakalamanın seviyesi gerçek cihazda karşılaştırılacak. |
| SC-04 | Konuşma ile yayın sesinin birlikte kısılması/susturulması | **Kapalı — kullanıcı testi.** Native teknik yayıncı da sahibinin ayrı yayın sesi ayarını kullanıyor. |
| SC-05 | Yayıncının mic/kulaklık kapatmasının giden yayın sesini kesmesi | **Kapalı — kullanıcı testi.** Native yayın da bağımsız; yalnız izole mikrofon testi paylaşım sesini geçici durdurur. |
| SC-06 | İlk ses kanalına girişte mikrofonun yanlış kapalı başlaması | **Kapalı — sonraki kullanıcı testi.** Kaydedilmiş mute/PTT tercihi korunur. İzin reddinde bilinçli dinleyici modu SC-22'dir. |
| SC-07 | Cihaz/mute tercihlerinin sıfırlanması | **Kapalı — sonraki kullanıcı testi.** Cihaz listesi boş veya izinsizken kayıtlı tercih silinmez. |
| SC-08 | Katılımcıların kaybolup gelmesi ve gereksiz ses bağlantısı yenileme | **Kapalı — sonraki kullanıcı testi.** Ayrı Socket.IO çevrimiçi renk titremesi SC-23'te. |
| SC-09 | Gürültü bastırma, VAD ve hece kaybı | **Kapalı — sonraki kullanıcı testi.** RNNoise konuşma hattı korunuyor; mic testinde de çift tarayıcı bastırması kaldırıldı. |
| SC-10 | Yayınları zorunlu izleme / bırakamama | **Kapalı — işlev kullanıcıda doğrulandı.** “İzlemeyi bırak” vardı; görünürlük sorunu SC-20'ye taşındı. Native yayında da görüntü/ses isteğe bağlı. |
| SC-11 | Gerçek FPS'nin düşük/yanlış gösterilmesi | **Kapalı — kullanıcı testi.** Native kendi önizlemesi uzaktan alındığı için alım istatistiği olarak etiketleniyor; hedef FPS gerçek FPS diye sunulmuyor. |
| SC-12 | Yayın üzerinden canlı çözünürlük/FPS ayarı | **Kapalı — kullanıcı testi.** 1.9.13'te native yakalama aynı track üzerinde güncellenir; görüntü boyutu gerçekten ölçeklenir. Arayüz SC-20. |
| SC-13 | Yayın sürerken ekran/pencere değiştirme | **Kapalı — kullanıcı testi.** Native seçici iptali eski yayını korur; kaynak değişimi aynı LiveKit yayınını kullanır. Native Windows kabulü bekler. |
| SC-14 | Ses kanalına tıklayınca onaysız geçiş | **Kapalı — kullanıcı testi.** Katılma/geçiş onayı korunuyor. |
| SC-15 | Kanala girmeden içeridekileri görememe | **Yayımlandı / kabul bekliyor.** Eski kullanıcı testinde başarısızdı; sonrasında yeni API dağıtımı 1.9.10–1.9.12 hattında tamamlandı. Artık “API hiç dağıtılmadı” diye izlenmez. Güncel istemci/sunucu üzerinde görünürlük teyidi gerekir. |
| SC-16 | Kanal giriş/çıkış sesi | **Kapalı — kullanıcı testi.** Native teknik yayıncı ikinci kişi gibi giriş/çıkış tonu üretmez. |
| SC-17 | Yayın açma/kapama ve izleyici bildirim sesi | **1.9.12 düzeltmesi yayımlandı / kabul bekliyor.** Yayın başlangıç sesi kanal sesinden bağımsızlaştırıldı. 1.9.13'te izleyici mesajı teknik yayıncı yerine sahibine gider; SID ve tekrar kontrolü korunur. |
| SC-18 | Sunucu sahibinin silememesi veya devredip ayrılamaması | **Yayımlandı / kabul bekliyor.** Sahiplik devri, ad yazarak silme ve API yetkileri mevcut. Son API dağıtımı sonrası kullanıcı kabulü kaydı bulunmadı. Sahip doğrudan ayrılmadan devretmeli ya da sunucuyu silmeli. |
| SC-19 | Uygulama penceresinin yeterince küçülememesi | **Yayımlandı / kabul bekliyor.** Alt sınır 720×480 yapıldı (`1b3863c`). Native kaynak seçici bu boyuta sığacak biçimde kaydırılır. |
| SC-20 | “İzlemeyi bırak” görünürlüğü ve yayın kalite/FPS kontrollerinin fazla göze batması | **Yayımlandı / görsel kabul bekliyor.** 1.9.10 sonrası CSS düzeltmeleri (`02a7c17`, `a2831b6`) resmî sürümlerde. Yeni native seçici de aynı küçük pencereyi destekliyor. |
| SC-21 | WebView2 ekran paylaşımı bandı; yerel Windows ekran/sistem sesi yakalaması | **1.9.13 yayımlandı / kabul bekliyor.** Native yakalama, ekran token'i ve sistem sesi mevcut. Kendi sesine abone olmama, test izolasyonu, sabit yayın SID'siyle kaynak/kalite değişimi, doğru ölçekleme/FPS zamanlaması, sonradan tamamlanan işlemleri iptal etme, tarayıcı izleyici uyumu, yetki iptali ve hata temizliği eklendi. Gerçek Windows + alıcı sesi/FPS kabulü açık. |
| SC-22 | Diğer kullanıcıların kanal/mikrofon ayarında `Permission denied` görmesi | **1.9.13 yayımlandı / kabul bekliyor.** Yerel mikrofon reddi yetkili kullanıcıyı kanaldan çıkarmaz; dinleme sürer. Türkçe açıklama, Windows ayarlarına geçiş ve uygulamanın önceki mikrofon izin kararını sıfırlayıp yeniden isteme eklendi. Sunucu/kanal rol yetkileri aşılmaz. Etkilenen Windows cihazında teyit bekler; cihazdaki izin kararının asıl nedeni uzaktan kesinleşmedi. |
| SC-23 | Kısa Socket.IO yeniden bağlantısında çevrimiçi üyelerin gri yanıp sönmesi | **1.9.12 düzeltmesi yayımlandı / kabul bekliyor.** `2c1d732` ve regresyon testleri. Eski ses oturumu SC-08'in kapanışını değiştirmez. |

## İlk 15 maddeyle eşleştirme

| Kullanıcının ilk numarası | Takip |
| --- | --- |
| 1 ve 14 | SC-10 |
| 2 | SC-11 |
| 3 | SC-12, arayüz SC-20 |
| 4 | SC-14 |
| 5 | SC-15 |
| 6 | SC-16 |
| 7 | SC-17 |
| 8 | SC-13 |
| 9 | SC-04 |
| 10 | SC-05 |
| 11 | SC-01; sonraki izin hatası SC-22 |
| 12 | SC-02 |
| 13 | SC-03 |
| 15 | SC-18 |

## Test aşamasında kalan kabul

1. Etkilenen Windows hesabı: mikrofon izni kapalıyken kanala girip diğerlerini dinleme; izin yeniden isteme; aynı odada mikrofonu açma. Gerçek rol yetkisi olmayan kullanıcı yine reddedilmeli.
2. Native paylaşım: bandın durumu, ekran ve pencere yakalama, sistem sesi seviyesi, çift oynatma/geri besleme, 720p/1080p ve FPS değişimi. Kaynak/kalite değişirken alıcı tekrar İzle'ye basmamalı.
3. Mikrofon testi: monitor açıkken hiçbir konuşma/test sesi karşıya gitmemeli; yayın görüntüsü sürmeli; test kapanınca sistem sesi geri gelmeli.
4. Güncel web ve masaüstü alıcı: isteğe bağlı izleme, ayrı ses sürgüleri, tek katılımcı, gerçek izleyici sayısı/bildirimi, ayrılma ve kaynak penceresini kapatma.
5. Yayımlanmış arayüz/API işleri: diğer kanalların üyeleri, sunucu devri/silme, küçük pencere, İzlemeyi bırak/kalite kontrolleri, yayın sesleri ve çevrimiçi renk titremesi.

İkinci insan olmadan otomatik/mantıksal kontroller yapılabilir; gerçek Windows yakalama ve karşıdan ses dinleme yerine geçtiği iddia edilmez. Otomatik sonuçlar ve dağıtım kanıtı `WORK-CHECKPOINT.md` dosyasında tutulur.

## Önceden kapanan diğer işler

- Uygulama içi güncelleme sorunu kapalıdır. Test ve resmî paket aynı sürüm numarasındaysa updater yeni paket göstermez; bu durum 1.9.11 numara artışıyla ele alındı.
- Turuncu konuşma göstergesi gecikmesi önceki kullanıcı testinde kapandı.
