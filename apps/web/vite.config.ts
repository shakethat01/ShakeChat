import { defineConfig } from 'vite';

export default defineConfig(() => {
  const apiTarget = process.env.SHAKECHAT_API_PROXY_TARGET || 'http://127.0.0.1:4000';

  return {
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
