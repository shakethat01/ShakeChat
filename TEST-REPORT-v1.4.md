# ShakeChat v1.4 — Test Notları

Hazırlık sırasında yapılan statik kontroller:

- v1.3.2 tabanı yeniden oluşturuldu; kamera ve unread hotfix'leri mevcut.
- Tüm web `.ts/.tsx` kaynakları TypeScript `transpileModule` ile syntax/parsing kontrolünden geçirildi: hata yok.
- Bas-konuş tuş etiketleme testi eklendi.
- Bas-konuş durumunun VoicePanel üzerinde görünmesi testi eklendi.
- Uzak katılımcı için kişi bazlı ses slider/mute kontrolü testi eklendi.
- Ayarlardan bas-konuş modu ve tuş atamasının localStorage'a kaydedilmesi testi eklendi.
- Ses seviyesi clamp testi eklendi.

Bu çalışma ortamında proje `node_modules` bağımlılıkları mevcut olmadığı için tam Vite/Vitest/Nest build koşturulamadı. Son doğrulama hedef Windows ortamında `npm run typecheck`, `npm run build`, `npm test` ile yapılmalıdır.
