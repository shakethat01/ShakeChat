# ShakeChat v1.6

## Süreli yazma kısıtı
- Yeni `MODERATE_MEMBERS` izni.
- Sunucu üyelerine 1 dakika–7 gün arasında geçici yazma kısıtı uygulanabilir.
- Kısıt, kanal override ile `SEND_MESSAGES` tekrar verilse bile önceliklidir.
- Süre dolunca sonraki yetki kontrolünde otomatik olarak yazma yetkisi geri gelir.
- Typing olayı da `SEND_MESSAGES` kontrolünden geçtiği için kısıtlı kullanıcı yazıyor göstergesi üretemez.
- Kısıtlama ve kaldırma işlemleri v1.5 işlem geçmişine eklenir.
- Yönetici/sahip ve `ADMINISTRATOR` yetkili kullanıcılar kısıtlanamaz.
- Üye ekranında aktif kısıtın bitiş zamanı ve nedeni görünür.

Bu özellik ses kanalına müdahale etmez; yalnızca sunucu metin akışlarında yazmayı kısıtlar.
