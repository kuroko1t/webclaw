import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        'background/service-worker': resolve(__dirname, 'src/background/service-worker.ts'),
        'content/content-script': resolve(__dirname, 'src/content/content-script.ts'),
        'content/page-bridge': resolve(__dirname, 'src/content/page-bridge.ts'),
        'sidepanel/sidepanel': resolve(__dirname, 'src/sidepanel/sidepanel.html'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: '[name].[ext]',
      },
    },
    target: 'esnext',
    minify: false,
  },
  resolve: {
    alias: {
      '@webclaw/shared': resolve(__dirname, '../shared/src/index.ts'),
    },
  },
});
