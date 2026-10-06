import fs from 'node:fs';
import path from 'node:path';

import type { Plugin, UserConfig } from 'vite';

import { phosphorTokenColorPlugin } from './phosphorTokenColor.ts';
import { withSingletonDepAliases } from './singletonDepAliases.ts';
import { ensureTamaguiWorkspacePaths } from './tamaguiWorkspacePaths.ts';
import { unexportedDepAliases } from './unexportedDepAliases.ts';
import { discoverPublicPackageRoots, resolvePackageMainSource } from './workspacePublicPackages.ts';

export interface CreateStorybookViteConfigOptions {
  /**
   * Absolute path to the monorepo workspace root.
   * Auto-detected by walking up from cwd looking for pnpm-workspace.yaml.
   */
  workspaceRoot?: string;

  /**
   * Additional resolve aliases merged after auto-discovered ones.
   * Use this for packages outside the standard workspace structure.
   */
  aliases?: Record<string, string>;

  /**
   * Additional Vite plugins appended after the built-in React plugin.
   */
  plugins?: UserConfig['plugins'];

  /**
   * Additional Vite define values merged with the defaults.
   */
  define?: UserConfig['define'];
}

/**
 * Creates a Vite configuration for Storybook in this monorepo.
 *
 * Auto-discovers packages/ entries (the @repo scope) and every workspace
 * package under packages/ with a package.json name (any scope). Aliases point at
 * TypeScript source; sub-path exports come from each package exports field.
 *
 * Includes React plugin, node:async_hooks stub, and Storybook optimizeDeps.
 *
 * @example
 * ```ts
 * // apps/storybook/vite.config.ts
 * import { createStorybookViteConfig } from "@repo/config/storybook";
 *
 * export default createStorybookViteConfig();
 * ```
 */
