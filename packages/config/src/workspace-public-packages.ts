import fs from 'node:fs';
import path from 'node:path';

import { isObject, isString } from './json-guards.ts';

/** One `exports` entry: a file, nested conditions, a fallback list, or `null` (blocked). */
export type ExportTarget = string | null | ExportTarget[] | { [condition: string]: ExportTarget };

/** The `package.json` members the config presets read; anything else is not parsed. */
export interface PackageManifest {
  name?: string;
  version?: string;
  main?: string;
  module?: string;
  /** True when `workspaces` is present and truthy. */
  hasWorkspaces: boolean;
  exports?: ExportTarget;
}

const isExportTarget = (value: unknown): value is ExportTarget => {
  if (value === null || isString(value)) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every(isExportTarget);
  }
  return isObject(value) && Object.values(value).every(isExportTarget);
};

/** True for an `exports` entry that is a plain file path. */
export const isExportPath = (target: ExportTarget | undefined): target is string => isString(target);

/**
 * The `[subpath, target]` entries of an `exports` map. A string, array or absent `exports` has none.
 */
export const exportEntries = (exportsField: ExportTarget | undefined): [string, ExportTarget][] =>
  exportsField == null || isString(exportsField) || Array.isArray(exportsField) ? [] : Object.entries(exportsField);

/**
 * The subpath keys of an `exports` map. A string, array or absent `exports` has none.
 */
export const exportSubpaths = (exportsField: ExportTarget | undefined): string[] =>
  exportEntries(exportsField).map(([key]) => key);

/**
 * One condition of one subpath of an `exports` map, e.g. `exports['.'].import`.
 */
export const exportCondition = (
  exportsField: ExportTarget | undefined,
  subpath: string,
  condition: string,
): ExportTarget | undefined => {
  if (exportsField == null || isString(exportsField) || Array.isArray(exportsField)) {
    return undefined;
  }
  const entry = exportsField[subpath];
  if (entry == null || isString(entry) || Array.isArray(entry)) {
    return undefined;
  }
  return entry[condition];
};

const manifestField = (fields: Map<string, unknown>, key: string): string | undefined => {
  const value = fields.get(key);
  return isString(value) ? value : undefined;
};

/**
 * Read a `package.json`. `null` when the file is missing, is not valid JSON, or is not an object.
 * An `exports` field that is not made of strings, lists and condition maps is ignored.
 */
export const readPackageManifest = (file: string): PackageManifest | null => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    // Safe to continue: a missing or malformed package.json just means this directory is not a package.
    return null;
  }
  if (!isObject(parsed) || Array.isArray(parsed)) {
    return null;
  }
  const fields = new Map<string, unknown>(Object.entries(parsed));
  const exportsField = fields.get('exports');
  return {
    name: manifestField(fields, 'name'),
    version: manifestField(fields, 'version'),
    main: manifestField(fields, 'main'),
    module: manifestField(fields, 'module'),
    hasWorkspaces: Boolean(fields.get('workspaces')),
    exports: isExportTarget(exportsField) ? exportsField : undefined,
  };
};

/**
 * Every direct child of `packages/` with a `package.json` `name` is treated as a
 * publishable workspace package (same rule as Metro in `apps/storybook-expo`).
 *
 * Tamagui’s internal esbuild (bundling `tamagui.config` + `components`) reads
 * `compilerOptions.paths` from the repo `tsconfig.base.json` chain, including
 * `tamagui-workspace-paths.generated.json` (see `scripts/generate-tamagui-workspace-paths.mjs`).
 */
export const discoverPublicPackageRoots = (workspaceRoot: string): Map<string, string> => {
  const byName = new Map<string, string>();
  const publicDir = path.join(workspaceRoot, 'packages');
  if (!fs.existsSync(publicDir)) {
    return byName;
  }
  for (const ent of fs.readdirSync(publicDir, { withFileTypes: true })) {
    if (ent.isDirectory()) {
      const pkgRoot = path.join(publicDir, ent.name);
      const name = readPackageManifest(path.join(pkgRoot, 'package.json'))?.name;
      if (name !== undefined && name.length > 0) {
        byName.set(name, pkgRoot);
      }
    }
  }
  return byName;
};

