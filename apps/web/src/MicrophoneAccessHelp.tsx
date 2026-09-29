import { useState } from 'react';
import { isDesktopMicrophoneRuntime, openWindowsMicrophoneSettings, resetDesktopMicrophonePermission } from './microphoneAccess';

export function MicrophoneAccessHelp({ onRetry }: { onRetry: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const desktop = isDesktopMicrophoneRuntime();
  async function retry() {
    if (busy) return;
    setBusy(true); setError('');
    try {
      if (desktop) await resetDesktopMicrophonePermission();
      await onRetry();
    } catch { setError('İzin yeniden istenemedi. Windows mikrofon ayarlarını kontrol edip uygulamayı yeniden aç.'); }
    finally { setBusy(false); }
  }
  return <div className="mic-permission-help" role="note">
    <p>Windows → Ayarlar → Gizlilik ve güvenlik → Mikrofon: “Mikrofon erişimi” ve “Masaüstü uygulamalarının mikrofonunuza erişmesine izin ver” açık olmalı.</p>
    {!desktop && <p>Tarayıcıda adres çubuğundaki site izinlerinden Mikrofon → İzin ver seçeneğini aç.</p>}
    <div className="mic-test-toolbar">
      <button type="button" disabled={busy} onClick={() => void retry()}>{busy ? 'İzin isteniyor…' : desktop ? 'Mikrofon iznini yeniden iste' : 'Mikrofonu yeniden dene'}</button>
      {desktop && <button type="button" onClick={() => void openWindowsMicrophoneSettings().catch(() => setError('Windows ayarları açılamadı. Win+R ile ms-settings:privacy-microphone çalıştır.'))}>Windows mikrofon ayarları</button>}
    </div>
    {error && <p role="alert">{error}</p>}
  </div>;
}
