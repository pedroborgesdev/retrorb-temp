import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxy = { '/api': { target: env.API_PROXY_TARGET || `http://127.0.0.1:${env.API_PORT || '5000'}`, changeOrigin: true } };
  return {
    base: './', plugins: [react(), tailwindcss()],
    define: { 'import.meta.env.VITE_LOCAL_API_PORT': JSON.stringify(env.API_PORT || '5000') },
    server: { port: 5173, strictPort: true, proxy },
    preview: { port: 4173, proxy },
  };
});
