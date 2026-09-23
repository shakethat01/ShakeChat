# Tek RNNoise ses hattı

Başlangıç: `feature/voice-media-full-v1`, `3b9d199c00028637c9ba8c410244847a8d8f8eb9`.

Kullanıcı testi: ekran paylaşımı açıkken kullanılan web/RNNoise hattı, native
PlatformAudio hattına göre daha yüksek ve daha temiz ses veriyor. Paylaşımı açınca
motor değiştirmek, paylaşanı ve yayını alan native istemcileri odadan çıkarıp
yeniden bağlıyordu. Bu geçiş cihaz/mute durumunu da kaybettiriyordu.

Bu değişiklikte:

- Masaüstü ve web aynı `useVoice` / RNNoise hattını ilk bağlantıdan itibaren kullanır.
- Kamera veya ekran paylaşımı yeni bir ses oturumu başlatmaz.
- Paylaşım seçme penceresinin kapanması mikrofonun mute durumunu değiştirmez.
- Mikrofon/hoparlör seçimleri başarılı değişiklikten sonra saklanır; yeni odada
  mevcutsa geri yüklenir. Kaybolan cihaz için varsayılan cihaz kullanılır.
- Kullanıcının açıkça seçtiği mute durumu saklanır; reconnect bunu açmaz.
- Bas-konuşun ilk açılışı da RNNoise işlemcisini kurar.
- Yerel konuşma ışığı gönderilen `MediaStreamTrack` üzerinden ölçülür; ikinci
  `getUserMedia` yakalaması yapılmaz. Ölçüm aralığı 15 ms, kapanma hold 70 ms'dir.
  Bunlar toplam ses/arayüz gecikmesi garantisi değildir. Ölçüm çalışmazsa LiveKit
  konuşmacı bilgisi fallback olarak kullanılır.
- Kullanıcının beğendiği RNNoise/gate algoritması ve seviyeleri değiştirilmedi.
  Mevcut uygulamada RNNoise, ses kapısı açıkken çıkışa bağlanır; 48 kHz AudioWorklet
  bulunamazsa mevcut gate fallback davranışı devam eder.
- 1.9.4 paketinde kullanılmayan native Rust ses komutları ve bağımlılıkları derlemeden çıkarıldı. Eski `native_voice.rs` referans için korunuyor ancak modül olarak yüklenmiyor. Sunucu ve updater imzalama düzeni korunuyor.

## Doğrulama

- Web TypeScript kontrolü ve production build geçti.
- 52 web testi geçti; yeni 9 test tek oda/mikrofon, uzaktaki paylaşım,
  paylaşım seçicisindeki mute/unmute, cihazların geri yüklenmesi, başarısız cihaz
  değişimi, ilk bas-konuş filtresi ve meter cleanup davranışlarını kapsıyor.
- Testlerde LiveKit ve ses cihazları taklit edilir. Gerçek Windows ses kalitesi,
  WebView2 ekran yakalama ve iki bilgisayar arasındaki ses gecikmesi doğrulanmadı.
- 1.9.4 Windows paketi mevcut release iş akışıyla derlenir. Derleme sonucu GitHub Actions üzerinde doğrulanmalıdır; gerçek kullanım testi ayrıca gereklidir.

## Windows kabul testi

1. Her iki istemciyi de bu kodla çalıştır. Eski native istemciler ekran paylaşımı
   görünce kendi eski motor geçişlerini hâlâ yapabilir.
2. İlk kullanımda mikrofon ve hoparlörü bir kez seç. Önceki native motor bu
   seçimleri kalıcı kaydetmediği için eski seçim otomatik taşınamaz.
3. Gürültü kapısı açıkken, yayın kapalı olarak konuş + klavye/fare testi yap.
4. Yayını aç/kapat; ses karakteri, seçilen cihazlar ve mikrofon durumu korunmalı.
   Katılımcılar odadan çıkıp girmemeli. Kamera ve uzaktaki ekran paylaşımını da dene.
5. Ekran seçme penceresi açıkken mute/unmute yap; seçim bitince son durum korunmalı.
6. Odadan çıkıp gir; uygulamayı yeniden aç; cihazlar ve açıkça seçilmiş mute durumunu kontrol et.
7. Bas-konuş, sağırlaştırma ve mikrofon değişimini dene. Karşı uçtan kısa kayıt al.

Mevcut `npm ci`, başlangıç dalındaki package-lock/package.json uyumsuzluğu nedeniyle
başarısızdır. Doğrulama için `npm install --ignore-scripts --package-lock=false`
kullanıldı; bu ses düzeltmesine bağımlılık güncellemesi dahil edilmedi.

## 1.9.5 — Bağımsız gürültü kontrolleri

1.9.4 kullanıcı tarafından gerçek kullanımda doğrulandı. Bu sürüm kazanç,
eşik, bekleme süreleri ve varsayılan filtre sırasını korur. Gürültü azaltma
tercihi artık RNNoise seçimini de kontrol eder. Ses kapısını kapatmak RNNoise
filtresini kapatmaz; yalnız kapının gecikme ve susturma yolunu atlar.
Ayarlar aynı çıkış track üzerinde değiştirilir. RNNoise kullanılamıyorsa
mevcut tarayıcı gürültü azaltma ve ses kapısı fallback davranışı korunur.

57 web testi ve production build geçti. Yeni 5 test dört ayar birleşimini,
aynı mikrofon/track kullanımını ve RNNoise kullanılamadığında ses yolunun
açık kalmasını kapsar. Testler ses grafiğini taklit eder; klavye bastırma
kalitesini veya gerçek Windows akustiğini ölçmez.

Kabul testi: Gürültü azaltma açıkken ses kapısını kapatıp konuş + klavye
testi yap. Ardından gürültü azaltmayı kapat/aç; mikrofon ve oda bağlantısı
kesilmeden filtre farkı duyulmalı. Son olarak her iki ayarı yeniden aç.
