import { createVitestConfig } from '@repo/config/vitest';

export default createVitestConfig({
  tamaguiConfig: false,
  environment: 'happy-dom',
  setupFiles: ['@repo/test-utils/setup', './src/testSetup.ts'],
});
