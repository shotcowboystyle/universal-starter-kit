// Vite config for the webext background target (MV3 service worker on
// chromium, background script on firefox) — see vite.config.webext.ts.

import { resolve } from 'node:path';

import { createWebextBackgroundConfig } from '@repo/vite-plugin-webext';
import { defineConfig } from 'vite';

import packageJson from './package.json';
import { isDev, port } from './webext/env';

export default defineConfig(
  createWebextBackgroundConfig({
    targetDir: resolve(import.meta.dirname, 'webext'),
    stagingDir: resolve(import.meta.dirname, 'dist-webext'),
    tamaguiConfig: resolve(import.meta.dirname, 'config/tamagui.config.ts'),
    packageInfo: packageJson,
    isDev,
    port,
  }),
);
