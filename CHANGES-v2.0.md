# ShakeChat v2.0 — Voice Presence + Forge Theme

Bu tur ShakeChat'i Discord benzeri canlı ses deneyimine yaklaştırırken görsel dili ShakeChatBot markasına taşıyor.

## Yeni görsel kimlik

- Eski yeşil/mint ağırlıklı vurgu dili kaldırıldı.
- Ana palet artık obsidyen / antrasit / molten orange / amber.
- Sunucu seçimi, aktif kanal, unread badge, focus ring, bağlantı göstergesi ve başarı durumları aynı ember diliyle birleştirildi.
- Sohbet, üyeler, modal, ayarlar, auth, composer, voice ve stream yüzeyleri daha koyu graphite/obsidian hale getirildi.
- Yeni tema override dosyası: `apps/web/src/shakechatbot-theme.css`.
- Görünüm ekranındaki eski turkuaz/yeşil palet seçenekleri v2 kimliğiyle çakışmaması için gizlendi; Forge/Köz tek ana marka paleti oldu.

## Ses kanalı deneyimi

- Ses dock'u bağlı kullanıcıları canlı gösteriyor.
- Sunucu kanal listesi görünürken bağlı kullanıcılar artık doğrudan aktif ses kanalının altında, Discord benzeri şekilde listeleniyor.
- Konuşan kullanıcı amber/orange glow ile belirginleşiyor.
- Mikrofon kapalı / yerel sessiz durumları görünür.
- Ekran paylaşan kullanıcının yanında `LIVE` rozeti var.
- Ses panelindeki katılımcı kartlarında ekran paylaşımı `YAYIN` rozetiyle belirtiliyor.
- Ses paneli üst bilgisi aktif yayın sayısını gösteriyor.

## Yayın görünümü

- Ekran paylaşımı video kartlarında `CANLI` rozeti eklendi.
- Stream tile ve metrikleri ShakeChatBot forge temasına uyarlandı.
- Yayın yapan katılımcı kartları ayrı streaming görünümü alıyor.
- Her görüntü kartında tam ekran düğmesi var.
- Her yayın/kamera kartı `öne çıkar` ile theater görünümüne alınabiliyor.
- Theater görünümünde ana yayın büyük alanda kalırken diğer görüntüler sağdaki küçük sütunda devam ediyor.
- `Izgaraya dön` ile çoklu yayın görünümüne tek tıkla geri dönülüyor.

## Test

- `Voice.test.tsx` genişletildi.
- Sidebar voice dock içinde kullanıcı listesi, konuşma durumu ve LIVE rozeti için regresyon testi var.
- Aktif voice kanalının altına kullanıcı portalı yerleştirme davranışı test ediliyor.
- Yayını öne çıkarma / ızgaraya dönme akışı test ediliyor.

## Not

Bu tur ağ / LiveKit taşıma mantığına dokunmaz. Çalışan public browser + self-hosted LiveKit mimarisi korunur.
