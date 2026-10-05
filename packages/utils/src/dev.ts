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

export function lookupTranspileModules(packageDirs?: string[], { log = true }: LookupTranspileModulesOptions = {}) {
  const projectRoot = lookupProjectRoot();
  const transpileModules = [
    ...new Set(
      [
        ...new Set([
          projectRoot,
          path.resolve(projectRoot, 'app'),
          path.resolve(projectRoot, 'features'),
          ...(packageDirs || []),
        ]),
      ].map((packageDir) => {
        const pkgPath = path.join(packageDir, 'package.json');
        if (!fs.existsSync(pkgPath)) {
          return [];
        }
        try {
          return JSON.parse(fs.readFileSync(pkgPath, 'utf-8')).transpileModules || [];
        } catch (err) {
          if (log) {
            logger.error(err);
          }
          return [];
        }
      }),
    ),
  ].flat();
  if (log) {
    logger.debug('transpileModules:', transpileModules.join(', '));
  }
  return transpileModules;
}

export function lookupTamaguiModules(packageDirs?: string[], { log = true }: LookupTamaguiModulesOptions = {}) {
  const projectRoot = lookupProjectRoot();
  const tamaguiModules = [
    ...new Set([
      'tamagui',
      ...[
        ...new Set([
          projectRoot,
          path.resolve(projectRoot, 'app'),
          path.resolve(projectRoot, 'features'),
          ...(packageDirs || []),
        ]),
      ].map((packageDir) => {
        const pkgPath = path.join(packageDir, 'package.json');
        if (!fs.existsSync(pkgPath)) {
          return [];
        }
        try {
          return JSON.parse(fs.readFileSync(pkgPath, 'utf-8')).tamaguiModules || [];
        } catch (err) {
          if (log) {
            logger.error(err);
          }
          return [];
        }
      }),
    ]),
  ].flat();
  if (log) {
    logger.debug('tamaguiModules:', tamaguiModules.join(', '));
  }
  return tamaguiModules;
}

export function resolveConfig(keys: string[] = []): Record<string, string | undefined> {
  return keys.reduce<Record<string, string | undefined>>((acc: Record<string, string | undefined>, key: string) => {
    if (process.env[key]) {
      acc[key] = process.env[key];
    }
    return acc;
  }, {});
}

let _projectRoot: string | undefined;
export function lookupProjectRoot() {
  if (_projectRoot) {
    return _projectRoot;
  }
  try {
    const { stdout } = spawnSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf-8',
    });
    _projectRoot = stdout.trim();
    return _projectRoot;
  } catch {
    _projectRoot = process.cwd();
    return _projectRoot;
  }
}

/**
 * Map every public/* workspace package (and its subpath exports) to its TS
 * source. Without this, packages whose exports point at dist (e.g. table)
 * resolve to stale builds that can reference since-moved dependencies.
 *
 * Shared by the web-extension and vscode-webview target configs (the
 * pattern originated in apps/webext).
 */
export function workspaceSourceAliases(workspaceRoot?: string): Record<string, string> {
  const root = workspaceRoot ?? lookupProjectRoot();
  const aliases: Record<string, string> = {};
  const publicDir = path.join(root, 'packages');
  if (!fs.existsSync(publicDir)) {
    return aliases;
  }

  function resolveSource(pkgDir: string, subpath: string): string | undefined {
    const candidates = [
      path.join(pkgDir, 'src', `${subpath}.ts`),
      path.join(pkgDir, 'src', `${subpath}.tsx`),
      path.join(pkgDir, 'src', subpath, 'index.ts'),
      path.join(pkgDir, 'src', subpath, 'index.tsx'),
    ];
    return candidates.find((candidate) => fs.existsSync(candidate));
  }

  for (const ent of fs.readdirSync(publicDir, { withFileTypes: true })) {
    if (!ent.isDirectory()) {
      continue;
    }
    const pkgDir = path.join(publicDir, ent.name);
    const pkgJsonPath = path.join(pkgDir, 'package.json');
    if (!fs.existsSync(pkgJsonPath)) {
      continue;
    }
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8')) as {
        name?: string;
        exports?: Record<string, unknown>;
      };
      if (!pkg.name) {
        continue;
      }
      const main = resolveSource(pkgDir, 'index');
      if (main) {
        aliases[pkg.name] = main;
      }
      if (pkg.exports && typeof pkg.exports === 'object') {
        for (const key of Object.keys(pkg.exports)) {
          if (key === '.' || key === './package.json' || path.extname(key)) {
            continue;
          }
          const subpath = key.replace(/^\.\//, '');
          const resolved = resolveSource(pkgDir, subpath);
          if (resolved) {
            aliases[`${pkg.name}/${subpath}`] = resolved;
          }
        }
      }
    } catch {}
  }
  // Sort by key length descending so more-specific aliases match before
  // shorter prefixes.
  const sorted: Record<string, string> = {};
  for (const key of Object.keys(aliases).sort((a, b) => b.length - a.length)) {
    sorted[key] = aliases[key]!;
  }
  return sorted;
}

/**
 * Locate the installed `one` package directory without assuming the npm/yarn
 * hoisted layout (`<root>/node_modules/one`). Under pnpm's default isolated
 * layout `one` lives in the importing package's own node_modules (e.g.
 * `apps/<app>/node_modules/one`), so resolve like node would from the build
 * cwd and the workspace root, fall back to this package's own resolution
 * (covers pnpm's `.pnpm/node_modules` fallback), then scan upward for a
 * physical `node_modules/one`.
 */
function resolveOnePackageDir(root: string): string | undefined {
  for (const base of [path.join(process.cwd(), 'package.json'), path.join(root, 'package.json')]) {
    try {
      return path.dirname(createRequire(base).resolve('one/package.json'));
    } catch {}
  }
  try {
    return path.dirname(createRequire(import.meta.url).resolve('one/package.json'));
  } catch {}
  let dir = root;
  while (true) {
    const candidate = path.join(dir, 'node_modules/one');
    if (fs.existsSync(path.join(candidate, 'package.json'))) {
      return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return undefined;
    }
    dir = parent;
  }
}

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
export function oneServerOnlyBrowserStub(workspaceRoot?: string): Plugin {
  const root = workspaceRoot ?? lookupProjectRoot();
  const oneDir = resolveOnePackageDir(root);
  if (!oneDir) {
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
        return;
      }
      if (!importer || !(importer.includes('/node_modules/one/') || importer.startsWith(`${oneDir}/`))) {
        return;
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
}

/**
 * expo-modules-core ships `src/ts-declarations/` files that contain only
 * TypeScript type declarations. Rolldown incorrectly treats their
 * `import { ... }` statements as value imports (because `// @ts-nocheck`
 * prevents OXC from eliding them), then reports MISSING_EXPORT. Stub these
 * type-only files with empty modules.
 */
export function stubExpoTypeDeclarations(): Plugin {
  return {
    name: 'stub-expo-type-declarations',
    load(id: string) {
      if (id.includes('/expo-modules-core/src/ts-declarations/')) {
        return 'export {}';
      }
    },
  };
}

export * from './wait.ts';
