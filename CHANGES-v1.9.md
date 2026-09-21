# ShakeChat v1.9 — kullanım cilası ve birleşik moderasyon araçları

v1.9, v1.8'in çalışan kanal kilidi / yavaş mod / toplu mesaj temizleme işlevlerini yeni bir büyük backend özelliği eklemeden günlük kullanım için toparlar.

## Değişiklikler

- Kanal başlığındaki dağınık moderasyon düğmeleri tek **Moderasyon araçları** açılır panelinde toplandı.
- Panelden mevcut yazı akışı için:
  - mesaj aralığı (slow mode) değiştirilebilir,
  - kanal kilitlenip açılabilir,
  - son 2–100 mesaj temizlenebilir,
  - kanal silinebilir.
- Araçlar mevcut backend izinlerini kullanmaya devam eder; arayüz yalnızca kullanıcının yetkili olduğu işlemleri gösterir.
- Kilit / slow mode / toplu temizleme / kanal silme işlemleri için istemci tarafında işlem kilidi eklendi. Aynı işleme art arda hızlı tıklama ikinci bir API isteği üretmez.
- Global başarı ve hata mesajları sohbet alanını itmek yerine sağ altta özgün ShakeChat toast bildirimleri olarak görünür.
- Hata bildirimi otomatik kapanır ancak kullanıcı tarafından da kapatılabilir.
- Gerçek zamanlı bağlantı durumu kanal başlığında **Canlı / Bağlanıyor** etiketiyle açık biçimde gösterilir.
- Mobil görünüm için moderasyon paneli ve toast yerleşimi düzenlendi.
- Başlangıç sürüm etiketi 1.9'a güncellendi.

## Veri / migration

v1.9 Prisma şemasını değiştirmez. Migration yoktur ve yeni npm bağımlılığı eklenmez.
