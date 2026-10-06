import path from 'path';

import { createVitestConfig } from '@repo/config/vitest';
import { mergeConfig } from 'vitest/config';

// Shared preset: react-native → react-native-web, one React copy across the
// workspace, and Tamagui-friendly dependency inlining.
const base = createVitestConfig({
  tamaguiConfig: false,
  environment: 'jsdom',
  setupFiles: ['@repo/test-utils/setup', './vitest.setup.ts'],
  include: ['__tests__/**/*.test.{ts,tsx}'],
  exclude: ['__tests__/e2e/**', '**/node_modules/**'],
  // Bundle these so they share the single React copy the preset pins.
  inlineDeps: ['zustand', '@testing-library/react', '@testing-library/dom'],
});

const config = mergeConfig(base, {
  test: {
    coverage: {
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.d.ts',
        'src/**/layout.tsx',
        'src/**/page.tsx',
        'src/**/template.tsx',
        'src/**/error.tsx',
        'src/**/loading.tsx',
        'src/**/not-found.tsx',
        '__tests__/**/',
        'src/types/**/',
        'src/components/kanban/board/**',
        'src/components/kanban/task/TaskAction.tsx',
        'src/components/kanban/project/ProjectAction.tsx',
        'src/lib/config/**',
      ],
      thresholds: {
        statements: 80,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});

// `.next.*` first so @repo/router resolves its Next.js variant, as in next.config.ts.
config.resolve = {
  ...config.resolve,
  extensions: ['.next.tsx', '.next.ts', ...(config.resolve?.extensions ?? [])],
};

export default config;
