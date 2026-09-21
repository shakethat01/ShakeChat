import { defineConfig } from 'vite';

export default defineConfig(() => {
  const apiTarget = process.env.SHAKECHAT_API_PROXY_TARGET || 'http://127.0.0.1:4000';

  return {
    // Browser tarafinda API ve Socket.IO her zaman acik olan ShakeChat adresini kullanir.
    // Local dev'de Vite proxy -> :4000, public test/VPS'te ayni origin -> reverse proxy.
    define: {
      'import.meta.env.VITE_API_ORIGIN': 'window.location.origin',
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
