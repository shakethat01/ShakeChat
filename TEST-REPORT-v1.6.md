# ShakeChat v1.6 — Test planı

Ek regresyon testleri:
- Aktif yazma kısıtı `SEND_MESSAGES` kanal allow override'ından üstün gelir.
- Süresi dolmuş kısıt doğal biçimde yazma yetkisini geri verir.
- Kısıtlama member state + audit kaydını birlikte yazar.
- Kısıt kaldırma state'i temizler ve tek audit kaydı üretir.

Manuel test:
1. İki hesap aynı alana girsin.
2. Yetkili hesap diğer üyeye 5 dakikalık yazma kısıtı versin.
3. Kısıtlı hesap mesaj gönderememeli ve typing görünmemeli.
4. Ses kanalına girmeye/konuşmaya devam edebilmeli.
5. Kısıt kaldırılınca mesaj gönderebilmeli.
6. İşlem geçmişinde uygulama/kaldırma kayıtları görünmeli.
