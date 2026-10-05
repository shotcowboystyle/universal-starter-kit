import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The repo `tsconfig.base.json` extends
 * `packages/config/tsconfig/tamagui-workspace-paths.generated.json`. That file is
 * gitignored and written by the root `prepare` script. A global
 * `ignore-scripts=true` in `~/.npmrc` (or `pnpm install --ignore-scripts`)
 * skips `prepare`, so a fresh checkout carries an extends chain that points at
 * a file which does not exist. Vite's tsconfig loader then fails EVERY
 * TypeScript transform with the misleading
 * `[TSCONFIG_ERROR] Failed to load tsconfig for '<file>': Tsconfig not found`
 * (in one case all 91 forms specs failed at once, blamed on tests/setup-animations.ts).
 *
 * The config factories run before any transform, so they regenerate the file
 * here when it is absent. A published consumer outside the monorepo has no
 * generator and no such extends entry, so there is nothing to do there.
 */
export interface EnsureTamaguiWorkspacePathsOptions {
  /**
   * Directory of the @repo/config package (the one holding
   * `tsconfig/`). Defaults to the package this module ships in.
   */
  configPackageDir?: string;

  /**
   * Where the one-line notice goes when the file had to be regenerated.
   * Defaults to console.warn. Pass null to silence.
   */
  log?: ((message: string) => void) | null;
}

export interface EnsureTamaguiWorkspacePathsResult {
  generatedPath: string;
  generatorPath: string;
  status: 'present' | 'generated' | 'no-generator' | 'failed';
}

export const tamaguiWorkspacePathsFile = 'tsconfig/tamagui-workspace-paths.generated.json';
const generatorFile = '../../scripts/generate-tamagui-workspace-paths.mjs';

function thisPackageDir(): string {
  // `src/` (vitest source condition) and `lib/` (tsdown output) both sit one
  // level below the package root, same trick vitest.ts uses for
  // pinReactRequire.cjs.
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

export function ensureTamaguiWorkspacePaths(
  options: EnsureTamaguiWorkspacePathsOptions = {},
): EnsureTamaguiWorkspacePathsResult {
  // oxlint-disable-next-line no-console -- the default sink for the one-line regenerate notice
  const { configPackageDir = thisPackageDir(), log = console.warn } = options;
  const generatedPath = path.resolve(configPackageDir, tamaguiWorkspacePathsFile);
  const generatorPath = path.resolve(configPackageDir, generatorFile);
  if (fs.existsSync(generatedPath)) {
    return { generatedPath, generatorPath, status: 'present' };
  }
  if (!fs.existsSync(generatorPath)) {
    return { generatedPath, generatorPath, status: 'no-generator' };
  }
  try {
    // The generator locates the repo root from its own path, so no cwd or
    // argument is needed; it writes exactly `generatedPath`.
    execFileSync(process.execPath, [generatorPath], { stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log?.(`[@repo/config] could not regenerate ${tamaguiWorkspacePathsFile}: ${message}`);
    return { generatedPath, generatorPath, status: 'failed' };
  }
  if (!fs.existsSync(generatedPath)) {
    log?.(`[@repo/config] ${path.basename(generatorPath)} ran but did not write ${tamaguiWorkspacePathsFile}`);
    return { generatedPath, generatorPath, status: 'failed' };
  }
  log?.(
    `[@repo/config] ${tamaguiWorkspacePathsFile} was missing (the root prepare script did not run; a global ignore-scripts skips it). Regenerated it. Run \`pnpm generate:tamagui-paths\` after install to skip this step.`,
  );
  return { generatedPath, generatorPath, status: 'generated' };
}