export function createStorybookViteConfig(options: CreateStorybookViteConfigOptions = {}): UserConfig {
  // See tamaguiWorkspacePaths.ts.
  ensureTamaguiWorkspacePaths();
  const workspaceRoot = options.workspaceRoot || findWorkspaceRoot();
  const packagesDir = path.join(workspaceRoot, 'packages');

  const sortedAliases = withSingletonDepAliases(
    {
      ...discoverPackageAliases(packagesDir),
      ...discoverPublicPackageViteAliases(workspaceRoot),
      ...unexportedDepAliases(workspaceRoot),
    },
    workspaceRoot,
    options.aliases,
  );

  return {
    define: {
      'process.env.VITE_ENVIRONMENT': JSON.stringify('client'),
      ...options.define,
    },
    resolve: {
      // Do NOT add "source" here. Workspace packages are already mapped to
      // their TypeScript source via resolve.alias. Adding "source" to the
      // global conditions causes third-party packages like @react-navigation/*
      // (which also have a "source" export condition pointing to .tsx files)
      // to resolve to TypeScript. Vite's dep optimizer cannot pre-bundle .tsx
      // files and logs "Cannot optimize dependency", leaving their CJS
      // transitive deps (color, query-string, etc.) to be served raw,
      // causing "require is not defined" / missing-export errors in the browser.
      //
      // This list does NOT resolve @react-navigation/core's internals. Those are
      // undeclared subpaths, so no condition can reach them — see
      // unexportedDepAliases, which maps them by filesystem path instead.
      //
      // "default" must be included: Rolldown 8 strictly enforces exports
      // fields and needs "default" in the conditions list to reach a target
      // that is only reachable through the default branch — including the
      // "./lib/module/*" subpath patches/@react-navigation__core@7.17.2.patch
      // adds, which one's SSRNavigationContainer fork deep-imports. Stock
      // 7.17.2 exports only "." and "./package.json", so no condition list
      // alone resolves those files; the patch is what makes them reachable
      // and this entry is what lets the resolver pick its default target.
      conditions: ['default'],
      extensions: [
        '.storybook.ts',
        '.storybook.tsx',
        '.storybook.js',
        '.storybook.jsx',
        '.web.ts',
        '.web.tsx',
        '.web.js',
        '.web.jsx',
        '.ts',
        '.tsx',
        '.js',
        '.jsx',
        '.mjs',
        '.json',
      ],
      alias: sortedAliases,
    },
    optimizeDeps: {
      // vite-plugin-rnw sets this for `build` but not for the dev optimizer,
      // so dev dies where build shims: expo-modules-core's src/ts-declarations
      // import type-only names (EventEmitter, NativeModule, …) as values.
      rolldownOptions: { shimMissingExports: true },
      include: [
        // Force dedup — these have ESM exports but must share a single instance
        'react',
        'react-dom',
        'react-native-web',
        '@tamagui/core',
        '@tamagui/web',
        '@tamagui/helpers-icon',
        'tamagui',
        // Every @tamagui/* package the story graph can reach, so the
        // whole tamagui graph is pre-bundled in ONE optimizer generation.
        //
        // Left out of `include` they are still optimized, but each lands in
        // whichever generation discovered it, and a @tamagui/* chunk from a
        // different generation carries its own copy of the tamagui config
        // registry. A component that mounts one then calls usePropsAndStyle
        // against an unconfigured instance, throws "Can't find Tamagui
        // configuration", and renders an empty #storybook-root. Measured on
        // two long-lived servers in that state: ColorPicker, Checkboxes and
        // Calendar returned 0 nodes while twelve sibling stories stayed
        // byte-identical to a healthy server, and the throw's stack put
        // IconWrapper in @tamagui_lucide-icons-2.js?v=3c685d6c calling
        // esm-*.js?v=5fbf005a — two generations in one render.
        //
        // With these listed, one server serves the entire dep graph under a
        // single ?v= (147 files, one generation) where servers without them
        // spread the same graph over 20-24. Same argument as the charts deps
        // below, and the failure it prevents is worse: a story that renders
        // nothing is recorded by a render sweep as no data rather than as a
        // failure.
        // The two below were the last found on their own ?v= after the list
        // above landed: a fresh dev server's sweep of all 2165 stories served
        // @tamagui_animations-css (the theme's css driver) and
        // @tamagui_react-native-svg (Svg, the markdown icons) at hashes of
        // their own while the other 21 tamagui dep files shared one.
        '@tamagui/animations-css',
        '@tamagui/react-native-svg',
        '@tamagui/colors',
        '@tamagui/config',
        '@tamagui/config/v5',
        '@tamagui/constants',
        '@tamagui/font-inter',
        '@tamagui/get-font-sized',
        '@tamagui/get-token',
        '@tamagui/input',
        '@tamagui/label',
        '@tamagui/linear-gradient',
        '@tamagui/lucide-icons-2',
        '@tamagui/popover',
        '@tamagui/portal',
        '@tamagui/roving-focus',
        '@tamagui/separator',
        '@tamagui/sheet',
        '@tamagui/shorthands',
        '@tamagui/stacks',
        '@tamagui/text',
        '@tamagui/theme-builder',
        '@tamagui/themes',
        '@tamagui/toast',
        '@tamagui/use-presence',
        // Keep dev on the same single record the build now pins by
        // alias, so a cookie-context bug can never be dev-only again.
        'react-cookie',
        // Subpath, not a package: packages/components/src/tamagui.ts re-exports
        // LinearGradient from "tamagui/linear-gradient", so the
        // story graph never reaches "@tamagui/linear-gradient" above. Without
        // this line the subpath is optimized in whatever generation discovers
        // it, carries its own tamagui core registry, and
        // components-lineargradient--default renders 0 nodes with "Can't find
        // Tamagui configuration" plus the duplicate-instances warning.
        // "@tamagui/config/v5" above is the same shape.
        'tamagui/linear-gradient',
        '@mdx-js/react',
        'i18next',
        'react-i18next',
        // Charts deps (components/src/charts) sit behind dynamically imported
        // story modules, so the initial crawl misses them; discovering them
        // mid-session triggers a re-optimization that bumps every ?v= hash and
        // 504s ("Outdated Optimize Dep") any module graph loaded before it.
        'd3-shape',
        'd3-scale',
        '@storybook-community/storybook-dark-mode',
        // Packages with broken ESM wrappers — advertise "import" condition but
        // the .mjs entry just re-imports a CJS file, or are ESM-only with no
        // default export, so Vite must pre-bundle them for interop
        'use-latest-callback',
        'escape-string-regexp',
        // Pure CJS with no "import" condition — must be pre-bundled so Rolldown
        // generates ESM wrappers with synthetic named exports.
        'use-sync-external-store',
        'use-sync-external-store/with-selector',
        'fast-deep-equal',
        'color',
        // query-string v7 is CJS-only (require/exports), pulled in by
        // @react-navigation/core for URL parsing. Unlike the One app which
        // aliases it to @vxrn/query-string (ESM), Storybook has no such alias.
        'query-string',
        'react-is',
      ],
      // Keeps the nav packages out of dep pre-bundling; their CJS transitive deps
      // (color, use-sync-external-store, fast-deep-equal) are already explicitly in
      // include above so they are still pre-bundled. Note this only covers the dev
      // optimizer — the undeclared @react-navigation/core internals that `one`
      // deep-imports are handled for dev AND build by unexportedDepAliases.
      exclude: [
        'one/dist/esm/vite/one-server-only.mjs',
        '@storybook/preview-api',
        '@storybook/theming',
        '@react-navigation/core',
        '@react-navigation/native',
        '@react-navigation/routers',
        '@react-navigation/elements',
        '@react-navigation/bottom-tabs',
        '@react-navigation/native-stack',
      ],
    },
    plugins: [nodeAsyncHooksStub(), phosphorTokenColorPlugin(), ...(options.plugins || [])],
  };
}

/**
 * Scans packages/ for workspace packages (the @repo scope)
 * and returns resolve aliases.
 */
