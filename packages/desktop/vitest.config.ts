import { defineConfig } from 'vitest/config';

// The dialog defaults are browser globals; the tests need a `window`.
export default defineConfig({ test: { environment: 'happy-dom' } });
