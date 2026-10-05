import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { singletonDepAliases } from './singletonDepAliases';
import { createStorybookViteConfig } from './storybook';
import { createViteConfig } from './vite';

const workspaceRoot = path.resolve(__dirname, '../../..');

describe('singletonDepAliases', () => {
  it('pins react-cookie to one existing package directory', () => {
    // react-cookie runs React.createContext(null) at module scope. Two
    // realpaths for it means two contexts: @repo/storybook's
    // framework decorator renders <CookiesProvider> from one and
    // @repo/theme's useTheme reads useCookies from the other,
    // which throws "Missing <CookiesProvider>" with the provider sitting two
    // lines above it in the same tree.
    const aliases = singletonDepAliases(workspaceRoot);
    expect(aliases['react-cookie']).toBeTruthy();
    expect(path.isAbsolute(aliases['react-cookie'])).toBe(true);
    expect(fs.existsSync(path.join(aliases['react-cookie'], 'package.json'))).toBe(true);
  });

  it('pins the tamagui theme record to one package directory', () => {
    // @tamagui/web owns the theme context. Two realpaths for it means two
    // contexts: packages/frappe's story files import "tamagui" from a package
    // with no copy of its own, so they reach the hoisted chain while every
    // other importer reaches the pnpm store chain, and their components read
    // a context no provider ever wrote to — tamagui's `Missing theme.`.
    const aliases = singletonDepAliases(workspaceRoot);
    for (const pkg of ['@tamagui/core', '@tamagui/web']) {
      expect(aliases[pkg], `${pkg} must be pinned`).toBeTruthy();
      expect(path.isAbsolute(aliases[pkg])).toBe(true);
      expect(fs.existsSync(path.join(aliases[pkg], 'package.json'))).toBe(true);
    }
  });

  it('does not pin tamagui itself', () => {
    // A directory alias would resolve "tamagui/linear-gradient" to the
    // metro-compat stub that requires the CJS build, instead of the ESM
    // target the exports map picks for the browser. Pinning core and web is
    // enough: both tamagui records import @tamagui/core by bare specifier.
    expect(singletonDepAliases(workspaceRoot).tamagui).toBeUndefined();
  });

  it('pins the tanstack db record to one package directory', () => {
    // The frappe data client's collections are TanStack DB, and TanStack
    // reaches React through use-sync-external-store. Two realpaths means the
    // second record subscribes against a store nothing armed, and every
    // data-bound page dies on load with "Cannot read properties of null
    // (reading 'useSyncExternalStore')".
    const aliases = singletonDepAliases(workspaceRoot);
    expect(aliases['@tanstack/db']).toBeTruthy();
    expect(path.isAbsolute(aliases['@tanstack/db'])).toBe(true);
    expect(fs.existsSync(path.join(aliases['@tanstack/db'], 'package.json'))).toBe(true);
  });

  it('pins the react-facing half too, which is the one that calls the hook', () => {
    // Measured in the installed tree: @tanstack/db has zero references to
    // useSyncExternalStore and @tanstack/react-db has three, useLiveQuery.js
    // among them. public/frappe depends on both and imports react-db from
    // src/useLiveQuery.ts, so pinning the base package alone leaves the
    // reported crash in place. The pair travels together or neither works.
    const aliases = singletonDepAliases(workspaceRoot);
    expect(aliases['@tanstack/react-db']).toBeTruthy();
    expect(path.isAbsolute(aliases['@tanstack/react-db'])).toBe(true);
    expect(fs.existsSync(path.join(aliases['@tanstack/react-db'], 'package.json'))).toBe(true);
  });

  it('pins the react half of the store pair, which is the one that calls the hook', () => {
    // The same split as react-db, measured the same way: @tanstack/store has
    // zero references to useSyncExternalStore and @tanstack/react-store has
    // three, all of them useSelector, which is what useStore calls.
    // public/store and public/forms both reach React through it, so a second
    // record subscribes a store nothing armed.
    const aliases = singletonDepAliases(workspaceRoot);
    expect(aliases['@tanstack/react-store']).toBeTruthy();
    expect(path.isAbsolute(aliases['@tanstack/react-store'])).toBe(true);
    expect(fs.existsSync(path.join(aliases['@tanstack/react-store'], 'package.json'))).toBe(true);
  });

  it('omits packages that are not installed', () => {
    // Resolution runs against the given root, so a consumer without the
    // package gets no alias rather than a broken one.
    const aliases = singletonDepAliases(path.join(workspaceRoot, 'public', 'config'));
    for (const target of Object.values(aliases)) {
      expect(fs.existsSync(target)).toBe(true);
    }
  });
});

describe('createStorybookViteConfig react-cookie singleton', () => {
  const config = createStorybookViteConfig({ workspaceRoot });

  it('aliases react-cookie so the build cannot resolve two module records', () => {
    // resolve.dedupe does NOT cover this. Measured against Vite 8 / Rolldown:
    // a build carrying dedupe: ["react-cookie"] emitted a byte-identical
    // iframe chunk and the story still threw. The alias is what moves it.
    const alias = (config.resolve?.alias ?? {}) as Record<string, string>;
    expect(alias['react-cookie']).toBeTruthy();
    expect(path.isAbsolute(alias['react-cookie'])).toBe(true);
  });

  it('aliases the tamagui theme record so the build cannot split it', () => {
    const alias = (config.resolve?.alias ?? {}) as Record<string, string>;
    for (const pkg of ['@tamagui/core', '@tamagui/web']) {
      expect(alias[pkg], `${pkg} must be aliased`).toBeTruthy();
      expect(path.isAbsolute(alias[pkg])).toBe(true);
    }
    expect(alias.tamagui).toBeUndefined();
  });

  it('pre-bundles react-cookie in dev so dev and build share one record', () => {
    // The dev server hid this bug for as long as it existed: the optimizer
    // keys pre-bundled deps by package NAME, so both realpaths collapsed onto
    // one deps/react-cookie.js and every story rendered. Listing it keeps dev
    // explicit about the same invariant the build now pins by alias.
    expect(config.optimizeDeps?.include ?? []).toContain('react-cookie');
  });
});