function discoverPackageAliases(packagesDir: string): Record<string, string> {
  const aliases: Record<string, string> = {};

  if (!fs.existsSync(packagesDir)) {
    return aliases;
  }

  const entries = fs.readdirSync(packagesDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const pkgDir = path.join(packagesDir, entry.name);
    const pkgJsonPath = path.join(pkgDir, 'package.json');

    if (!fs.existsSync(pkgJsonPath)) {
      continue;
    }

    let pkgJson: { name?: string; exports?: Record<string, unknown> };
    try {
      pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
    } catch {
      continue;
    }

    const pkgName = pkgJson.name;
    if (!pkgName) {
      continue;
    }
    if (!pkgName.startsWith('@repo/')) {
      continue;
    }

    mergePackageResolveAliases(pkgDir, pkgName, pkgJson, aliases);
  }

  return aliases;
}

/** All workspace packages under packages/ (any npm scope), including export subpaths. */
function discoverPublicPackageViteAliases(workspaceRoot: string): Record<string, string> {
  const aliases: Record<string, string> = {};
  for (const [pkgName, pkgDir] of discoverPublicPackageRoots(workspaceRoot)) {
    const pkgJsonPath = path.join(pkgDir, 'package.json');
    let pkgJson: { name?: string; exports?: Record<string, unknown> };
    try {
      pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
    } catch {
      continue;
    }
    mergePackageResolveAliases(pkgDir, pkgName, pkgJson, aliases);
  }
  return aliases;
}

function mergePackageResolveAliases(
  pkgDir: string,
  pkgName: string,
  pkgJson: { exports?: Record<string, unknown> },
  aliases: Record<string, string>,
) {
  const mainEntry = resolvePackageMainSource(pkgDir);
  if (mainEntry) {
    aliases[pkgName] = mainEntry;
  }

  if (pkgJson.exports && typeof pkgJson.exports === 'object') {
    for (const exportKey of Object.keys(pkgJson.exports)) {
      if (exportKey === '.' || exportKey === './package.json') {
        continue;
      }

      const subpath = exportKey.replace(/^\.\//, '');
      const ext = path.extname(subpath);

      if (ext) {
        const parentDir = path.dirname(subpath);
        if (parentDir && parentDir !== '.') {
          const fullParentDir = path.join(pkgDir, parentDir);
          if (fs.existsSync(fullParentDir) && fs.statSync(fullParentDir).isDirectory()) {
            aliases[`${pkgName}/${parentDir}`] = fullParentDir;
          }
        }
      } else {
        const resolved = resolveSubpathSource(pkgDir, subpath);
        if (resolved) {
          aliases[`${pkgName}/${subpath}`] = resolved;
        }
      }
    }
  }
}

function resolveSubpathSource(pkgDir: string, subpath: string): string | undefined {
  const candidates = [
    path.join(pkgDir, 'src', `${subpath}.storybook.ts`),
    path.join(pkgDir, 'src', `${subpath}.storybook.tsx`),
    path.join(pkgDir, 'src', `${subpath}.ts`),
    path.join(pkgDir, 'src', `${subpath}.tsx`),
    path.join(pkgDir, 'src', subpath, 'index.storybook.ts'),
    path.join(pkgDir, 'src', subpath, 'index.storybook.tsx'),
    path.join(pkgDir, 'src', subpath, 'index.ts'),
    path.join(pkgDir, 'src', subpath, 'index.tsx'),
    path.join(pkgDir, `${subpath}.storybook.ts`),
    path.join(pkgDir, `${subpath}.storybook.tsx`),
    path.join(pkgDir, `${subpath}.ts`),
    path.join(pkgDir, `${subpath}.tsx`),
    path.join(pkgDir, subpath, 'index.storybook.ts'),
    path.join(pkgDir, subpath, 'index.storybook.tsx'),
    path.join(pkgDir, subpath, 'index.ts'),
    path.join(pkgDir, subpath, 'index.tsx'),
    path.join(pkgDir, subpath, 'index.js'),
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) {
      return c;
    }
  }

  const dirPath = path.join(pkgDir, subpath);
  if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
    return dirPath;
  }

  return undefined;
}

/** Virtual module plugin that stubs `node:async_hooks` for browser environments. */
function nodeAsyncHooksStub(): Plugin {
  return {
    name: 'storybook:node-async-hooks-stub',
    resolveId(id) {
      if (id === 'node:async_hooks') {
        return '\0node:async_hooks';
      }
    },
    load(id) {
      if (id === '\0node:async_hooks') {
        return 'export class AsyncLocalStorage {}';
      }
    },
  };
}

function findWorkspaceRoot(): string {
  let dir = process.cwd();
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
      return dir;
    }
    const pkgJsonPath = path.join(dir, 'package.json');
    if (fs.existsSync(pkgJsonPath)) {
      try {
        const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
        if (pkgJson.workspaces) {
          return dir;
        }
      } catch {
        // ignore parse errors
      }
    }
    dir = path.dirname(dir);
  }
  return process.cwd();
}
