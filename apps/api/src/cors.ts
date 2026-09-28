/** REST and Socket.IO must accept the same web and packaged desktop origins. */
export function allowedOrigins() {
  const configured = (process.env.WEB_ORIGIN ?? 'http://localhost:5173')
    .split(',').map(value => value.trim()).filter(Boolean);
  return [...new Set([
    ...configured,
    'http://localhost:5173', 'http://127.0.0.1:5173',
    'tauri://localhost', 'http://tauri.localhost', 'https://tauri.localhost',
  ])];
}
