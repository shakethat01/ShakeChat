import { useState } from 'react';
import { api, type Member, type Server } from './api';

export function ServerOwnerActions({ server, members, meId, onChanged, onDeleted }: { server: Server; members: Member[]; meId: string; onChanged: () => void; onDeleted: () => void }) {
  const [targetId, setTargetId] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [confirmTransfer, setConfirmTransfer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const target = members.find(member => member.id === targetId && member.id !== meId);
  async function transfer() {
    if (!target || busy) return;
    setBusy(true); setError('');
    try { await api.transferServerOwnership(server.id, target.id); onChanged(); }
    catch (error) { setError((error as Error).message); }
    finally { setBusy(false); setConfirmTransfer(false); }
  }
  async function remove() {
    if (busy || confirmation !== server.name) return;
    setBusy(true); setError('');
    try { await api.deleteServer(server.id, confirmation); onDeleted(); }
    catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  }
  return <div className="server-owner-actions">
    {error && <div role="alert" className="error">{error}</div>}
    <section><h3>Sahipliği devret</h3><p>Sunucu üyeleri ve mesajları korunur. Devirden sonra üye olarak kalır, istersen sunucudan ayrılabilirsin.</p>
      <label>Yeni sahip<select aria-label="Yeni sunucu sahibi" value={targetId} disabled={busy} onChange={event => { setTargetId(event.target.value); setConfirmTransfer(false); }}><option value="">Bir üye seç</option>{members.filter(member => member.id !== meId).map(member => <option key={member.id} value={member.id}>{member.displayName || member.username}</option>)}</select></label>
      {confirmTransfer && target ? <div className="confirm-strip"><p><b>{target.displayName || target.username}</b> sunucunun yeni sahibi olacak. Sahiplik yetkilerini bırakıyorsun.</p><button type="button" disabled={busy} className="primary" onClick={() => void transfer()}>Devri onayla</button><button type="button" disabled={busy} onClick={() => setConfirmTransfer(false)}>Vazgeç</button></div> : <button type="button" disabled={!target || busy} onClick={() => setConfirmTransfer(true)}>Sahipliği devret</button>}
    </section>
    <section className="server-delete-panel"><h3>Sunucuyu sil</h3><p>Bu sunucunun kanalları, mesajları ve davetleri kalıcı olarak silinir. Onaylamak için <b>{server.name}</b> yaz.</p>
      <input aria-label="Silinecek sunucunun adı" value={confirmation} disabled={busy} onChange={event => setConfirmation(event.target.value)} autoComplete="off"/>
      <button type="button" className="danger" disabled={busy || confirmation !== server.name} onClick={() => void remove()}>{busy ? 'İşlem sürüyor…' : 'Sunucuyu kalıcı olarak sil'}</button>
    </section>
  </div>;
}
