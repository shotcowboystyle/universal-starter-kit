import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import type { Plugin } from 'vite';

const logger = console;

export interface LookupTranspileModulesOptions {
  log?: boolean;
}

export interface LookupTamaguiModulesOptions {
  log?: boolean;
}
const PACKAGE_JSON = 'package.json';

let _projectRoot: string | undefined;

export const lookupProjectRoot = () => {
  if (_projectRoot !== undefined && _projectRoot !== '') {
    return _projectRoot;
  }
  try {
    // oxlint-disable-next-line sonarjs/no-os-command-from-path -- dev-time tooling; git is resolved from the developer's PATH on purpose
    const { stdout } = spawnSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf-8',
    });
    _projectRoot = stdout.trim();
    return _projectRoot;
  } catch {
    _projectRoot = process.cwd();
    return _projectRoot;
  }
};

type ModuleListField = 'tamaguiModules' | 'transpileModules';

type PackageModules = Partial<Record<ModuleListField, string[]>>;

const readModuleList = (packageDir: string, field: ModuleListField, log: boolean): string[] => {
  const pkgPath = path.join(packageDir, PACKAGE_JSON);
  if (!fs.existsSync(pkgPath)) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- SAFETY: package.json module-list fields, when present, are string arrays; a null document makes the read throw and is handled below
    return (parsed as PackageModules)[field] ?? [];
  } catch (error) {
    if (log) {
      logger.error(error);
    }
    return [];
  }
};

export const lookupTranspileModules = (packageDirs?: string[], { log = true }: LookupTranspileModulesOptions = {}) => {
  const projectRoot = lookupProjectRoot();
  const transpileModules = [
    ...new Set(
      [
        ...new Set([
          projectRoot,
          path.resolve(projectRoot, 'app'),
          path.resolve(projectRoot, 'features'),
          ...(packageDirs ?? []),
        ]),
      ].map((packageDir) => readModuleList(packageDir, 'transpileModules', log)),
    ),
  ].flat();
  if (log) {
    logger.debug('transpileModules:', transpileModules.join(', '));
  }
  return transpileModules;
};

export const lookupTamaguiModules = (packageDirs?: string[], { log = true }: LookupTamaguiModulesOptions = {}) => {
  const projectRoot = lookupProjectRoot();
  const tamaguiModules = [
    ...new Set([
      'tamagui',
      ...[
        ...new Set([
          projectRoot,
          path.resolve(projectRoot, 'app'),
          path.resolve(projectRoot, 'features'),
          ...(packageDirs ?? []),
        ]),
      ].map((packageDir) => readModuleList(packageDir, 'tamaguiModules', log)),
    ]),
  ].flat();
  if (log) {
    logger.debug('tamaguiModules:', tamaguiModules.join(', '));
  }
  return tamaguiModules;
};

export const resolveConfig = (keys: string[] = []) => {
  const config: Record<string, string | undefined> = {};
  for (const key of keys) {
    const value = process.env[key];
    if (value !== undefined && value !== '') {
      config[key] = value;
    }
  }
  return config;
};

interface PackageManifest {
  name?: string;
  exports?: object | string | null;
}

const resolveSource = (pkgDir: string, subpath: string): string | undefined => {
  const candidates = [
    path.join(pkgDir, 'src', `${subpath}.ts`),
    path.join(pkgDir, 'src', `${subpath}.tsx`),
    path.join(pkgDir, 'src', subpath, 'index.ts'),
    path.join(pkgDir, 'src', subpath, 'index.tsx'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate));
};

const readManifest = (pkgDir: string): PackageManifest | null => {
  const pkgJsonPath = path.join(pkgDir, PACKAGE_JSON);
  if (!fs.existsSync(pkgJsonPath)) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- SAFETY: only `name` and `exports` are read, and the caller handles both being absent
    return parsed as PackageManifest | null;
  } catch {
    // Safe to continue: a malformed package.json simply contributes no aliases
    return null;
  }
};

