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
- Rust bağımlılıkları, sunucu ve updater yayın ayarları değiştirilmedi.

## Doğrulama

- Web TypeScript kontrolü ve production build geçti.
- 52 web testi geçti; yeni 9 test tek oda/mikrofon, uzaktaki paylaşım,
  paylaşım seçicisindeki mute/unmute, cihazların geri yüklenmesi, başarısız cihaz
  değişimi, ilk bas-konuş filtresi ve meter cleanup davranışlarını kapsıyor.
- Testlerde LiveKit ve ses cihazları taklit edilir. Gerçek Windows ses kalitesi,
  WebView2 ekran yakalama ve iki bilgisayar arasındaki ses gecikmesi doğrulanmadı.
- Bu dal bir Windows installer/release değildir. Windows derlemesi ve aşağıdaki
  kullanım testi yapılmadan ses kalitesi veya dağıtım başarısı iddia edilmemeli.

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
