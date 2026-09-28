# ShakeChat — Birleşik sorun listesi ve 1.9.10 durumu

İlk kayıt: 27 Eylül 2026  
Son güncelleme: 28 Eylül 2026  
Kapsam: Discord benzeri ShakeChat sesli/yazılı sohbet uygulaması.

**Kalan geliştirmeler 1.9.10 test dalında uygulandı.** Yeni kontroller ile önceki ses düzeltmeleri aynı pakette toplandı. Yerelde **95 web + 68 API = 163 test**, TypeScript kontrolleri ve üretim derlemeleri geçti. Windows CI da tüm testleri, Cargo kontrolünü ve imzalı NSIS paketlemesini başarıyla tamamladı. Gerçek Windows cihazı, karşılıklı dinleme ve hareketli sahnede FPS kabulü henüz yapılmadı; bu nedenle bütün kayıtlar “kullanıcıda kesin kapandı” diye işaretlenmedi.

## Sürüm ve devam noktası

- Depo: `shakethat01/ShakeChat`.
- Test sürümü: **1.9.10**.
- Test dalı: `fix/known-issues-1.9.10`.
- Uygulama commit'i: `c5f6da5c921a7de9cfa2318479e574eed704c407`.
- [Değişiklikler — taslak PR #2](https://github.com/shakethat01/ShakeChat/pull/2).
- [Windows CI — 36433260101](https://github.com/shakethat01/ShakeChat/actions/runs/36433260101).
- Windows CI / kurulum paketi: **başarılı**, 28 Eylül 2026 14:14 UTC.
- Artifact: `ShakeChat-known-issues-1.9.10-test`, kimlik `10975780333`; GitHub saklama sonu 12 Ekim 2026.
- İndirilen ZIP: `ShakeChat-1.9.10-Windows-Test.zip` (3.458.482 bayt). İçindeki `ShakeChat_1.9.10_x64-setup.exe` çalıştırılarak test sürümü kurulur; yanında güncelleyici imzası bulunur.
- ZIP SHA-256: `30bd885c16a0db396395f4a3b6c5f3b786febe7457015fac390a6e5b589654fd`. İndirme sonrası ZIP bütünlüğü ve Actions digest eşleşmesi doğrulandı.
- Resmî güncelleyici yayını ve canlı API bu çalışma kapsamında henüz değiştirilmedi. Son doğrulanan resmî sürüm `app-v1.9.9`, commit `0e69bb030d4df9e47ceb41fbf3b3f6d36e451f55`.
- Projedeki `docs/WORK-CHECKPOINT-1.9.10.md`, başlangıç commit'ini, uygulanan işleri, doğrulamayı ve kalan adımları tutar. Kesinti sonrasında bu dosya, dal ve en son Actions birlikte kontrol edilerek devam edilir.

Kullanıcının 15 maddesindeki **1 ve 14 aynı istek** olduğu için birleştirildi. Böylece 14 yeni kayıt ile önceki çalışmalardan kapanışı kesinleşmemiş 4 kayıt, toplam **18 takip maddesi** oluşturur. Eski mikrofon geçişi ve düşük yayın kalitesi şikâyetleri ilgili yeni kayıtlara eklendi.

Durumlar: **Uygulandı** kod ve ilgili otomatik kontrolün hazır olduğunu; **kabul bekliyor** gerçek kullanım sonucunun henüz alınmadığını belirtir. SC-01 ve SC-03 için önceki R1 paketinde kullanıcının olumlu temel denemesi korunur. P0 sesin kaybolması/izolasyon/aşırı ses; P1 temel kullanım; P2 bildirimlerdir.

## Tam takip listesi

| Kimlik | Öncelik | Sorun / istek | 1.9.10'da yapılan ve güncel durum | Son kabul ölçütü |
| --- | --- | --- | --- | --- |
| SC-01 | P0 | Mikrofon değiştirirken `createMediaStreamSource` hatası ve art arda geçişten sonra sessizlik. | Önceki ses işlemcisi bağlamı/yeniden başlatma düzeltmesi korundu. Geçişler sıraya alınıyor, hata toparlama testleri var. **R1 temel denemesi kullanıcıda geçti.** | İki mikrofon arasında seri geçiş, cihazı çıkarma ve hata sonrası çalışan sese dönüş; uygulamayı yeniden açmak gerekmemeli. |
| SC-02 | P0 | Mikrofon testi diğer kişilere duyuluyor. | **Uygulandı.** Test başlamadan oda mikrofonu izole edilir. Test monitörünün sistem paylaşımı üzerinden sızmaması için paylaşımın ses gönderimi de geçici durur; görüntü sürer. İptal, izin reddi, ayarları kapatma ve PTT/mute durumları test edildi. | Test konuşması/monitörü karşı istemcide duyulmamalı. Test bitince son kullanıcı tercihi ve paylaşım sesi geri gelmeli. |
| SC-03 | P0 | Sistem/oyun/müzik sesi konuşmayı aşırı bastırıyor. | Ekran yakalamasında AGC/NS/AEC kapalı istenmesi, tek oynatma hattı ve ayrı yayın sesi kontrolü korundu. **R1 temel denemesi kullanıcıda geçti.** Kaynak değiştirme aynı yakalama seçeneklerini kullanır. | Farklı içeriklerde çift oynatma, kırpılma ve ani seviye sıçraması olmamalı. Kullanıcının -36/-6 dB örneği tarifti; ölçülmüş sonuç değildir. |
| SC-04 | P1 | Kişinin mikrofon ve yayın sesleri birlikte kısılıyor; R1'de kişi mute/0 etkisizdi. | **Uygulandı.** Mikrofon/yayın ayrı sürgü ve susturma kullanır. R2'de SDK yanında ses elemanına da `volume`/`muted` uygulanır; 1.9.10 bunu içerir. | Konuşma 0 / yayın 100 ve konuşma 100 / yayın 0 ayrı ayrı çalışmalı. Bir kaynağı susturmak diğerini etkilememeli. |
| SC-05 | P1 | Yayıncı mikrofonunu/kulaklığını kapatınca gönderilen yayın sesi etkileniyor. | **Uygulandı.** Yayıncının mute/sağırlaştırması ekran paylaşımının giden sesini değiştirmez. İzleyicinin kendi sağırlaştırması bütün yerel alımı susturur. | Yayıncı mute ve sağırlaştırma yaparken karşıdaki izleyici yayın sesini duymaya devam etmeli. |
| SC-06 | P1 | İlk ses kanalına girişte mikrofon beklenmedik kapalı başlayabiliyor. | Giriş modu ve kaydedilmiş mute tercihine göre açılış, önceki işlemcinin temizlenmesi ve oda kontrolü mevcut. Otomatik giriş/PTT regresyonları geçti. **Gerçek cihaz kabulü kaldı.** | Normal girişte tercih ve ekrandaki durum gerçek mikrofon yayınıyla eşleşmeli. Bas-konuşun beklenen sessizliği hata sayılmaz. |
| SC-07 | P1 | Cihaz ve mute tercihleri kanal/yayın geçişlerinde sıfırlanıyor. | **Ek düzeltme uygulandı.** İlk cihaz listesi boş/eksik geldiğinde kayıtlı seçim silinmez. Cihaz yoksa çalışan varsayılan kullanılır; cihaz döndüğünde tercih korunur. Bunun regresyon testi eklendi. | Kanal değişimi, yayın aç/kapat, yeniden giriş ve geçici cihaz yokluğunda tercih korunmalı. |
| SC-08 | P1 | Katılımcıların listeden kaybolup gelmesi / gereksiz yeniden bağlantı. | Yayın/ayar değişimi odayı yeniden kurmaz. Eski odadan geç gelen olaylar etkin odayı değiştirmemesi için korunur; yeniden bağlantıda abonelik/izleyici durumu yenilenir. **Gerçek ağ ve uzun oturum kabulü kaldı; bütün kopmaların nedeni doğrulanmış değil.** | Kısa ağ kesintisinden sonra tek katılımcı ve tek ses akışı; yayın/cihaz işlemlerinde gereksiz ayrılıp katılma olmamalı. |
| SC-09 | P1 | Arka plan/klavye/fare bastırma, ses algılama ve hece kaybı. | **Çift işleme kaldırıldı:** RNNoise yanında tarayıcı gürültü bastırması kapalı. RNNoise/VAD ve gürültü kapısı tercihleri korunur. Mantık testleri geçti; akustik kalite kabulü yapılmadı. | Sessizlik/konuşma sırasında klavye-fare, düşük/normal ses, kelime başı/sonu ve yankı karşılaştırılmalı. RNNoise kullanımı “Krisp ile aynı kalite” kanıtı değildir. |
| SC-10 | P1 | Bütün yayınları zorunlu izleme (kullanıcının 1 + 14. maddesi). | **Uygulandı.** Yayınlar başlangıçta abone olunmadan listelenir. “Yayını izle” görüntü ve sesi açar; “İzlemeyi bırak” ikisini durdurur, geç gelen ses de reddedilir. | İzlemeyen kullanıcıda yayın görüntüsü/sesi açılmamalı. Bir yayını bırakmak diğer yayını veya mikrofonları etkilememeli. |
| SC-11 | P1 | FPS düşük görünüyor; ölçüm ile gerçek performans karışıyor. | **Ölçüm düzeltildi.** Hedef, yakalama, RTP gönderim/alım ve görüntülenen kare hızı ayrı gösterilir. RTP sayacı/timestamp farkı kullanılır; bilinmeyen gerçek FPS yerine hedef yazılmaz. CPU/bant sınırı da gösterilir. | Hareketli sahnede gönderici/alıcı ölçümleri karşılaştırılmalı. Seçilen 144 FPS, donanımın gerçekten 144 kare ürettiği garantisi değildir. |
| SC-12 | P1 | Canlı yayının çözünürlük/FPS ayarı yalnız genel ayarlarda. | **Uygulandı.** Yayın üstünde çözünürlük/FPS seçicileri var. Yakalama ve gönderici ayarları mevcut yayın üzerinde değiştirilir; başarısız işlemde önceki ayarlara dönüş denenir. | Oda/mikrofon kopmamalı ve izleyici yeniden İzle dememeli. Hata, başarılı ayar değişikliği gibi gösterilmemeli. |
| SC-13 | P1 | Yayın sürerken ekran/pencere kaynağı değiştirilemiyor. | **Uygulandı.** “Ekranı/pencereyi değiştir” önce yeni kaynağı alır, sonra mevcut yayını değiştirir. Seçici iptali eski yayını korur; geç dönen yakalama temizlenir. Video/ses birlikte ele alınır. | İptalde eski yayın; değişiklikte aynı izleme bağlantısı devam etmeli. Sesli ve sessiz kaynak geçişleri Windows'ta denenmeli. |
| SC-14 | P1 | Ses kanalına tıklayınca anında geçiş. | **Uygulandı.** İlk katılma ve kanal değiştirme için hedef adıyla onay çıkar. İptal mevcut görünümü/odayı korur. Aynı kanala tıklama yeniden bağlanmaz. | İptalde mikrofon/yayın değişmemeli; onayda doğru kanala geçilmeli. |
| SC-15 | P1 | Kanala girmeden içeride kimlerin olduğu görünmüyor. | **Uygulandı; yeni API gerekir.** Yetkili kanalların üyeleri ve sayıları yenilenen listede görünür. Sunucu üyeliği ve kanal görme yetkisi her istekte denetlenir; izinler önbelleğe alınmaz. Bağlantı sorunu boş oda diye gösterilmez. | Giriş/çıkış ve kanal değişimi birkaç saniyede yansımalı; yetkisiz kanal bilgisi görünmemeli. |
| SC-16 | P2 | Kanal giriş/çıkış bildirim sesi. | **Uygulandı.** Gerçek giriş/çıkış için ayrı tonlar; aç/kapat ve bildirim seviyesi ayarı var. İlk katılımcı listesi toplu ses üretmez. | Doğru kanaldaki olay başına tek bildirim, seçilmiş çıkış cihazı ve seviye kontrol edilmeli. |
| SC-17 | P2 | Yayın açma/kapama ve biri izlemeye başlayınca ses. | **Uygulandı; izleyici verisi için yeni API gerekir.** Yayın olayları ayrı ton kullanır. Gerçek ekran aboneliği yayıncıya izleyici bildirimi gönderir; SID doğrulaması ve tekrar saymama vardır. | Odada bulunmak izlemek sayılmamalı. İzleyici başlangıcı yayıncıya bir kez bildirilmeli; bırakma/ayrılma sayacı düşürmeli. |
| SC-18 | P1 | Sahip sunucuyu silemiyor veya devredip ayrılamıyor. | **Uygulandı; yeni API gerekir.** Sahiplik sekmesinde sunucu adını aynen yazarak silme ve mevcut üyeye ikinci onayla devir var. API sahibi denetler; eşzamanlı devir/silme ve yeni sahibin çıkarılması korunur. | Normal üye sahip işlemlerini yapamamalı. Devirden sonra eski sahip ayrılabilmeli. Silmede üyeler/kanallar kapanmalı, sahipsiz sunucu oluşmamalı. |

## Kullanıcının ilk listesiyle eşleştirme

| İlk madde | Takip kaydı |
| --- | --- |
| 1 ve 14 | SC-10 |
| 2 | SC-11 |
| 3 | SC-12 |
| 4 | SC-14 |
| 5 | SC-15 |
| 6 | SC-16 |
| 7 | SC-17 |
| 8 | SC-13 |
| 9 | SC-04 |
| 10 | SC-05 |
| 11 | SC-01 |
| 12 | SC-02 |
| 13 | SC-03 |
| 15 | SC-18 |
| Önceki açık kayıtlar | SC-06, SC-07, SC-08, SC-09 |

## Otomatik doğrulama

- Web: **95/95** test, 15 test dosyası.
- API: **68/68** test. Yeni sahiplik/yetki/yarış korumaları, kanal listesi görünürlüğü ve masaüstü CORS regresyonu dahil.
- Web ve API TypeScript kontrolleri başarılı.
- Web ve API üretim derlemeleri başarılı. Vite'ın büyük JavaScript paketi uyarısı var; derleme hatası değil.
- Dağıtım betiğinin Bash sözdizimi kontrolü başarılı.
- Windows: **başarılı**. CI logunda 68 API ve 95 web testi geçti; Cargo, NSIS kurulum paketi, güncelleyici imza dosyası ve artifact yüklemesi başarılı.

Ses testlerinin önemli bölümü taklit oda/cihaz kullanır. Bu sonuçlar gerçek alıcıdan dinlemeyi, Windows ekran/sistem sesi yakalamasını veya belirli donanımda FPS ölçümünü yerine getirmiş sayılmaz.

## Testi sona bırakmak için hazır kabul sırası

İki bağımsız istemci yeterlidir; iki ayrı insan şart değildir. Her iki istemci de 1.9.10 test kodunu çalıştırmalı. Resmî canlı web sürümü kendiliğinden test dalına geçmez. Üçüncü oturum, izlemeyen kişi kontrolünü kolaylaştırır.

1. **Tek kullanıcıyla:** kanal onayı/iptali; yayın başlatma; yayın üstünden çözünürlük/FPS; kaynak seçimini iptal etme ve değiştirme; bildirim ayarları; sahibi olunan deneme sunucusunda devir/silme. Son iki API işlemi için güncel backend gerekir.
2. **İsteğe bağlı izleme:** B önce izlemesin, ardından İzle/Bırak yapsın. Ses ve görüntü birlikte açılıp kapanmalı; yayıncının sayacı/bildirimi gerçek izlemeyi göstermeli.
3. **Ses ayrımı:** konuşma 0 / yayın 100, ardından konuşma 100 / yayın 0; kişi mute ve yayın mute ayrı ayrı. R1'de kaçan kişi susturma senaryosu özellikle tekrar edilmeli.
4. **İzolasyon:** mikrofon testi açıkken karşı istemcide test konuşması/monitörü duyulmamalı. Sesli paylaşım görüntüsü sürerken paylaşım sesi test boyunca geçici durabilir; test bitince geri gelmeli.
5. **Mute/sağırlaştırma:** yayıncı mikrofonunu ve uygulama kulaklığını kapatınca B yayın sesini duymaya devam etmeli. B kendi sağırlaştırmasını açınca bütün yerel alım susmalı.
6. **Cihaz/oturum:** iki mikrofon arasında seri geçiş; geçici cihaz çıkarma; kanal değişimi; kısa ağ kesintisi. Tek ses akışı, doğru mute/cihaz tercihi ve tek katılımcı kaydı kalmalı.
7. **Kalite/FPS:** hareketli görüntüyle hedef/yakalama/gönderim/alım/görüntü FPS'lerini birlikte kaydet. Klavye/fare, kelime başı/sonu, düşük/normal ses ve yankıyı dinle. Gerçek ölçümden sonra gerekiyorsa kalite ayarı yapılır.

## Dağıtım durumu

Test dalına gönderim ve Windows derlemesi önceden onaylandı; bunlar için tekrar izin beklenmiyor. Taslak PR #2, birleştirilmeden değişikliklerin gözden geçirilebilmesini sağlar.

1.9.10 test paketi üretimdeki güncelleyici anahtarıyla imzalanmıştır; önceki test işinin geçici anahtarı kullanılmaz. Test workflow'u resmî release veya `latest.json` yayımlamaz. Güncelleyicide görünen sürüm ile test paketinin sürümü karıştırılmamalı.

**Yalnız masaüstü kurulumunu güncellemek API'yi güncellemez.** Kanal üye listesi, sahiplik/silme ve izleyici veri izni yeni backend gerektirir. Bu nedenle `web-deploy.yml` web ile API'yi aynı commit'ten derleyecek biçimde tamamlandı. `tools/deploy-release.sh`, mevcut `shakechat-api` systemd servisini yeniden başlatır; veritabanını da sorgulayan sağlık kontrolü ve eski web/API dosyalarıyla bağımlılıklara dönüş içerir. REST ve Socket.IO, masaüstünün Tauri origin listesini ortak kullanır. Yeni veritabanı şeması/migrasyon yoktur.

Bu akış yalnız `release/updater-test` dalında çalışır; test dalına gönderim canlı servisi güncellemez. Canlı API dağıtımı ve resmî updater yayını henüz gerçekleştirilmedi. Tam kullanım kabulünden sonra web/API ile masaüstü yayını birlikte ilerletilmelidir.

## Önceden kapanmış kayıtlar

| Kayıt | Korunan durum |
| --- | --- |
| Uygulama içi güncelleme | Kullanıcı “güncelleme sorunumuz yok” diye kapattı. Aktif hata olarak yeniden açılmadı; yeni paketten sonraki resmî güncellemeye geçiş regresyon olarak izlenir. |
| Turuncu konuşma göstergesinin gecikmesi | Önceki kullanıcı denemesinde düzeldi. Yeni ses hattı/cihaz geçişlerinden sonra senkronu kabul testinde kontrol edilir. |

## Kısa tarihçe ve önceki kanıtlar

- **24 Eylül — resmî 1.9.9:** `app-v1.9.9`, `0e69bb030d4df9e47ceb41fbf3b3f6d36e451f55`. Kullanıcı uygulama içinden güncelleyerek kurduğunu belirtti; yayın manifesti/etiket/Actions eşleştirildi.
- **27 Eylül — ilk inceleme/R1:** mikrofon işlemcisi bağlamı, test izolasyonu, ayrı ses kaynakları, yayıncının mute/sağırlaştırması ve sistem yakalama işleme seçenekleri ele alındı. R1 `9542da84caa4ca49c0055d3d8a2673afd7759b03`, 79 web testi. Kullanıcı mikrofon değiştirme ve yayın ses yüksekliği için olumlu sonuç verdi; kişi sesini kısmak/susturmak etkisizdi.
- **28 Eylül gece — R2:** `efa975efaefc875a4421fabb0f7d389a2895969b`, ses elemanına doğrudan seviye/mute uygulaması, 81 web testi. [Actions 36363406761](https://github.com/shakethat01/ShakeChat/actions/runs/36363406761) başarılı. Artifact `ShakeChat-voice-stability-1.9.9-test`, kimlik `10947125294`; gerçek dinleme yapılmadan oturum kapandı.
- **28 Eylül bağımsız inceleme:** R2 üzerinde 81 web + 60 API testi ve derlemeler yeniden geçti. Eski/yeni maddeler 18 kayıtta birleştirildi.
- **28 Eylül 1.9.10 geliştirmesi:** yayın/kanal/sunucu kontrolleri, bildirimler, cihaz tercih düzeltmesi ve çift gürültü bastırmayı kaldırma tamamlandı. 95 web + 68 API testi hem yerelde hem Windows CI üzerinde geçti; imzalı NSIS paketi oluşturuldu. Kesintiden sonra mevcut dosyalardan devam edildi; çalışma sıfırdan tekrarlanmadı.

Eski R1 yaması (`ShakeChat-1.9.9-Ses-Duzeltmeleri-R1.patch`) ve R2 kurulumu tarihsel çıktılardır; 1.9.10 kurulumunun yerine kullanılmamalı. AEC → RNNoise → VAD → kompresör/limiter önceki bir kalite tasarım hedefiydi; bu işte yeni bir kompresör/limiter eklenmiş veya bütün akustik sorunlar ölçülmüş sayılmaz.
