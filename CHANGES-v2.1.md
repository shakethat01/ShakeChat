# ShakeChat v2.1 — User Interaction Layer

Bu tur kullanıcı etkileşimlerini Discord benzeri tek bir sağ tık akışına yaklaştırır.

## Genel kullanıcı sağ tık menüsü

- Sağ üye listesi, mesaj yazarları, arkadaş listesi, DM listesi ve grup üyelerinde sağ tık kullanıcı menüsü açılır.
- Menü ShakeChatBot Forge/Köz temasını kullanır.
- Kullanıcı kartı / profil önizlemesi açılabilir.
- Arkadaş ekleme, bekleyen isteği kabul etme ve arkadaşlıktan çıkarma desteklenir.
- Arkadaş olan kullanıcıyla özel mesaj açılabilir.
- Kullanıcı engelleme / engeli kaldırma desteklenir.
- Kullanıcı ID kopyalama eklendi.

## Moderasyon

Aktif sunucudaki mevcut izinlere göre menü otomatik olarak moderasyon işlemleri gösterir:

- Süreli mesaj kısıtlama
- Sunucudan çıkarma
- Yasaklama

Kullanıcı kendi üzerinde moderasyon işlemi göremez; sunucu sahibi de bu hızlı menüden hedeflenmez. Asıl yetki kontrolü sunucu tarafında kalır.

## Profil kartı

- Avatar, görünen ad, kullanıcı adı ve durum metni
- Sunucu rolü
- Sunucuya katılma tarihi
- Arkadaşsa doğrudan DM açma
- Kullanıcı ID kopyalama

## Teknik not

Bu katman mevcut App akışına minimum müdahaleyle global overlay olarak çalışır. Var olan LiveKit, public browser test ve mesajlaşma altyapısı değiştirilmez.
