import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { singletonDepAliases } from './singleton-dep-aliases';
import { createStorybookViteConfig } from './storybook';
import { createViteConfig } from './vite';

const workspaceRoot = path.resolve(import.meta.dirname, '../../..');

const pinnedPackages = [
  {
    pkg: 'react-cookie',
    reason: `react-cookie runs React.createContext(null) at module scope. Two realpaths for it means two contexts: @repo/storybook's framework decorator renders <CookiesProvider> from one and @repo/theme's useTheme reads useCookies from the other, which throws "Missing <CookiesProvider>" with the provider sitting two lines above it in the same tree.`,
  },
  {
    pkg: '@tanstack/db',
    reason: `The frappe data client's collections are TanStack DB, and TanStack reaches React through use-sync-external-store. Two realpaths means the second record subscribes against a store nothing armed, and every data-bound page dies on load with "Cannot read properties of null (reading 'useSyncExternalStore')".`,
  },
  {
    pkg: '@tanstack/react-db',
    reason: `Measured in the installed tree: @tanstack/db has zero references to useSyncExternalStore and @tanstack/react-db has three, useLiveQuery.js among them. public/frappe depends on both and imports react-db from src/useLiveQuery.ts, so pinning the base package alone leaves the reported crash in place. The pair travels together or neither works.`,
  },
  {
    pkg: '@tanstack/react-store',
    reason: `The same split as react-db, measured the same way: @tanstack/store has zero references to useSyncExternalStore and @tanstack/react-store has three, all of them useSelector, which is what useStore calls. public/store and public/forms both reach React through it, so a second record subscribes a store nothing armed.`,
  },
];

describe(singletonDepAliases, () => {
  it.each(pinnedPackages)('pins $pkg to one existing package directory', ({ pkg, reason }) => {
    const aliases = singletonDepAliases(workspaceRoot);
    expect(aliases[pkg], `${pkg}: ${reason}`).toBeTruthy();
    expect(path.isAbsolute(aliases[pkg])).toBe(true);
    expect(fs.existsSync(path.join(aliases[pkg], 'package.json'))).toBe(true);
  });

  it('pins react and react-dom to the root copy, past nested @tamagui/*/node_modules/react', () => {
    // apps/mobile's exact react pin makes the hoisted install nest other react
    // versions under tamagui packages; without the pin the dev optimizer bundled
    // them into the tamagui chunk and every story hit a null hook dispatcher.
    const aliases = singletonDepAliases(workspaceRoot);
    for (const pkgName of ['react', 'react-dom']) {
      expect(aliases[pkgName]).toBe(path.join(workspaceRoot, 'node_modules', pkgName));
    }
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
    expect(lengths).toStrictEqual(lengths.toSorted((a, b) => b - a));
  });

  it('does not pin tamagui itself on the consumer path either', () => {
    expect(alias.tamagui).toBeUndefined();
  });
});

/** The line up to its first `//`, unless that `//` belongs to a URL scheme or an escape. */
const withoutLineComment = (line: string): string => {
  const at = line.search(/(?<![:\\])\/\//u);
  return at === -1 ? line : line.slice(0, at);
};

const withoutComments = (source: string): string =>
  source
    .replaceAll(/\/\*[\s\S]*?\*\//gu, '')
    .split('\n')
    .map((line) => withoutLineComment(line))
    .join('\n');

const referencesHook = (dir: string): boolean =>
  fs.readdirSync(dir, { withFileTypes: true }).some((entry) => {
    if (entry.name === 'node_modules') {
      return false;
    }
    const full = path.join(dir, entry.name);
    if (fs.statSync(full).isDirectory()) {
      return referencesHook(full);
    }
    return (
      /\.(?:js|cjs|mjs|ts|tsx)$/u.test(entry.name) &&
      withoutComments(fs.readFileSync(full, 'utf-8')).includes('useSyncExternalStore')
    );
  });

/**
 * Whether an installed package references `useSyncExternalStore` in the code
 * it ships. The cheap half of the membership rule, re-run against the tree so
 * the next tanstack upgrade is checked rather than assumed. Comments do not
 * count: @tanstack/db 0.8 names the hook in doc comments and calls it nowhere.
 */
const subscribesExternalStore = (pkgName: string): boolean => {
  const dir = path.join(workspaceRoot, 'node_modules', ...pkgName.split('/'));
  return fs.existsSync(dir) && referencesHook(dir);
};

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
    const lockfile = fs.readFileSync(path.join(workspaceRoot, 'pnpm-lock.yaml'), 'utf-8');
    const snapshots = lockfile.split(/^snapshots:$/mu)[1] ?? '';
    const keys = [...snapshots.matchAll(/^ {2}'(?<key>@tanstack\/react-query@[^']+)':$/gmu)].map(
      (match) => match.groups?.key,
    );
    expect(keys).toHaveLength(1);
  });
});
