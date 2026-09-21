# ShakeChat v0.5 test raporu

Hazırlama ortamında yapılan kontroller:
- 53 TS/TSX kaynak dosyası TypeScript transpile parser ile tarandı: 0 sözdizimi hatası.
- `tests/*.cjs` dosyaları `node -c` ile kontrol edildi: sözdizimi hatası yok.
- v0.5 için permission resolver testleri eklendi.
- useChat için realtime message deletion ve permissions-changed testleri eklendi.

Tam `npm install / prisma generate / npm test` turu hazırlama ortamında registry indirmesi zaman aşımına uğradığı için burada tamamlanamadı. Paket, gerçek Windows kurulumunda aşağıdaki sırayla doğrulanmalıdır:

1. `npm install`
2. `npm run db:generate`
3. `npm run db:migrate:v05`
4. `npm run typecheck`
5. `npm run build`
6. `npm test`

Migration veriyi resetlemez; yeni Permission enumu ve Role / ServerMemberRole / ChannelPermission tablolarını ekler.
