// Vite config for the VS Code target — extension host + Tamagui webview
// built from vscode/ into dist-vscode/, where vscode/manifest.ts drops the
// vsce package.json. The heavy lifting (workspace source aliases, one→seam
// alias, React dedupe, @tomjs/vite-plugin-vscode wiring) lives in
// @repo/vite-plugin-vscode.

import { resolve } from 'node:path';

import { createVscodeConfig } from '@repo/vite-plugin-vscode';
import { defineConfig } from 'vite';

export default defineConfig(
  async () =>
    await createVscodeConfig({
      targetDir: resolve(import.meta.dirname, 'vscode'),
      outDir: resolve(import.meta.dirname, 'dist-vscode'),
      tamaguiConfig: resolve(import.meta.dirname, 'config/tamagui.config.ts'),
    }),
);
