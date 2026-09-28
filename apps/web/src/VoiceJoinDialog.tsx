import { useEffect, useRef } from 'react';

export function VoiceJoinDialog({ name, current, busy, onConfirm, onCancel }: { name: string; current: string; busy: boolean; onConfirm: () => void; onCancel: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="modal-backdrop" aria-labelledby="voice-join-title" onCancel={event => { event.preventDefault(); if (!busy) onCancel(); }}>
    <div className="voice-confirm-panel"><h2 id="voice-join-title">Ses kanalına {current ? 'geçilsin' : 'katılınsın'} mı?</h2>
      <p><b>{name}</b> kanalına bağlanacaksın.</p>
      {current && <p><b>{current}</b> bağlantın ve varsa ekran paylaşımın kapanacak.</p>}
      <div className="modal-actions"><button type="button" disabled={busy} onClick={onCancel}>Vazgeç</button><button type="button" className="primary" disabled={busy} onClick={onConfirm}>{busy ? 'Bağlanıyor…' : 'Evet, katıl'}</button></div>
    </div>
  </dialog>;
}
