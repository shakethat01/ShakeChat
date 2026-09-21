# v0.2 kaynak değişiklikleri

Referans: mevcut shakechat-v0.2-full.zip. Aşağıda bu çalışmada değiştirilen/eklenen tüm dosyalar yer alır.

| Dosya | Durum | Değişiklik |
|---|---|---|
| `.gitignore` | Değişti | TypeScript derleme önbelleği hariç tutuldu. |
| `README.md` | Değişti | Güvenli güncelleme, kurulum ve sürümün gerçek kapsamı. |
| `TEST-REPORT-v0.2.md` | Yeni | Yapılan doğrulamalar, sınırlamalar ve elle test listesi. |
| `UPGRADE-v0.2.txt` | Değişti | Verileri koruyan güncelleme ve iki oturum talimatları. |
| `apps/api/src/auth/auth.controller.ts` | Değişti | JWT korumalı GET /auth/me. |
| `apps/api/src/auth/auth.module.ts` | Değişti | Mevcut AuthGuard, profil sorgusuna bağlandı. |
| `apps/api/src/auth/auth.service.ts` | Değişti | Mevcut kullanıcıyı güvenli alanlarla döndürme. |
| `apps/api/src/messages/messages.gateway.ts` | Değişti | JWT handshake, token süresi, onaylı oda katılımı, üyelik kontrolü, presence ve typing yaşam döngüsü. |
| `apps/api/src/messages/messages.service.ts` | Değişti | Son 100 mesajın doğru sıralaması; yalnızca boşluk içeren mesajı reddetme. |
| `apps/web/package.json` | Değişti | Vitest, Testing Library ve JSDOM test bağımlılıkları ve test komutu. |
| `apps/web/src/App.test.tsx` | Yeni | 4 modal, mesaj kutusu ve üye listesi testi. |
| `apps/web/src/App.tsx` | Değişti | Gerçek profil/üyeler, native modal, çok satırlı taslak, gönderme, kopyalama ve alıntılama. |
| `apps/web/src/api.ts` | Değişti | Me endpoint tipi, API hata durumu ve isteğe bağlı API origin. |
| `apps/web/src/socket.ts` | Değişti | Mevcut JWT bağlantısında ortak API origin kullanımı. |
| `apps/web/src/styles.css` | Değişti | Mevcut tema içinde mesaj/üye/textarea/modal ve mobil gezinme uyarlamaları. |
| `apps/web/src/useChat.test.tsx` | Yeni | 5 React realtime durum testi. |
| `apps/web/src/useChat.ts` | Yeni | Kanal seçimi, yeniden bağlanma, yarış güvenliği, mesaj birleştirme, presence/typing state. |
| `apps/web/src/vite-env.d.ts` | Yeni | Vite ortam değişkeni TypeScript türleri. |
| `package-lock.json` | Yeni | Kurulan bağımlılıkların tekrarlanabilir sürüm kaydı. |
| `package.json` | Değişti | TypeScript ve API + frontend test komutları. |
| `tests/realtime.test.cjs` | Yeni | 5 NestJS/Socket.IO bağlantı, yetki, presence, typing ve geçmiş testi. |

Bu listenin kendisi `CHANGES-v0.2.md` olarak eklendi.

Prisma şeması, Docker Compose, LiveKit ayarları, mevcut auth kayıt/giriş işleyişi ve REST mesaj yazma yolu korunmuştur. Kayıt/giriş servislerine yalnızca me sorgusu eklenmiştir.

`guncelleme` klasörü v0.1 kurulumunu da desteklemek için önceki v0.2 paketinde bulunan Socket.IO bağımlılıkları ve messages module/controller dosyalarını da içerir. Bunlar bu çalışmada yeniden tasarlanmadı.
