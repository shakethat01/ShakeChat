# ShakeChat — devam kaydı

Son güncelleme: **30 Eylül 2026**. Önce bu dosyayı, `KNOWN-ISSUES.md` dosyasını ve GitHub dal/release/Actions durumunu eşleştir. Eski 1.9.10 kopyasından başlama; kapanmış kullanıcı testlerini tekrar açma.

## Tamamlanan yayın

- Depo: `shakethat01/ShakeChat`; güncel yayın dalı `release/updater-test`.
- **Resmî sürüm 1.9.13:** `app-v1.9.13`, 29 Eylül 2026 22:35 Türkiye saati (19:35 UTC).
- Yayımlanan uygulama ve VPS kodu: `1c7ae2cf1b6caf484ca5d8de64653ca65461f9e8` (PR #3).
- Test edilen özellik dalı: `feature/native-screen-capture-1.9.13`, `2d930547e5762cf67c7760c18eff2b1f5e6c671e`. Test ve yayın commit'lerinin kaynak ağacı aynı: `525e1f41c3d0ec5027d0e921dc0f61c19525e906`.
- **Windows CI `36616633823` başarılı:** 111 web + 71 API = **182 test**, 1 Rust testi, TypeScript, Cargo check, imzalı NSIS ve updater imzası.
- **Web/API Deploy `36619044733` başarılı:** VPS sürüm dosyası yayın commit'ini doğruladı; yerel API sağlık yanıtı `{"status":"ok"}`. Dışarıdan otomatik HTTP kontrolü Cloudflare 403 ile engellendi; VPS içi kontroller başarılı.
- **Desktop Release `36619044813` başarılı:** resmî EXE, EXE imzası ve `latest.json` yayımlandı.
- [Resmî sürüm ve indirme](https://github.com/shakethat01/ShakeChat/releases/tag/app-v1.9.13).
- Test ZIP'i: CI artifact `11058390506`, SHA-256 `eb648e610a0d0e4f26fbdf09e17bbd13aa36ab3d6dcb1e9e93729952306eadca`; ZIP bütünlüğü ve içindeki EXE/imza kontrol edildi.
- Resmî EXE SHA-256: `7118cf1051c5e428eaa018e4168dc09de6cc0f80700a04d3d76fde588465f66c` (GitHub release asset özeti).

## Bu oturumda tamamlanan düzeltmeler

- Mikrofon izni reddi yetkili kullanıcıyı LiveKit kanalından çıkarmaz; dinleyebilir. Cihaz listesi reddi/boşluğu kayıtlı tercihleri silmez; dinleyici kullanıcıdan mikrofon izni istenmez.
- Windows WebView mikrofon izin kararı açık kullanıcı eylemiyle varsayılana döndürülür; Windows mikrofon ayarları açılabilir. Otomatik izin verilmez, sunucu rol yetkileri korunur.
- Native teknik yayıncı tüm istemcilerde sahibine eşlenir. Kendi sistem sesine abone olunmaz. İzleyici mesajları asıl kullanıcıya gider; kendi önizlemesi izleyici sayılmaz.
- Mikrofon testi, konuşma ve native sistem sesi izole edilmeden başlamaz. Eski ses örnekleri temizlenir; hata halinde test başlamaz.
- Kaynak/kalite değişimi aynı track ve odayı korur. Görüntü en/boy oranıyla gerçekten ölçeklenir; yakalama süresi FPS bütçesine dahildir.
- Seçici iptali, kanal ayrılması, geç gelen token/başlatma ve kaynak/cihaz kaybı temizlenir. Küçük pencerede kaynak seçici kaydırılır.
- Konuşma bağlantısı zaten kapanmış olsa da SPEAK izni geri alınınca bağımsız native yayıncı kapatılır; API regresyon testi eklendi.

## Kalan iş: gerçek cihaz kabulü

**23 madde: 15 kapalı, 8 son kabul bekliyor.** SC-01–14 ve SC-16 önceki kullanıcı testleriyle kapalıdır. Açık kabul maddeleri SC-15, SC-17–23; ayrıntılar güncel listede.

Önce SC-22: etkilenen Windows kullanıcısında mikrofon izni kapalıyken kanala girip dinleme, “Mikrofon iznini yeniden iste” ve gerekirse “Windows mikrofon ayarları” üzerinden toparlama. Ardından SC-21: gerçek Windows kaynak/kalite/FPS değişimi, alıcıdaki ses seviyesi, ayrı ses sürgüleri ve test izolasyonu. Sonra kalan UI/bildirim/sunucu devri kabulü.

Native `/screen-token` API dağıtımı **tamamlandı**; bunu yeniden açık deploy işi sanma. Gerçek ses/FPS kabulü henüz yapılmadı. Etkilenen cihazdaki ilk mikrofon reddinin kök nedeni uzaktan kesinleşmedi.

1.9.12 istemci uygulama içinden 1.9.13'e güncellenebilir. Eski 1.9.13 test paketi aynı sürüm numarası nedeniyle güncelleme göstermeyebilir; o kullanıcı resmî 1.9.13 kurulumunu çalıştırmalı. **Sonraki uygulama düzeltmesinde en az 1.9.14 kullan**; aynı sürüme yeni kod basma.

## Tarihsel notlar

Eski `fix/known-issues-1.9.10` PR #2 ile birleştirilmiş; ardından 1.9.11 ve 1.9.12 çıkmıştı. Bu oturum native `e718584c53d5ba47db2e7cf122996a52d4a25c9f` üzerine devam etti. Ana toparlama commit'i `1a3bd7ae6a63061bf6b68a74b10cc30be7572b01`.

İlk CI `36575938038`, Rust testinin yanlış çalışma dizini nedeniyle statik/dinamik MSVC bağlamasında başarısız oldu. Test `apps/desktop/src-tauri` altında üretim profiliyle çalıştırılarak düzeltildi. Ara CI `36615460673`, son API yetki düzeltmesi gelince yerini son başarılı CI'ya bıraktı. Bu eski çalışmaların paketini teslim etme. Eski izin yaması ayrı çalışma kopyasında korunuyor; güncel koda yeniden uygulama.
