import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const PACKAGE_JSON = 'package.json';

/**
 * Packages that create a React context at module scope and must therefore
 * resolve to exactly ONE module record across the whole bundle.
 *
 * `react-cookie` runs `React.createContext(null)` when its entry
 * evaluates. `@repo/storybook` renders `<CookiesProvider>` in the
 * framework decorator and `@repo/theme`'s `useTheme` reads it via
 * `useCookies`, so provider and consumer live in two different workspace
 * packages. When those two packages resolve `react-cookie` to two different
 * realpaths — a hoisted `node_modules/react-cookie` for the importer that does
 * not declare it, the pnpm store copy for the one that does — the entry
 * evaluates twice, there are two contexts, and `useCookies` throws
 * `Missing <CookiesProvider>` with the provider sitting two lines above it in
 * the same tree.
 *
 * Nothing catches that today. The dev server pre-bundles bare imports by
 * package NAME, which collapses both realpaths onto one `deps/react-cookie.js`
 * and renders fine; the production build has no optimizer, so both paths
 * survive, every story renders Storybook's error panel, and
 * `storybook build` still exits 0.
 *
 * `resolve.dedupe` does not fix it: measured against Vite 8 / Rolldown, a
 * build with `dedupe: ["react-cookie"]` emitted a byte-identical iframe chunk
 * and the story still threw. An alias to one absolute directory does, which is
 * the same instrument the storybook config already uses to pin react,
 * react-dom and react-is.
 *
 * `@tamagui/web` is the same shape. It owns the theme context, the
 * style registry and the config singleton; `@tamagui/core` re-exports it and
 * `tamagui` re-exports that, so every tamagui component in the tree reads the
 * theme through whichever `@tamagui/web` record its own import chain reached.
 *
 * Measured on the build's module graph at e19a0fda3: `tamagui` resolved to
 * two realpaths. 562 importers (packages/components,
 * packages/storybook and the rest) took the pnpm store copy, whose chain is
 * store `tamagui` -> store `@tamagui/core` -> store `@tamagui/web`; five took
 * the hoisted `node_modules/tamagui`, which has no nested node_modules and so
 * walks up to the hoisted `@tamagui/core` and `@tamagui/web`. Those five were
 * story files in a package with no `tamagui` copy of its own, and their
 * stories threw `Missing theme.` on storybook-static while rendering on
 * dev. The theme provider is mounted from the store record; their `Button`,
 * `Text` and `YStack` read the hoisted record's context, which no provider
 * ever wrote to.
 *
 * `tamagui` itself is deliberately NOT pinned. A directory alias resolves
 * `tamagui/linear-gradient` to `node_modules/tamagui/linear-gradient/`, a
 * metro-compat stub that `require`s the CJS build, instead of the ESM target
 * the package's exports map picks for the browser. Pinning core and web is
 * enough: both `tamagui` records import `@tamagui/core` by bare specifier, so
 * they funnel into one web record and one theme context.
 *
 * THE CRITERION, so the next addition is a decision against a rule
 * rather than a guess. A package belongs here when a second module record
 * would break it: it holds state at module scope, it subscribes an external
 * store, or it provides a React context consumers compare by identity.
 * Grepping the installed package for `useSyncExternalStore` is a cheap test
 * for the second clause, and `singleton-dep-aliases.test.ts` re-runs it against
 * the tree so a tanstack upgrade is checked rather than assumed. It is one
 * clause and not the whole rule: module-scope state no grep can see counts too.
 *
 * `@tanstack/react-query` references the hook in 25 shipped files
 * and is deliberately NOT listed. It passes the grep, but a pin only earns its
 * place where a second record can exist, and here none does. Measured at
 * 5.100.7 on 0af30157c: seven workspace packages declare it and the lockfile
 * resolves all seven to one snapshot, `5.100.7(react@19.2.5)`. The hoisted
 * install holds one physical copy. So does the isolated layout an unset
 * NPM_AUTH_TOKEN produced while .npmrc held the linker keys, rebuilt by
 * stripping them from pnpm-workspace.yaml: fourteen links, one realpath. The
 * spec re-checks both halves, so a second version or peer set fails there
 * before it splits an app.
 */