const exportSubpaths = (exportsField: PackageManifest['exports']): string[] => {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- package.json "exports" may legally be a string, array or object; only a non-null object has subpath keys
  if (exportsField === null || typeof exportsField !== 'object') {
    return [];
  }
  const subpaths: string[] = [];
  for (const key of Object.keys(exportsField)) {
    if (key !== '.' && key !== './package.json' && path.extname(key) === '') {
      subpaths.push(key.replace(/^\.\//u, ''));
    }
  }
  return subpaths;
};

const addPackageAliases = (aliases: Record<string, string>, pkgDir: string, manifest: PackageManifest): void => {
  const { name } = manifest;
  if (name === undefined || name === '') {
    return;
  }
  const main = resolveSource(pkgDir, 'index');
  if (main !== undefined) {
    aliases[name] = main;
  }
  for (const subpath of exportSubpaths(manifest.exports)) {
    const resolved = resolveSource(pkgDir, subpath);
    if (resolved !== undefined) {
      aliases[`${name}/${subpath}`] = resolved;
    }
  }
};

/**
 * Map every public/* workspace package (and its subpath exports) to its TS
 * source. Without this, packages whose exports point at dist (e.g. table)
 * resolve to stale builds that can reference since-moved dependencies.
 *
 * Shared by the web-extension and vscode-webview target configs (the
 * pattern originated in apps/webext).
 */
export const workspaceSourceAliases = (workspaceRoot?: string) => {
  const root = workspaceRoot ?? lookupProjectRoot();
  const aliases: Record<string, string> = {};
  const publicDir = path.join(root, 'packages');
  if (!fs.existsSync(publicDir)) {
    return aliases;
  }

  for (const ent of fs.readdirSync(publicDir, { withFileTypes: true })) {
    if (ent.isDirectory()) {
      const pkgDir = path.join(publicDir, ent.name);
      const manifest = readManifest(pkgDir);
      if (manifest !== null) {
        addPackageAliases(aliases, pkgDir, manifest);
      }
    }
  }
  // Sort by key length descending so more-specific aliases match before
  // shorter prefixes.
  return Object.fromEntries(Object.entries(aliases).toSorted(([a], [b]) => b.length - a.length));
};

/**
 * Locate the installed `one` package directory without assuming the npm/yarn
 * hoisted layout (`<root>/node_modules/one`). Under pnpm's default isolated
 * layout `one` lives in the importing package's own node_modules (e.g.
 * `apps/<app>/node_modules/one`), so resolve like node would from the build
 * cwd and the workspace root, fall back to this package's own resolution
 * (covers pnpm's `.pnpm/node_modules` fallback), then scan upward for a
 * physical `node_modules/one`.
 */
const resolveOnePackageDir = (root: string): string | undefined => {
  for (const base of [path.join(process.cwd(), PACKAGE_JSON), path.join(root, PACKAGE_JSON)]) {
    try {
      return path.dirname(createRequire(base).resolve(`one/${PACKAGE_JSON}`));
    } catch {
      // Safe to continue: try the next resolution base
    }
  }
  try {
    return path.dirname(createRequire(import.meta.url).resolve(`one/${PACKAGE_JSON}`));
  } catch {
    // Safe to continue: fall back to scanning node_modules upward
  }
  let dir = root;
  while (true) {
    const candidate = path.join(dir, 'node_modules/one');
    if (fs.existsSync(path.join(candidate, PACKAGE_JSON))) {
      return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return undefined;
    }
    dir = parent;
  }
};

/**
 * one's client code imports ./vite/one-server-only.mjs, which pulls
 * node:async_hooks and can't bundle for the browser. Declaring it rollup-
 * `external` ships a literal node_modules import that can't resolve inside a
 * packaged extension (this exact failure made the webext popup load blank).
 * One publishes a no-op browser/native variant of the same module; redirect
 * to it instead of externalizing.
 *
 * When `one` is not installed at all, the redirect is skipped (with a one-line
 * warning) so normal resolution proceeds instead of rewriting matching ids to
 * a path that does not exist — which surfaced as a bare "No such file or
 * directory" naming the consumer's own import. The redirect also only applies
 * to imports made FROM one's own files (every real one-server-only import
 * site lives in one/dist); a consumer module whose id merely contains the
 * substring resolves normally.
 */
export const oneServerOnlyBrowserStub = (workspaceRoot?: string): Plugin => {
  const root = workspaceRoot ?? lookupProjectRoot();
  const oneDir = resolveOnePackageDir(root);
  if (oneDir === undefined) {
    logger.warn(
      `[one-server-only-browser-stub] cannot resolve the "one" package from ${root} — ` +
        'skipping the one-server-only browser redirect (normal resolution proceeds)',
    );
    return { name: 'one-server-only-browser-stub' };
  }
  const stub = path.join(oneDir, 'dist/esm/vite/one-server-only.native.js');
  return {
    name: 'one-server-only-browser-stub',
    enforce: 'pre',
    resolveId(id: string, importer?: string) {
      if (!id.includes('one-server-only')) {
        return null;
      }
      const isFromOne =
        importer !== undefined &&
        importer !== '' &&
        (importer.includes('/node_modules/one/') || importer.startsWith(`${oneDir}/`));
      if (!isFromOne) {
        return null;
      }
      if (!fs.existsSync(stub)) {
        throw new Error(
          `[one-server-only-browser-stub] "${id}" matched the one-server-only browser ` +
            `redirect, but the stub target does not exist: ${stub}. The installed "one" ` +
            'package has an unexpected layout — reinstall one, or pass a workspaceRoot ' +
            'whose node_modules contains one/dist/esm/vite/one-server-only.native.js.',
        );
      }
      return stub;
    },
  };
};

/**
 * expo-modules-core ships `src/ts-declarations/` files that contain only
 * TypeScript type declarations. Rolldown incorrectly treats their
 * `import { ... }` statements as value imports (because `// @ts-nocheck`
 * prevents OXC from eliding them), then reports MISSING_EXPORT. Stub these
 * type-only files with empty modules.
 */
export const stubExpoTypeDeclarations = (): Plugin => ({
  name: 'stub-expo-type-declarations',
  load(id: string) {
    if (id.includes('/expo-modules-core/src/ts-declarations/')) {
      return 'export {}';
    }
    return null;
  },
});

export { formatServiceList, waitForKeycloak, waitForPostgres, waitServices } from './wait.ts';
export type { WaitService } from './wait.ts';
