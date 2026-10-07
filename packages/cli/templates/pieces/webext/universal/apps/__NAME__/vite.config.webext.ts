// Vite config for the webext views target (the popup extension page) — one
// of two builds staging the loadable MV3 extension into dist-webext (see
// also vite.config.webext-background.ts; webext/prepare.ts writes the
// manifest + static assets). The shared machinery (workspace source
// aliases, Tamagui wiring, MV3 staging layout) lives in
// @repo/vite-plugin-webext.

import { resolve } from 'node:path';

import { readPublicConfigKeys } from '@repo/config/vite';
import { resolveConfig } from '@repo/utils/dev';
import { createWebextViewsConfig } from '@repo/vite-plugin-webext';
import dotenv from 'dotenv';
import { defineConfig } from 'vite';

import packageJson from './package.json';
import { isDev, port } from './webext/env';

dotenv.config({ path: resolve(import.meta.dirname, '../../.env') });
process.env.VITE_MP_CONFIG = JSON.stringify(
  resolveConfig(readPublicConfigKeys(resolve(import.meta.dirname, '../../packages/config/config.json'))),
);

export default defineConfig(
  async () =>
    await createWebextViewsConfig({
      targetDir: resolve(import.meta.dirname, 'webext'),
      stagingDir: resolve(import.meta.dirname, 'dist-webext'),
      tamaguiConfig: resolve(import.meta.dirname, 'config/tamagui.config.ts'),
      packageInfo: packageJson,
      isDev,
      port,
      aliases: [
        // One routing layer: extension pages have no One server runtime — the
        // `one` import surface rides the stack-navigation seam instead (the
        // same DOM page stack the VS Code webview target uses).
        { find: /^one$/, replacement: '@repo/router/seam' },
      ],
    }),
);
