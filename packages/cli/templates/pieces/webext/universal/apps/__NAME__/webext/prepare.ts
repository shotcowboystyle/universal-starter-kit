// Stage the loadable extension (manifest + icons + dev HMR scaffolding)
// into dist-webext. The pipeline lives in
// @repo/vite-plugin-webext; this file only supplies the
// app-owned manifest.

import path from 'node:path';

import { runWebextPrepare } from '@repo/vite-plugin-webext';

import { isDev, port } from './env';
import { getManifest } from './manifest';

runWebextPrepare({
  targetDir: import.meta.dirname,
  stagingDir: path.resolve(import.meta.dirname, '../dist-webext'),
  getManifest,
  isDev,
  port,
  watch: isDev,
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
