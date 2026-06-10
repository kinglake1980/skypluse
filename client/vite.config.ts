import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // 把 /api 代理到后端,SSE 同源。用 127.0.0.1 避免 Windows 上 localhost 解析到 ::1 导致连不上
      '/api': { target: 'http://127.0.0.1:8787', changeOrigin: true },
    },
    fs: { allow: ['..'] }, // 允许引用 monorepo 上层的 /shared
  },
});
