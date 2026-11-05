import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 静态演示站：相对 base，便于部署到 GitHub Pages 的任意子路径。
export default defineConfig({
  base: './',
  plugins: [react()],
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
