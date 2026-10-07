// Stage the VS Code extension manifest after `pnpm build:vscode`: a VS Code
// extension's package.json IS its manifest, and the app's own package.json
// is a One/Expo app manifest — so `vsce package` runs against dist-vscode/
// with this generated one (same pattern as the webext target's generated
// manifest.json).

import { resolve } from 'node:path';

import { writeVsceManifest } from '@repo/vite-plugin-vscode';

const stagingDir = resolve(import.meta.dirname, '../dist-vscode');

await writeVsceManifest(stagingDir, {
  name: '__NAME__',
  displayName: '__NAME_PASCAL__',
  publisher: '__NAME__',
  version: '0.0.0',
  description: '__NAME__ VS Code extension',
  // The extension host builds ESM (the app is type:module) — supported
  // since VS Code 1.100.
  type: 'module',
  engines: { vscode: '^1.100.0' },
  activationEvents: [],
  contributes: {
    commands: [
      {
        command: '__NAME__.showApp',
        title: '__NAME_PASCAL__: Show App',
      },
    ],
  },
});

console.log(`[vscode] staged extension manifest → ${stagingDir}/package.json`);
