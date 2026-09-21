# ShakeChat v1.7 — Akış yavaş modu

- Yazı akışlarına 0–3600 saniye arası sunucu taraflı yavaş mod eklendi.
- Akış düzeni ekranında hazır seçeneklerle mesaj aralığı ayarlanabilir.
- Normal üyelerin son mesaj zamanı backend tarafından kontrol edilir; süre dolmadan yeni metin veya dosyalı mesaj 429 ile reddedilir.
- ADMINISTRATOR ve MANAGE_MESSAGES yetkileri moderasyon/duyuru işleri için yavaş modu aşabilir.
- Ses akışlarında yavaş mod kullanılamaz.
- Aktif yavaş mod, açık yazı akışının başlığında görünür.
- Mevcut mesaj, kanal ve kullanıcı verileri korunur.