describe('createViteConfig context singletons', () => {
  const alias = (createViteConfig({ projectRoot: workspaceRoot }).resolve?.alias ?? {}) as Record<string, string>;

  it('applies every pin on the consumer path, not only in storybook', () => {
    // This is the defect the ticket names. The list existed and only
    // createStorybookViteConfig read it. A project generated by `mpo init`
    // builds through createViteConfig and nothing else, so it inherited none
    // of it.
    const expected = singletonDepAliases(workspaceRoot);
    expect(Object.keys(expected).length).toBeGreaterThan(0);
    for (const [pkg, dir] of Object.entries(expected)) {
      expect(alias[pkg], `${pkg} must be pinned on the consumer path`).toBe(dir);
    }
  });

  it('keeps the hand-written aliases createViteConfig already carried', () => {
    expect(alias['react.mjs']).toBe('react');
    expect(alias['react-compiler-runtime']).toBe('react/compiler-runtime');
  });

  it('orders keys longest-first so a pin cannot be swallowed by a shorter one', () => {
    // Vite tries object alias entries in insertion order and matches a key or
    // its `key + "/"` prefix, so a subpath entry must precede its package.
    const lengths = Object.keys(alias).map((key) => key.length);
    expect(lengths).toEqual([...lengths].sort((a, b) => b - a));
  });

  it('does not pin tamagui itself on the consumer path either', () => {
    expect(alias.tamagui).toBeUndefined();
  });
});

describe('CONTEXT_SINGLETONS membership, measured rather than recited', () => {
  const aliases = singletonDepAliases(workspaceRoot);

  it('pins every tanstack half that subscribes an external store', () => {
    for (const pkg of ['@tanstack/react-store', '@tanstack/react-db']) {
      expect(subscribesExternalStore(pkg), `${pkg} must reference the hook`).toBe(true);
      expect(aliases[pkg], `${pkg} subscribes and must be pinned`).toBeTruthy();
    }
  });

  it('leaves the pacer pair off, which the same measurement confirms', () => {
    for (const pkg of ['@tanstack/pacer', '@tanstack/react-pacer']) {
      expect(subscribesExternalStore(pkg), `${pkg} must not reference the hook`).toBe(false);
      expect(aliases[pkg], `${pkg} has no measured reason to be pinned`).toBeUndefined();
    }
  });

  it('does not treat the grep as the whole rule', () => {
    // @tanstack/db is pinned and references the hook nowhere: it holds the
    // collection registry at module scope, which is a different clause of the
    // criterion and one no grep can see. @tanstack/store carries no such
    // registry, so silence there means what it says.
    expect(subscribesExternalStore('@tanstack/db')).toBe(false);
    expect(aliases['@tanstack/db']).toBeTruthy();
    expect(subscribesExternalStore('@tanstack/store')).toBe(false);
  });

  it('leaves react-query off while it subscribes the hook', () => {
    expect(subscribesExternalStore('@tanstack/react-query')).toBe(true);
    expect(aliases['@tanstack/react-query']).toBeUndefined();
  });

  it('locks react-query to one snapshot, so the isolated layout has one copy too', () => {
    const lockfile = fs.readFileSync(path.join(workspaceRoot, 'pnpm-lock.yaml'), 'utf8');
    const snapshots = lockfile.split(/^snapshots:$/m)[1] ?? '';
    const keys = [...snapshots.matchAll(/^ {2}'(@tanstack\/react-query@[^']+)':$/gm)].map((match) => match[1]);
    expect(keys).toHaveLength(1);
  });
});

function workspacePackageDirs(): string[] {
  const dirs = [path.join(workspaceRoot, 'features')];
  for (const group of ['apps', 'packages', 'public']) {
    const groupDir = path.join(workspaceRoot, group);
    for (const entry of fs.readdirSync(groupDir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        dirs.push(path.join(groupDir, entry.name));
      }
    }
  }
  return dirs.filter((dir) => fs.existsSync(path.join(dir, 'package.json')));
}

function declares(dir: string, pkgName: string): boolean {
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  return ['dependencies', 'devDependencies', 'peerDependencies'].some(
    (field) => manifest[field]?.[pkgName] !== undefined,
  );
}

/**
 * Whether an installed package references `useSyncExternalStore` in the code
 * it ships. The cheap half of the membership rule, re-run against the tree so
 * the next tanstack upgrade is checked rather than assumed. Comments do not
 * count: @tanstack/db 0.8 names the hook in doc comments and calls it nowhere.
 */
function subscribesExternalStore(pkgName: string): boolean {
  const dir = path.join(workspaceRoot, 'node_modules', ...pkgName.split('/'));
  return fs.existsSync(dir) && referencesHook(dir);
}

function referencesHook(dir: string): boolean {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (fs.statSync(full).isDirectory()) {
      if (referencesHook(full)) {
        return true;
      }
      continue;
    }
    if (!/\.(?:js|cjs|mjs|ts|tsx)$/.test(entry.name)) {
      continue;
    }
    if (withoutComments(fs.readFileSync(full, 'utf8')).includes('useSyncExternalStore')) {
      return true;
    }
  }
  return false;
}

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1');
}
