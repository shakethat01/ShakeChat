// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ServerOwnerActions } from './ServerOwnerActions';
const calls = vi.hoisted(() => ({ transfer: vi.fn(async () => ({})), remove: vi.fn(async () => ({})) }));
vi.mock('./api', () => ({ api: { transferServerOwnership: calls.transfer, deleteServer: calls.remove } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const props = () => ({ server: { id: 'server', name: 'Friends', channels: [] }, meId: 'alice', members: [{ id: 'alice', username: 'Alice', role: 'OWNER', online: true }, { id: 'bob', username: 'Bob', role: 'MEMBER', online: true }], onChanged: vi.fn(), onDeleted: vi.fn() });

it('does not delete until the exact server name has been typed', async () => {
  const values = props(); render(<ServerOwnerActions {...values}/>);
  const button = screen.getByRole('button', { name: 'Sunucuyu kalıcı olarak sil' }) as HTMLButtonElement;
  expect(button.disabled).toBe(true);
  fireEvent.change(screen.getByLabelText('Silinecek sunucunun adı'), { target: { value: 'Wrong' } });
  expect(button.disabled).toBe(true);
  fireEvent.change(screen.getByLabelText('Silinecek sunucunun adı'), { target: { value: 'Friends' } });
  fireEvent.click(button);
  await waitFor(() => expect(calls.remove).toHaveBeenCalledWith('server', 'Friends'));
  expect(values.onDeleted).toHaveBeenCalledOnce();
});

it('requires a second confirmation for the selected new owner', async () => {
  const values = props(); render(<ServerOwnerActions {...values}/>);
  fireEvent.change(screen.getByLabelText('Yeni sunucu sahibi'), { target: { value: 'bob' } });
  fireEvent.click(screen.getByRole('button', { name: 'Sahipliği devret' }));
  expect(calls.transfer).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Vazgeç' }));
  expect(calls.transfer).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Sahipliği devret' }));
  fireEvent.click(screen.getByRole('button', { name: 'Devri onayla' }));
  await waitFor(() => expect(calls.transfer).toHaveBeenCalledWith('server', 'bob'));
  expect(values.onChanged).toHaveBeenCalledOnce();
});
