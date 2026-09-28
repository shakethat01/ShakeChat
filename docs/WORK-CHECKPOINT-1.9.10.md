# ShakeChat 1.9.10 — devam noktası

Son kayıt: 28 Eylül 2026. Kullanıcı kalan sorunların kodda tamamlanmasını,
gerçek kullanım testlerinin en sona bırakılmasını istedi. Test dalına gönderim
ve Windows derlemesi önceden onaylı; aynı işlemler için yeniden izin sorma.

## Güncel durum

- Depo: `shakethat01/ShakeChat` (Discord benzeri uygulama; ShakeChatBot değil).
- Dal: `fix/known-issues-1.9.10`.
- Önceki geceki temel: `efa975efaefc875a4421fabb0f7d389a2895969b`.
- Uygulama değişikliklerinin commit'i: `c5f6da5c921a7de9cfa2318479e574eed704c407`.
- Windows Actions: https://github.com/shakethat01/ShakeChat/actions/runs/36433260101
- Taslak PR: https://github.com/shakethat01/ShakeChat/pull/2
- Yerel çalışma: `/workspace/scratch/7c39d1bce18e/shakechat-review`.
- Kod GitHub'a kaydedildi. Önce `git status`, güncel dal ve Actions sonucuna bak;
  eski R1 dalını tekrar uygulama veya geliştirmeye baştan başlama.
- CLI push kimlik bilgisi bulamadığında bağlı GitHub uygulamasının Git veri
  işlemleri kullanıldı. Uzak ve yerel kaynak ağaçları eşleştirildi.

## Uygulananlar

- Yayınlar varsayılan olarak izlenmiyor; görüntü/ses birlikte abone oluyor ve
  izleme bırakılınca birlikte duruyor. Mikrofonlar normal alınmaya devam eder.
- Yayın üstünde çözünürlük/FPS ve ekran/pencere değiştirme var; video track/SID
  korunur. İptal, başarısız değişiklik ve geç dönen ekran seçimi ele alındı.
- FPS sayacı hedef, yakalama, gönderim/alım ve görüntü karelerini ayırır.
- Kanal geçiş onayı; kanala girmeden üyeler için yetkili API ve yenilenen liste;
  sunucu sahibi için adını yazarak silme ve ikinci onayla devir arayüzü/API.
- Gerçek izlemeye bağlı izleyici sayacı/sesi; kanal ve yayın bildirimleri,
  aç/kapat ve ses seviyesi tercihleri.
- Geçici cihaz listesi eksikliği kalıcı mikrofon/hoparlör seçimini silmez;
  bulunamayan kayıtlı mikrofon yerine çalışan varsayılan kullanılır.
- RNNoise yanında ikinci tarayıcı gürültü bastırması kapatıldı; R2 mikrofon
  testi izolasyonu ve bağımsız ses kontrolleri korundu.
- Sahiplik değişimi sırasında yeni sahibin yanlışlıkla çıkarılması/ayrılması
  gibi yarışlar için API korumaları.
- Masaüstü sürümü 1.9.10. Windows CI tüm API/web testlerini çalıştırır ve
  üretim güncelleyici anahtarıyla test paketini imzalar. Release yayımlamaz.
- REST ve Socket.IO ortak Tauri CORS listesi kullanır. Önceki sunucu üstü
  CORS yaması böylece sürüm kontrollü kaynakta da yer alır.
- Web/API dağıtımı aynı commit'ten derleme, systemd yeniden başlatma,
  veritabanını sorgulayan sağlık kontrolü ve yedekten geri dönüş içerir.
  VPS'deki eski yerel yamalar yedeklenir ve yeni checkout'u engellemez.

## Doğrulama

- Yerelde 95/95 web ve 68/68 API testi başarılı.
- API/web TypeScript ve üretim derlemeleri başarılı; Vite yalnız paket
  boyutu uyarısı verdi. Dağıtım betiği `bash -n` kontrolünden geçti.
- Windows Actions 36433260101 başarılı: 68 API + 95 web testi, TypeScript,
  Cargo check, üretim imza anahtarı, NSIS paketleme ve artifact yüklemesi geçti.
  Artifact 10975780333; ZIP SHA-256:
  `30bd885c16a0db396395f4a3b6c5f3b786febe7457015fac390a6e5b589654fd`.
  ZIP bütünlüğü ve bu digest ile eşleşmesi indirildikten sonra doğrulandı.
- Gerçek Windows mikrofonu, sistem sesi, iki istemciyle dinleme, hareketli
  sahnede FPS ve ağ kesintisi kabulü yapılmadı.

## Kalanlar

1. Geliştirme ve otomatik/Windows paketleme aşaması tamamlandı. Sıradaki ürün
   kabulü gerçek cihaz/dinleme ve FPS denemesidir; listeye göre ilerle.
   Artifact: `ShakeChat-known-issues-1.9.10-test`, başarılı Actions yukarıda.
2. Birleşik 18 maddelik liste: `docs/KNOWN-ISSUES-1.9.10.md`. Kullanıcı çıktısı
   `ShakeChat-Bilinen-Sorunlar-2026-09-27.md` dosyasının aynı kimliğiyle güncellenir.
3. `ShakeChat-1.9.10-Windows-Test.zip` ve güncel liste kalıcı olarak kaydedildi.
   Kodda hazır maddeleri fiziksel kullanım testi geçmiş gibi işaretleme.
4. Kanal üyeleri, sahiplik/silme ve izleyici veri izni yeni API gerektirir.
   `web-deploy.yml` ve `tools/deploy-release.sh` hazır; canlıda çalıştırılmadı.
   Şema değişikliği yoktur. Yalnız masaüstü kurulumunu güncellemek API'yi güncellemez.
5. Resmî son doğrulanan sürüm `app-v1.9.9` / `0e69bb0`. Bu çalışma resmî updater
   manifestini değiştirmedi. `release/updater-test` dalına push/PR merge hem
   üretim web/API dağıtımını hem masaüstü release akışını tetikler; test dalı
   ile üretim dalını karıştırma. PR #2 henüz taslaktır.

## Kesinti sonrası devam

Kullanıcının “kaldığın yerden devam et” mesajını yeni başlangıç sayma. Bu dosyayı,
GitHub commit/Actions kaydını ve mevcut dosyaları eşleştirip ilk tamamlanmamış
adıma geç. Kullanım limiti sırasında çalışmanın sürdüğünü varsayma; süreç ve
geçici loglar kaybolabilir. Tamamlanmış commit'ler, test sonuçları ve çıktılar
üzerinden devam et. 28 Eylül kesintisinde kaynak değişiklikleri korunmuştu.
