import { defineConfig } from 'vitest/config';

// Plain config: @repo/config depends on this package, so it can't use createVitestConfig.
export default defineConfig({ test: { environment: 'node' } });
