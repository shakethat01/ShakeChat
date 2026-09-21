# ShakeChat v0.3 test raporu

## Eklenen otomatik backend senaryoları

`tests/invites.test.cjs`:

1. Geçerli davetle yeni üyenin katılması
2. Geçersiz davetin reddi
3. Süresi dolmuş davetin reddi
4. İptal edilmiş davetin reddi
5. Kullanım limiti dolmuş davetin reddi
6. Duplicate üyeliğin reddi
7. Normal üyenin sunucudan ayrılması
8. OWNER'ın sunucudan ayrılamaması
9. OWNER'ın üyeyi kicklemesi ve kicklenen kullanıcının kanal erişimini kaybetmesi
10. Outsider kullanıcının üye listesini okuyamaması

## Frontend test kapsamına eklenenler

- Sunucu ayarlarının açılması
- Davetler sekmesinden davet oluşturulması
- `member:joined` / `member:removed` ile üye listesinin canlı güncellenmesi
- `server:removed` olayının uygulamaya iletilmesi

Mevcut v0.2 realtime, reconnect, typing, presence, JWT, kanal izolasyonu ve son 100 mesaj testleri korunmuştur.

## Bu çalışma ortamındaki doğrulama

- Tüm `.ts` / `.tsx` kaynakları TypeScript parser/transpile kontrolünden geçti: sözdizimi hatası bulunmadı.
- `tests/*.test.cjs` dosyaları `node --check` ile sözdizimi kontrolünden geçti.
- Paket bağımlılıklarının yeniden kurulması bu sandbox ortamında ağ timeout'una uğradığı için burada tam `npm test` ve Prisma generate çalıştırılamadı.

Bu nedenle son kabul testi Windows makinede şu sırayla yapılmalıdır:

```powershell
npm install
npm run db:generate
npm run db:migrate:v03
npm run typecheck
npm run build
npm test
```

Herhangi bir hata çıkarsa migration/reset işlemini zorlamadan terminal çıktısını paylaşın.
