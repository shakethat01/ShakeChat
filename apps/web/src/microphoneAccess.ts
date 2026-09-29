export function isMicrophonePermissionError(error: unknown) {
  const value = error as { name?: string; message?: string } | null;
  return value?.name === 'NotAllowedError' || value?.name === 'PermissionDeniedError'
    || /permission denied|permission dismissed|not allowed by.*(user|platform)/i.test(value?.message ?? '');
}

export function microphoneErrorMessage(error: unknown) {
  if (isMicrophonePermissionError(error)) return 'Mikrofon erişimi engellendi. Windows veya tarayıcı mikrofon iznini kontrol et; bu, sunucu rolü izni değildir.';
  const value = error as { name?: string; message?: string } | null;
  if (value?.name === 'NotFoundError' || value?.name === 'DevicesNotFoundError') return 'Mikrofon bulunamadı. Cihazı bağlayıp yeniden dene.';
  if (value?.name === 'NotReadableError' || value?.name === 'TrackStartError') return 'Mikrofon açılamadı. Cihazı başka bir uygulama kullanıyor olabilir; çalışan bir mikrofon seçip yeniden dene.';
  return value?.message || 'Mikrofon açılamadı.';
}

export function isDesktopMicrophoneRuntime() {
  return typeof window !== 'undefined' && typeof (window as unknown as { __TAURI_INTERNALS__?: { invoke?: unknown } }).__TAURI_INTERNALS__?.invoke === 'function';
}

/** Called only by the user's explicit retry button; never grants permission silently. */
export async function resetDesktopMicrophonePermission() {
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('reset_microphone_permission');
}

export async function openWindowsMicrophoneSettings() {
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('open_microphone_privacy_settings');
}
