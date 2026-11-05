import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { axhubDevServerInfo } from './vite-plugins/axhub-dev-server-info';

// 静态演示站：相对 base，便于部署到 GitHub Pages 的任意子路径。
export default defineConfig({
  base: './',
  plugins: [axhubDevServerInfo(), react()],
  server: {
    port: 5178,
    host: '127.0.0.1',
    open: false,
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
  },
});
