# ShakeChat — devam kaydı

Son güncelleme: 29 Eylül 2026. Önce bu dosyayı, `KNOWN-ISSUES.md` dosyasını ve GitHub'daki dal/release/Actions durumunu eşleştir. Eski 1.9.10 çalışma kopyasından otomatik devam etme.

- Depo: `shakethat01/ShakeChat`.
- Resmî sürüm: 1.9.12 / `9b76125a45141739e7de499dfa8a32a8e7417a19`.
- Aktif geliştirme: `feature/native-screen-capture-1.9.13`; bu oturumun başlangıcı `e718584c53d5ba47db2e7cf122996a52d4a25c9f`.
- Önceki başarılı native CI: `36544359208`; 99 web + 70 API test, Cargo ve imzalı NSIS. Gerçek Windows kabulü değil.
- Eski `fix/known-issues-1.9.10` dalı PR #2 ile 28 Eylül'de birleştirilmiş. Sonrasında 1.9.11 ve 1.9.12 resmen çıkmış, web/API deploy başarılı olmuş.

## 29 Eylül devam çalışması

Önceki konuşmadaki kullanıcı kabulü korundu: SC-01–14 ve SC-16 işlevleri kapalı; SC-10 arayüzü SC-20'de. Diğer maddelerin kod/yayın/kabul durumları güncel listeye işlendi.

- Mikrofon izni reddi artık LiveKit kanal bağlantısını sonlandırmaz; cihaz listesinin reddi/boşluğu tercihleri silmez. Dinleyici kullanıcıdan mikrofon izni istenmez. Sunucu rol reddi olduğu gibi uygulanır.
- Windows WebView mikrofon izin kararı yalnız açık kullanıcı eylemiyle varsayılana döndürülür; otomatik izin verilmez. Windows gizlilik ayarını açan sabit komut ve Türkçe toparlama UI'si var.
- Native paylaşımın teknik katılımcısı tarayıcı ve masaüstünde sahibine eşlenir. Kendi sistem sesine abonelik/oynatma yapılmaz. İzleyici mesajları asıl kullanıcıya gider; kendi önizlemesi izleyici sayılmaz.
- Mikrofon test izolasyonu birden fazla ses hattını bekler. Native sistem sesi susturulmadan monitor başlayamaz; hata halinde test başlamaz. Eski örneklerin geri gelmesini önlemek için ses kuyruğu/nesli temizlenir.
- Native kaynak/kalite değişimi aynı track ve odayı korur. Yakalama boyutu en/boy oranı korunarak gerçekten ölçeklenir. Kare yakalama süresi FPS bütçesine dahildir.
- Yayın seçicisi kanaldan çıkınca kapanır. Geç gelen token/start işlemleri eski kanalda yayını açık bırakmaz. İşlemler sırayla ve tekrar tıklama korumasıyla yürütülür.
- Kaynak penceresi/cihaz/yayıncı kapanması UI'ye yansır. Kaynak seçici küçük pencerede kaydırılabilir.

## Doğrulama

Yeni izin/native regresyonları `apps/web/src/useVoiceRuntime.test.tsx` içinde. İlk odaklı çalışmada **30/30** geçti (12 yeni senaryo). **Tam yerel kontrol başarılı: 111 web + 70 API = 181 test**, API/web TypeScript kontrolleri ve üretim derlemeleri. Windows Rust testi/Cargo/NSIS sonucu aşağıya eklenecek.

- Devam düzeltmeleri `1a3bd7ae6a63061bf6b68a74b10cc30be7572b01` commit'iyle gönderildi; PR #3 açıldı.
- Windows CI `36575938038`: 181 test, TypeScript ve Cargo check geçti. Yeni `cargo test` adımı depo kökünden çalıştığı için `src-tauri/.cargo/config.toml` içindeki statik MSVC ayarını okuyamadı; libwebrtc ile MT/MD bağlama uyuşmazlığı oluştu. Test adımının çalışma dizini `apps/desktop/src-tauri` olarak düzeltildi. Yeni CI sonucu bekleniyor; bu başarısız çalışmada kurulum dosyası üretilmedi.

## Sonraki teslim

1. Tam kontroller ve Windows Cargo/NSIS işi tamamlanmalı; hata varsa düzeltilmeli.
2. Native `/screen-token` endpoint'i 1.9.13 API dağıtımı gerektirir. Resmî 1.9.12 API ile yalnız 1.9.13 EXE yeterli olmaz.
3. Native Windows ses/FPS kabulü olmadan “tüm maddeler kullanıcıda kapalı” denmemeli. Kabul sırası güncel listede.
4. Kesinti olursa bu dosyanın sonuna tamamlanan commit/CI/artifact ve açık adım eklenmeli. Eski izin yaması ayrı çalışma kopyasında korunmuştur; güncel koda aktarılmış kısmı tekrar uygulanmamalıdır.
