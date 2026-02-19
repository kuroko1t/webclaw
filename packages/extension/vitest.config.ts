import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    environmentMatchGlobs: [
      ['src/__tests__/e2e/**', 'node'],
    ],
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@webclaw/shared': resolve(__dirname, '../shared/src/index.ts'),
    },
  },
});
