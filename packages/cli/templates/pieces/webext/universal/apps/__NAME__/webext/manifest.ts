import fs from 'node:fs';
import path from 'node:path';

import { isFirefoxExtension } from '@repo/platform';
import type { Manifest } from 'webextension-polyfill';

import { isDev, port } from './env';

/** Extension display identity — the app's package.json name (@app/__NAME__)
 *  is the workspace manifest, not a user-facing extension name. */
const DISPLAY_NAME = '__NAME_PASCAL__';

export async function getManifest() {
  const pkg = JSON.parse(await fs.promises.readFile(path.resolve(import.meta.dirname, '../package.json'), 'utf-8')) as {
    version?: string;
    description?: string;
  };
  const manifest: Manifest.WebExtensionManifest = {
    manifest_version: 3,
    name: DISPLAY_NAME,
    version: pkg.version || '0.0.0',
    description: pkg.description,
    action: {
      default_icon: './assets/icon-512.png',
      default_popup: './dist/views/popup/index.html',
    },
    background: isFirefoxExtension
      ? {
          scripts: ['./dist/background/index.mjs'],
          type: 'module',
        }
      : {
          service_worker: './dist/background/index.mjs',
        },
    icons: {
      16: './assets/icon-512.png',
      48: './assets/icon-512.png',
      128: './assets/icon-512.png',
    },
    permissions: ['storage', 'activeTab'],
    content_security_policy: {
      extension_pages: isDev
        ? `script-src 'self' http://localhost:${port}; connect-src 'self' ws://localhost:${port} http://localhost:${port}; object-src 'self'`
        : "script-src 'self'; object-src 'self'",
    },
  };
  return manifest;
}
