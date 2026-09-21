# ShakeChat v1.5 — Test notları

Eklenen otomatik kontroller:

- kick işlemi üye silme ile birlikte audit kaydı oluşturur
- ban nedeni trim edilerek audit geçmişine yazılır
- unban yalnızca gerçekten var olan yasak için audit kaydı üretir
- audit listeleme yetkisiz kullanıcıya kapalıdır
- audit action filtresi desteklenir
- geçersiz action filtresi reddedilir
- frontend Sunucu Ayarları > İşlem geçmişi ekranı API'yi çağırır
- frontend action filtresi doğru API parametresini gönderir

Paketleme öncesi statik kontroller ayrıca yapılmıştır. Nihai `typecheck`, `build` ve tam test paketi kullanıcının Windows geliştirme ortamında çalıştırılmalıdır.
