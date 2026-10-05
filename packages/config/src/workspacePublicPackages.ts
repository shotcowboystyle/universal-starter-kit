import fs from 'node:fs';
import path from 'node:path';

/**
 * Every direct child of `packages/` with a `package.json` `name` is treated as a
 * publishable workspace package (same rule as Metro in `apps/storybook-expo`).
 *
 * Tamagui’s internal esbuild (bundling `tamagui.config` + `components`) reads
 * `compilerOptions.paths` from the repo `tsconfig.base.json` chain, including
 * `tamagui-workspace-paths.generated.json` (see `scripts/generate-tamagui-workspace-paths.mjs`).
 */
export function discoverPublicPackageRoots(workspaceRoot: string): Map<string, string> {
  const byName = new Map<string, string>();
  const publicDir = path.join(workspaceRoot, 'packages');
  if (!fs.existsSync(publicDir)) {
    return byName;
  }
  for (const ent of fs.readdirSync(publicDir, { withFileTypes: true })) {
    if (!ent.isDirectory()) {
      continue;
    }
    const pkgRoot = path.join(publicDir, ent.name);
    const pkgJsonPath = path.join(pkgRoot, 'package.json');
    if (!fs.existsSync(pkgJsonPath)) {
      continue;
    }
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8')) as { name?: string };
      if (typeof pkg.name === 'string' && pkg.name.length > 0) {
        byName.set(pkg.name, pkgRoot);
      }
    } catch {
      /* invalid package.json */
    }
  }
  return byName;
}

/**
 * Main entry file for Vite/Storybook-style “compile from source” aliases.
 *
 * These aliases are only consumed by WEB Vite configs (Storybook, SPA), so
 * `.web.*` entries take priority over the plain (native) ones — otherwise a
 * package like @package/fonts resolves to its native index.ts and its
 * web-only side effects (fontsource @font-face CSS imports) never load.
 */
export function resolvePackageMainSource(pkgDir: string): string | undefined {
  const candidates = [
    path.join(pkgDir, 'src', 'index.storybook.ts'),
    path.join(pkgDir, 'src', 'index.storybook.tsx'),
    path.join(pkgDir, 'src', 'index.web.ts'),
    path.join(pkgDir, 'src', 'index.web.tsx'),
    path.join(pkgDir, 'src', 'index.ts'),
    path.join(pkgDir, 'src', 'index.tsx'),
    path.join(pkgDir, 'index.storybook.ts'),
    path.join(pkgDir, 'index.storybook.tsx'),
    path.join(pkgDir, 'index.web.ts'),
    path.join(pkgDir, 'index.web.tsx'),
    path.join(pkgDir, 'index.ts'),
    path.join(pkgDir, 'index.tsx'),
  ];
  return candidates.find((c) => fs.existsSync(c));
}

type ExportTarget = string | null | ExportTarget[] | { [condition: string]: ExportTarget };

const webConditionOrder = ['import', 'default', 'require'];
const skippedConditions = new Set(['types', 'react-native']);
const tsSourcePattern = /\.(c|m)?tsx?$/;

function collectExportTargets(target: ExportTarget, out: string[]): void {
  if (typeof target === 'string') {
    out.push(target);
    return;
  }
  if (!target) {
    return;
  }
  if (Array.isArray(target)) {
    for (const item of target) {
      collectExportTargets(item, out);
    }
    return;
  }
  if (typeof target.source === 'string') {
    out.push(target.source);
  }
  const keys = Object.keys(target).filter((k) => k !== 'source' && !skippedConditions.has(k));
  const ordered = [
    ...webConditionOrder.filter((k) => keys.includes(k)),
    ...keys.filter((k) => !webConditionOrder.includes(k)),
  ];
  for (const key of ordered) {
    collectExportTargets(target[key], out);
  }
}

/**
 * The file a web build should compile for one `exports` entry: its `source`
 * condition, else the first TypeScript file among its web conditions, else
 * the first existing file (css, a prebuilt .mjs), so the package-name alias
 * never swallows a subpath it cannot see.
 */
export function resolveExportSource(pkgDir: string, target: ExportTarget): string | undefined {
  const candidates: string[] = [];
  collectExportTargets(target, candidates);
  const existing = candidates
    .map((c) => path.resolve(pkgDir, c))
    .filter((c) => !c.endsWith('.d.ts') && fs.existsSync(c) && fs.statSync(c).isFile());
  return existing.find((c) => tsSourcePattern.test(c)) ?? existing[0];
}

/**
 * Vite `resolve.alias` entries for one package's `exports` subpaths:
 * `<name>/<subpath>` → its source file, and a `./dir/*` pattern → the directory.
 */
export function packageSubpathSourceAliases(
  pkgName: string,
  pkgDir: string,
  exportsField: unknown,
): Record<string, string> {
  const aliases: Record<string, string> = {};
  if (!exportsField || typeof exportsField !== 'object' || Array.isArray(exportsField)) {
    return aliases;
  }
  for (const [key, target] of Object.entries(exportsField as Record<string, ExportTarget>)) {
    if (key === '.' || key === './package.json' || !key.startsWith('./')) {
      continue;
    }
    if (key.endsWith('/*')) {
      const pattern = key.slice(2, -2);
      if (pattern.includes('*')) {
        continue;
      }
      const targets: string[] = [];
      collectExportTargets(target, targets);
      const dirTarget = targets.find((t) => t.endsWith('/*'));
      if (!dirTarget) {
        continue;
      }
      const dir = path.resolve(pkgDir, dirTarget.slice(0, -2));
      if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
        aliases[`${pkgName}/${pattern}`] = dir;
      }
      continue;
    }
    if (key.includes('*')) {
      continue;
    }
    const file = resolveExportSource(pkgDir, target);
    if (file) {
      aliases[`${pkgName}/${key.slice(2)}`] = file;
    }
  }
  return aliases;
}

/**
 * Vite `resolve.alias` entries: each public package name → its TypeScript
 * main, plus every `exports` subpath → its own source file. For SPA / ad-hoc
 * Vite configs that should not list packages by hand.
 *
 * Vite matches a string alias as a prefix at a `/` boundary and takes the
 * first match, so a bare `@scope/pkg` → `src/index.ts` entry
 * rewrites `@scope/pkg/sub` to `src/index.ts/sub`. Subpath entries are therefore emitted before every bare name,
 * longest first.
 */
export function publicPackageViteSourceAliases(workspaceRoot: string): Record<string, string> {
  const subpaths: Record<string, string> = {};
  const mains: Record<string, string> = {};
  for (const [name, dir] of discoverPublicPackageRoots(workspaceRoot)) {
    const main = resolvePackageMainSource(dir);
    if (main) {
      mains[name] = main;
    }
    let exportsField: unknown;
    try {
      exportsField = (
        JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')) as {
          exports?: unknown;
        }
      ).exports;
    } catch {
      continue;
    }
    Object.assign(subpaths, packageSubpathSourceAliases(name, dir, exportsField));
  }
  const ordered = Object.keys(subpaths).sort((a, b) => b.length - a.length);
  return {
    ...Object.fromEntries(ordered.map((k) => [k, subpaths[k]])),
    ...mains,
  };
}