/**
 * Main entry file for Vite/Storybook-style “compile from source” aliases.
 *
 * These aliases are only consumed by WEB Vite configs (Storybook, SPA), so
 * `.web.*` entries take priority over the plain (native) ones — otherwise a
 * package like @package/fonts resolves to its native index.ts and its
 * web-only side effects (fontsource @font-face CSS imports) never load.
 */
export const resolvePackageMainSource = (pkgDir: string): string | undefined => {
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
};

const webConditionOrder = ['import', 'default', 'require'];
const skippedConditions = new Set(['types', 'react-native']);
const tsSourcePattern = /\.(?:c|m)?tsx?$/u;

const collectExportTargets = (target: ExportTarget, out: string[]): void => {
  if (isString(target)) {
    out.push(target);
    return;
  }
  if (target === null) {
    return;
  }
  if (Array.isArray(target)) {
    for (const item of target) {
      collectExportTargets(item, out);
    }
    return;
  }
  if (isString(target.source)) {
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
};

/**
 * The file a web build should compile for one `exports` entry: its `source`
 * condition, else the first TypeScript file among its web conditions, else
 * the first existing file (css, a prebuilt .mjs), so the package-name alias
 * never swallows a subpath it cannot see.
 */
export const resolveExportSource = (pkgDir: string, target: ExportTarget): string | undefined => {
  const candidates: string[] = [];
  collectExportTargets(target, candidates);
  const existing = candidates.flatMap((c) => {
    const file = path.resolve(pkgDir, c);
    return !file.endsWith('.d.ts') && fs.existsSync(file) && fs.statSync(file).isFile() ? [file] : [];
  });
  return existing.find((c) => tsSourcePattern.test(c)) ?? existing[0];
};

/**
 * The alias a `./dir/*` pattern export contributes, or none when it does not point at a directory.
 */
const directoryAlias = (
  pkgName: string,
  pkgDir: string,
  key: string,
  target: ExportTarget,
): [string, string] | null => {
  const pattern = key.slice(2, -2);
  if (pattern.includes('*')) {
    return null;
  }
  const targets: string[] = [];
  collectExportTargets(target, targets);
  const dirTarget = targets.find((t) => t.endsWith('/*'));
  if (dirTarget === undefined || dirTarget === '') {
    return null;
  }
  const dir = path.resolve(pkgDir, dirTarget.slice(0, -2));
  return fs.existsSync(dir) && fs.statSync(dir).isDirectory() ? [`${pkgName}/${pattern}`, dir] : null;
};

/**
 * The alias one `exports` subpath contributes: `<name>/<subpath>` → its source file, or a directory for a `./dir/*` pattern.
 */
const subpathAlias = (pkgName: string, pkgDir: string, key: string, target: ExportTarget): [string, string] | null => {
  if (key === '.' || key === './package.json' || !key.startsWith('./')) {
    return null;
  }
  if (key.endsWith('/*')) {
    return directoryAlias(pkgName, pkgDir, key, target);
  }
  if (key.includes('*')) {
    return null;
  }
  const file = resolveExportSource(pkgDir, target);
  return file === undefined ? null : [`${pkgName}/${key.slice(2)}`, file];
};

/**
 * Vite `resolve.alias` entries for one package's `exports` subpaths:
 * `<name>/<subpath>` → its source file, and a `./dir/*` pattern → the directory.
 */
export const packageSubpathSourceAliases = (pkgName: string, pkgDir: string, exportsField?: ExportTarget) => {
  const aliases: Record<string, string> = {};
  for (const [key, target] of exportEntries(exportsField)) {
    const entry = subpathAlias(pkgName, pkgDir, key, target);
    if (entry !== null) {
      const [alias, file] = entry;
      aliases[alias] = file;
    }
  }
  return aliases;
};

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
export const publicPackageViteSourceAliases = (workspaceRoot: string) => {
  const subpaths: Record<string, string> = {};
  const mains: Record<string, string> = {};
  for (const [name, dir] of discoverPublicPackageRoots(workspaceRoot)) {
    const main = resolvePackageMainSource(dir);
    if (main !== undefined) {
      mains[name] = main;
    }
    const manifest = readPackageManifest(path.join(dir, 'package.json'));
    if (manifest !== null) {
      Object.assign(subpaths, packageSubpathSourceAliases(name, dir, manifest.exports));
    }
  }
  const ordered = Object.keys(subpaths).toSorted((a, b) => b.length - a.length);
  return {
    ...Object.fromEntries(ordered.map((k) => [k, subpaths[k]])),
    ...mains,
  };
};
