# ShakeChat 1.9.10 — devam noktası

Son kayıt: 28 Eylül 2026. Kullanıcı kalan sorunların kodda tamamlanmasını, gerçek
kullanım testlerinin en sona bırakılmasını istedi. Aynı iş için tekrar izin
sorulmayacak; GitHub test dalı ve Windows CI gönderimi zaten onaylı.

## Çalışma yeri

- Depo: `shakethat01/ShakeChat` (Discord benzeri uygulama; ShakeChatBot değil).
- Dal: `fix/known-issues-1.9.10`.
- Başlangıç: `efa975efaefc875a4421fabb0f7d389a2895969b`.
- Uygulama değişiklikleri tamamlandı; 1.9.10 test dalına ilk commit hazırlanıyor.
  Devamda güncel uzak commit ve Actions sonucunu kontrol et.
- Önce `git status` ve bu dalın güncel commit'ini kontrol et. Baştan başlama,
  mevcut değişikliklerin üzerine devam et; eski R1 dalını tekrar uygulama.

## Uygulananlar

- Yayınlar varsayılan olarak izlenmiyor; görüntü/ses birlikte abone oluyor ve
  izleme bırakılınca birlikte duruyor. Mikrofonlar normal abone olmaya devam eder.
- Yayın üstünde çözünürlük/FPS ve ekran/pencere değiştirme var; mevcut track/SID
  korunur. İptal, başarısız değişiklik ve geç dönen ekran seçimi ele alındı.
- FPS sayacı hedef, yakalama, gönderim/alım ve görüntü karelerini ayırır.
- Kanal geçişi onay diyaloğu; kanala girmeden üyeler için yetkili API ve
  yenilenen liste; sunucu sahibi için silme ve devir arayüzü/API.
- Gerçek izleme durumuna bağlı yayıncı izleyici listesi/sesi; kanal ve yayın
  bildirimleri, aç/kapat ve ses seviyesi tercihleri.
- Cihaz listesi geçici eksikken kalıcı seçim artık silinmiyor; bulunamayan
  kayıtlı mikrofon yerine çalışan varsayılan kullanılıyor.
- RNNoise yanında ikinci tarayıcı gürültü bastırması kapatıldı; önceki R2
  mikrofon testi izolasyonu ve bağımsız ses kontrolleri korundu.
- Sunucu devir/silme yetkileri ve transfer sırasında sahibin yanlışlıkla
  çıkarılması/ayrılması gibi yarışlar için API korumaları.
- Masaüstü sürümü 1.9.10. Test CI dalı eklendi; CI artık API testlerini de
  çalıştırır. Test kurulumu üretim güncelleyici anahtarıyla imzalanacak;
  workflow bir release veya updater manifesti yayımlamaz.

## Son doğrulama ve kesinti

- Son tamamlanan tur: 95/95 web testi, 68/68 API testi, API/web TypeScript ve
  üretim web/API build başarılı. Ortak REST/Socket.IO CORS düzeltmesi,
  CORS regresyon testi ve API sağlık kontrolü dahildir. Dağıtım betiği bash -n geçti.
- Geçici `/tmp` logları ve süreç kimlikleri kesintide kayboldu. Git çalışma
  dosyaları korunmuş; 28 Eylül 16:53 Türkiye saati devamında doğrulandı.

## Sıradaki işler

1. Yerel kontroller tamamlandı. Windows CI üzerinde Cargo, testler ve NSIS
   paketleme sonucunu doğrula; başarısız adımı düzeltip devam et.
2. Canlı ekran kaynağı/kalite değişimi, izleme aboneliği, bildirimler ve API
   güvenlik yollarındaki somut eksikleri düzelt. Gerçek dinleme için kullanıcıyı
   bekletme; fiziksel donanım kabulünü sona bırak.
3. Değişiklikleri commit edip test dalına gönder; Windows CI sonucunu izle ve
   kurulum artifact'ini hazırla. Canlı sürüm henüz yayımlanmış sayılmamalı.
4. Kanal listesi, sahiplik ve izleyici verisi yeni API'yi gerektirir.
   `web-deploy.yml` ve `tools/deploy-release.sh` artık API'yi de derleyip systemd
   ile başlatır; sağlık kontrolü ve önceki web/API sürümüne geri dönüş içerir.
   Bunlar hazırlanmıştır, henüz canlıda çalıştırılmamıştır. Veritabanı şeması değişmedi.
   Sadece masaüstü paketinin kurulması API'yi güncellemez.
5. Birleşik 18 maddelik dosyayı aynı kimlikle güncelle ve Windows test paketini
   sun. Tam dinleme/Windows donanımı denenmeden 'bütün hatalar kesin kapandı'
   iddiasında bulunma.
