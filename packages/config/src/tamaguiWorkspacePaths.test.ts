/**
 * ensureTamaguiWorkspacePaths — regression guard for a missing generated tsconfig.
 *
 * `tsconfig.base.json` extends a gitignored generated file that only the root
 * `prepare` script writes. With a global `ignore-scripts` that script never
 * runs, the extends chain dangles, and every vitest transform in the workspace
 * dies with `[TSCONFIG_ERROR] ... Tsconfig not found`. The config factories
 * must regenerate the file themselves when it is missing.
 *
 * The real generator is exercised against a throwaway repo layout so the test
 * never touches the checkout's own generated file.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ensureTamaguiWorkspacePaths, tamaguiWorkspacePathsFile } from './tamaguiWorkspacePaths';

const realGenerator = path.resolve(__dirname, '../../../scripts/generate-tamagui-workspace-paths.mjs');

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

/**
 * A minimal repo: `scripts/` holding the generator, `public/config/tsconfig/`,
 * and one public package with a declared TypeScript source entry.
 */
function fakeRepo(generatorSource: string | null): { root: string; configDir: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mpo-97-'));
  roots.push(root);
  const configDir = path.join(root, 'public/config');
  fs.mkdirSync(path.join(configDir, 'tsconfig'), { recursive: true });
  fs.mkdirSync(path.join(root, 'public/widget/src'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'public/widget/package.json'),
    JSON.stringify({ name: '@fake/widget', exports: { '.': { source: './src/index.ts' } } }),
  );
  fs.writeFileSync(path.join(root, 'public/widget/src/index.ts'), 'export const widget = 1;\n');
  if (generatorSource !== null) {
    fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(root, 'scripts/generate-tamagui-workspace-paths.mjs'), generatorSource);
  }
  return { root, configDir };
}

describe('ensureTamaguiWorkspacePaths', () => {
  it('does nothing outside the monorepo, where no generator exists', () => {
    const { configDir } = fakeRepo(null);
    const notices: string[] = [];
    const result = ensureTamaguiWorkspacePaths({
      configPackageDir: configDir,
      log: (message) => notices.push(message),
    });
    expect(result.status).toBe('no-generator');
    expect(fs.existsSync(path.join(configDir, tamaguiWorkspacePathsFile))).toBe(false);
    expect(notices).toEqual([]);
  });

  it('reports a crashing generator instead of throwing', () => {
    const { configDir } = fakeRepo("process.stderr.write('boom\\n'); process.exit(3);\n");
    const notices: string[] = [];
    const result = ensureTamaguiWorkspacePaths({
      configPackageDir: configDir,
      log: (message) => notices.push(message),
    });
    expect(result.status).toBe('failed');
    expect(fs.existsSync(path.join(configDir, tamaguiWorkspacePathsFile))).toBe(false);
    expect(notices).toHaveLength(1);
    expect(notices[0]).toContain('could not regenerate');
  });
});
