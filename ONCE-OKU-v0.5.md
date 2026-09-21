# ShakeChat v0.5 yükseltme — önce oku

Bu paket çalışan v0.4.1 kurulumunun üzerine uygulanır.

1. `npm run dev` açıksa Ctrl+C ile durdur.
2. Mevcut ShakeChat klasörünün yedeğini al.
3. ZIP içindeki `guncelleme` klasörünün **içeriğini** mevcut ShakeChat klasörünün üzerine kopyala ve Replace/Değiştir de.
4. Docker Desktop açık kalsın.
5. Proje klasöründe sırayla çalıştır:

```powershell
docker compose ps
npm install
npm run db:generate
npm run db:migrate:v05
npm run typecheck
npm run build
npm test
```

Hepsi başarılıysa:

```powershell
npm run dev
```

## Önemli
Bu sürümde gerçek Prisma migration vardır. `prisma migrate reset` veya `docker compose down -v` çalıştırma. Prisma reset isterse onaylama ve çıktıyı paylaş.

## Hızlı manuel test
- Owner -> Sunucu Ayarları -> Roller.
- `Test Rolü` oluştur, `MANAGE_CHANNELS` ver, ikinci kullanıcıya ata.
- İkinci kullanıcıda kanal oluşturma butonu açılmalı ve API işlemi başarılı olmalı.
- Yetkiyi kaldırınca istemci permission snapshot'ı yenilemeli.
- Kanal izinlerinde Üye rolüne `VIEW_CHANNEL = Reddet` ver; ikinci kullanıcı kanal listesinden kanalı kaybetmeli ve açık Socket.IO kanal odasından çıkarılmalı.
- `SEND_MESSAGES = Reddet` ver; mesaj kutusu devre dışı kalmalı ve doğrudan API isteği de 403 vermeli.
- Moderatöre `MANAGE_MESSAGES` ver; başka kullanıcının mesajını sildiğinde diğer istemcilerde mesaj anında kaybolmalı.
- Moderatör Admin'i kickleyememeli; Admin Moderatör'ü kickleyebilmeli.
