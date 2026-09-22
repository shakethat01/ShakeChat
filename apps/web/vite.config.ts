import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const apiTarget = process.env.SHAKECHAT_API_PROXY_TARGET || 'http://127.0.0.1:4000';

  return {
    // Browser tarafinda API ve Socket.IO her zaman acik olan ShakeChat adresini kullanir.
    // Local dev'de Vite proxy -> :4000, public test/VPS'te ayni origin -> reverse proxy.
    // Public browser builds stay same-origin. The Tauri release build sets
    // VITE_API_ORIGIN to the public ShakeChat backend so file:// / tauri://
    // never tries to parse the desktop shell HTML as an API JSON response.
    define: {
      'import.meta.env.VITE_API_ORIGIN': JSON.stringify(env.VITE_API_ORIGIN || 'same-origin'),
    },
    server: {
      allowedHosts: ['localhost', '127.0.0.1', '.trycloudflare.com'],
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: false,
        },
        '/socket.io': {
          target: apiTarget,
          changeOrigin: false,
          ws: true,
        },
      },
    },
  };
});
