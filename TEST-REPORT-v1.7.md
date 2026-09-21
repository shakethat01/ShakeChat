# ShakeChat v1.7 test notları

Eklenen otomatik backend testleri:
- normal üye süre dolmadan ikinci mesajı gönderemez
- MANAGE_MESSAGES yavaş modu aşabilir
- yavaş mod kapalıysa normal mesaj akışı değişmez

Manuel test:
1. Bir TEXT akışına 10 sn yavaş mod ver.
2. Normal üyeyle mesaj gönderip hemen ikinci mesajı dene; reddedilmeli.
3. 10 sn sonra tekrar gönder; kabul edilmeli.
4. Dosyalı mesaj için de aynı kural geçerli olmalı.
5. MANAGE_MESSAGES sahibi kullanıcı beklemeden yazabilmeli.
6. VOICE akışında yavaş mod seçeneği uygulanmamalı.