const CONTEXT_SINGLETONS: readonly string[] = [
  // React itself, the dispatcher every hook reads. apps/mobile pins the exact
  // react its react-native renderer ships (19.2.0) while the catalog resolves
  // newer, so the hoisted install nests 19.2.x copies under
  // @tamagui/*/node_modules/react. The dev optimizer bundled those into the
  // tamagui chunk and every story threw "Invalid hook call" /
  // "Cannot read properties of null (reading 'useContext')".
  'react',
  'react-dom',
  'react-cookie',
  '@tamagui/core',
  '@tamagui/web',
  // Measured at 0.11.0: @tanstack/store references useSyncExternalStore in
  // nothing it ships and @tanstack/react-store in three, all useSelector,
  // which is the call behind useStore. packages/store and packages/forms both
  // reach React through it, so a second record would subscribe a store
  // nothing armed — the same null read, one package family over.
  '@tanstack/react-store',
];

const resolvePackageDir = (pkgName: string, root: string, requireFrom: NodeJS.Require): string | undefined => {
  try {
    return path.dirname(requireFrom.resolve(`${pkgName}/package.json`));
  } catch {
    // react-cookie 8's exports map declares only ".", so "./package.json" is
    // ERR_PACKAGE_PATH_NOT_EXPORTED. Resolve the entry instead and walk up to
    // the directory that owns it — the pnpm store copy when nothing is
    // hoisted, which is exactly the copy that must win.
    try {
      let dir = path.dirname(requireFrom.resolve(pkgName));
      while (dir !== path.dirname(dir)) {
        if (fs.existsSync(path.join(dir, PACKAGE_JSON))) {
          return dir;
        }
        dir = path.dirname(dir);
      }
    } catch {
      // not installed
    }
    const hoisted = path.join(root, 'node_modules', ...pkgName.split('/'));
    return fs.existsSync(path.join(hoisted, PACKAGE_JSON)) ? hoisted : undefined;
  }
};

/**
 * Vite `resolve.alias` entries pinning each context singleton to one directory.
 *
 * Alias keys match the whole specifier or a `key + "/"` prefix, so subpath
 * imports follow the same copy instead of resolving independently. Entries are
 * omitted when the package is not installed, so a consumer that does not use
 * cookies is unaffected.
 *
 * @param root Directory whose `node_modules` the packages resolve from.
 */
export const singletonDepAliases = (root: string = process.cwd()) => {
  const aliases: Record<string, string> = {};
  const requireFrom = createRequire(path.join(root, PACKAGE_JSON));

  for (const pkgName of CONTEXT_SINGLETONS) {
    const pkgDir = resolvePackageDir(pkgName, root, requireFrom);
    if (pkgDir !== undefined) {
      aliases[pkgName] = pkgDir;
    }
  }

  return aliases;
};

/**
 * Merges `base` with the singleton pins and orders the result for Vite.
 *
 * Both entry points build `resolve.alias` through here so the list cannot go
 * out of reach again: previously only `createStorybookViteConfig` applied
 * `singletonDepAliases`, and a project generated by `mpo init` builds through
 * `createViteConfig` alone, so every package on the list resolved to two
 * records there.
 *
 * Singletons are merged last so a discovered workspace or dependency
 * alias can never shadow one. Keys are sorted longest-first because Vite tries
 * alias entries in insertion order and matches a key or its `key + "/"` prefix.
 * `overrides` are applied after the pins: a caller naming a package explicitly
 * means it.
 *
 * @param base Aliases the pins may shadow.
 * @param root Directory whose `node_modules` the packages resolve from.
 * @param overrides Aliases that win over everything, including the pins.
 */
export const withSingletonDepAliases = (
  base: Record<string, string>,
  root: string = process.cwd(),
  overrides: Record<string, string> = {},
) => {
  const merged = { ...base, ...singletonDepAliases(root), ...overrides };
  const sorted: Record<string, string> = {};
  for (const key of Object.keys(merged).toSorted((a, b) => b.length - a.length)) {
    sorted[key] = merged[key];
  }
  return sorted;
};
