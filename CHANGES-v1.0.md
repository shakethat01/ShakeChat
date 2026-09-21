# ShakeChat v1.0 — ürünleştirme ve medya kalite ayarları

v1.0, v0.9'daki çalışan özellik setini değiştirmeden uygulamayı günlük kullanım için daha tamamlanmış bir ürüne dönüştürür.

## Yeni: Uygulama ayarları

- Kullanıcı çubuğuna ayrı **Uygulama ayarları** düğmesi eklendi.
- Ayarlar sunucudan bağımsız olarak bu tarayıcı/cihazda `localStorage` içinde saklanır.
- ShakeChat'in özgün arayüz geometrisi korunur; görünüm profilleri başka bir sohbet ürününün tema/menü düzenini kopyalamaz.
- Üç özgün vurgu profili:
  - **Köz:** amber + mint
  - **Gelgit:** turkuaz + kum
  - **Grafit:** nötr + sıcak beyaz
- **Rahat / Sıkı** arayüz yoğunluğu.
- Hareketleri azalt seçeneği.

## Yeni: Ses ve görüntü tercihleri

- Kamera kalite profilleri:
  - Otomatik
  - 720p / 30 FPS
  - 1080p / 30 FPS
  - 1080p / 60 FPS
- Ekran paylaşımı kalite profilleri:
  - Otomatik
  - 720p / 30 FPS
  - 1080p / 30 FPS
  - 1080p / 60 FPS
  - 1440p / 30 FPS
  - 1440p / 60 FPS
- LiveKit kamera ve ekran capture seçenekleri kalite profiline göre uygulanır.
- Mikrofon için gürültü azaltma, yankı engelleme ve otomatik kazanç tercihleri LiveKit/WebRTC capture ayarlarına bağlandı.
- Mikrofon zaten açıksa desteklenen tarayıcılarda yeni ses işleme tercihleri canlı track'e uygulanmaya çalışılır.

> Seçilen çözünürlük/FPS bir hedef profildir. Tarayıcı, ekran kaynağı, GPU ve ağ koşulları daha düşük bir gerçek kalite seçebilir.

## Yeni: başlangıç ve hata deneyimi

- Oturum açılmış kullanıcı için uygulama verileri hazırlanırken markalı başlangıç ekranı gösterilir.
- İlk yükleme başarısız olursa boş/bozuk ana ekran yerine hata ekranı görünür.
- **Tekrar dene** ve **Çıkış yap** seçenekleri vardır.

## Release temizliği

- Root, API ve Web paket sürümleri `1.0.0` olarak güncellendi.
- Yeni ayarlar için ayrı `preferences.ts` katmanı eklendi.
- Yeni UI `AppSettings.tsx` içinde ayrıştırıldı.
- v1.0 Prisma şemasını değiştirmez; migration yoktur.
