# ShakeChat v1.4 — Bas-Konuş ve Kişi Bazlı Ses Kontrolü

v1.4, test edilmiş v1.3.2 tabanı üzerinde ses kanalının günlük kullanımını iyileştirir.

## Bas-konuş

- Uygulama Ayarları > Ses & görüntü içine `Ses algılama / Bas-konuş` seçimi eklendi.
- Varsayılan bas-konuş tuşu `` ` `` (`Backquote`).
- Tuş ataması arayüzden değiştirilebilir; `Escape` yakalamayı iptal eder.
- Bas-konuş modunda ses kanalına girildiğinde mikrofon kapalı başlar.
- Atanan tuşa basıldığında LiveKit mikrofon yayını açılır; bırakıldığında kapanır.
- Pencere odağını kaybederse mikrofon güvenli şekilde kapanır.
- Hızlı bas/bırak yarışında geç kalan `enable` işleminin mikrofonu açık bırakmaması için işlem sırası korunur.
- Dock ve ses paneli mevcut giriş modunu ve aktif bas-konuş durumunu gösterir.

## Kişi bazlı ses

- Her uzak katılımcı için 0–100% yerel ses seviyesi kaydırıcısı eklendi.
- Her uzak katılımcı yalnızca bu cihazda susturulabilir/açılabilir.
- Kişi bazlı ses seviyesi localStorage'da saklanır ve sonraki aboneliklerde de uygulanır.
- Global sağırlaştırma kaldırıldığında kişi bazlı yerel susturmalar korunur.
- Bu kontroller sunucu tarafındaki SPEAK/mute yetkilerini değiştirmez; tamamen yerel playback kontrolüdür.

## Uyumluluk

- Prisma migration yok.
- Yeni npm bağımlılığı yok.
- v1.3 kamera publication-state düzeltmesi korunur.
- v1.3.2 DM unread test selector düzeltmesi korunur.
