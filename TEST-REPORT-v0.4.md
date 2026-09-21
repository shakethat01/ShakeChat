# ShakeChat v0.4 test raporu

## Eklenen otomatik kapsam

Backend / Node testleri:

- arkadaşlık isteği gönderme ve iki tarafta doğru yön
- kendine istek, duplicate ve reverse-request reddi
- yalnız alıcının kabul edebilmesi
- kabul sonrası tek friendship kaydı
- istek iptal/ret
- arkadaşlıktan çıkarma
- arkadaş olmayan kullanıcıyla yeni DM başlatma reddi
- aynı arkadaş çifti için idempotent tek DM konuşması
- konuşma dışı kullanıcının DM okuma/yazma reddi
- DM son 100 mesajın kronolojik dönüşü
- conversation list'te karşı kullanıcı + son mesaj
- Socket.IO DM room membership
- realtime DM mesaj teslimi
- DM typing

Frontend / Vitest kapsamı:

- mevcut sunucu/kanal/modal testleri
- Arkadaşlar ana görünümüne geçiş
- DM history + realtime dedup
- conversation switch/reconnect davranışı
- DM typing timeout

Mevcut invite, membership, channel authorization, server realtime, typing ve presence testleri korunmuştur.

## Bu ortamda doğrulama

Kaynakların TS/TSX parse kontrolü yapıldı ve yeni test dosyalarının JavaScript syntax kontrolü geçti.

Bu çalışma ortamında `npm ci` ağ/dependency indirme aşamasında zaman aşımına uğradığı için tam `npm test`, `npm run typecheck` ve `npm run build` turu burada tamamlanamadı. Windows makinede paket uygulandıktan sonra aşağıdaki komutlar zorunlu doğrulama adımıdır:

```powershell
npm install
npm run db:generate
npm run db:migrate:v04
npm run typecheck
npm run build
npm test
```

Beklenen toplam otomatik test sayısı mevcut suite'lerle birlikte yaklaşık 40'tır. Test çıktısında herhangi bir `fail` varsa v0.4 tamamlanmış sayılmamalıdır.
