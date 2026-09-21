# ShakeChat — Arkadaş Test Kurulumu

Bu testte ana ShakeChat sunucusu ShakeThat'in bilgisayarında çalışır. Arkadaş bilgisayarları yalnızca web istemcisini çalıştırır.

## Gerekenler

- Windows 10/11
- Node.js
- Tailscale
- ShakeChat GitHub ZIP'i

## 1. Tailscale

ShakeThat'in gönderdiği Tailscale makine paylaşım davetini kabul et ve Tailscale uygulamasında bağlı görün.

## 2. ShakeChat'i indir

GitHub'daki ShakeChat reposunu `Code > Download ZIP` ile indir ve bir klasöre çıkart.

## 3. İstemciyi çalıştır

Çıkarttığın ShakeChat klasöründe PowerShell aç.

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\start-client-windows.ps1
```

Script sunucunun Tailscale IP adresini soracak. ShakeThat'in gönderdiği `100.x.x.x` adresini gir.

İstemci açıldıktan sonra tarayıcıdan:

```text
http://localhost:5173
```

adresine gir.

## Önemli

- Docker çalıştırma.
- `start-windows.ps1` çalıştırma.
- Veritabanı kurma.
- `prisma migrate reset` çalıştırma.
- `start-client-windows.ps1` açık olduğu sürece istemci çalışır.

Bu yöntem arkadaş bilgisayarında yalnızca ShakeChat web istemcisini başlatır; tüm hesaplar, mesajlar, sunucular ve ses odaları ana ShakeChat sunucusunu kullanır.
