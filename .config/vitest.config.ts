import path from 'node:path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['apps/api/__tests__/**/*.test.{ts,tsx}', 'apps/web/__tests__/**/*.test.{ts,tsx}'],
    exclude: ['**/node_modules/**', 'apps/web/e2e/**', 'apps/api/database/**', 'packages'],
    setupFiles: [path.resolve(import.meta.dirname, './vitest.setup.ts')],
    alias: {
      '@api': path.resolve(import.meta.dirname, '../apps/api/src'),
      '@web': path.resolve(import.meta.dirname, '../apps/web/src'),
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['apps/api/src/**/*.{ts,tsx}', 'apps/web/src/**/*.{ts,tsx}'],
      exclude: [
        '**/node_modules/**',
        '**/database/**',
        '**/__tests__/**',
        '**/dist/**',
        '**/.turbo/**',
        '**/.next/**',
        '**/coverage/**',
        '**/packages/**',
      ],
    },
  },
  resolve: {
    alias: {
      '@api': path.resolve(import.meta.dirname, '../apps/api/src'),
      '@web': path.resolve(import.meta.dirname, '../apps/web/src'),
    },
  },
});
