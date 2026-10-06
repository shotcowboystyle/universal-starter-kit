import fs from 'node:fs';
import Module from 'node:module';
import path from 'node:path';

import { tamaguiPlugin } from '@tamagui/vite-plugin';
import react from '@vitejs/plugin-react';
import type { Plugin, PluginOption, UserConfig } from 'vite';

import { phosphorTokenColorPlugin } from './phosphor-token-color.ts';
import { ensureTamaguiWorkspacePaths } from './tamagui-workspace-paths.ts';

const pinReactRequireSetup = path.resolve(import.meta.dirname, '../pin-react-require.cjs');

type ResolveFilename = (
  request: string,
  parent: Module | undefined,
  isMain: boolean,
  options?: { paths?: string[] },
) => string;

interface ResolverHooks {
  _resolveFilename: ResolveFilename;
  _mpoOneReact?: boolean;
}

interface ReactDirs {
  react: string;
  reactDom: string;
  scheduler: string;
}

/**
 * Where a CJS request for react / react-dom / scheduler is pinned to, if anywhere.
 */
const pinnedReactTarget = (request: string, dirs: ReactDirs): string | null => {
  if (request === 'react') {
    return dirs.react;
  }
  if (request.startsWith('react/')) {
    return path.join(dirs.react, request.slice('react/'.length));
  }
  if (request === 'react-dom') {
    return dirs.reactDom;
  }
  if (request.startsWith('react-dom/')) {
    return path.join(dirs.reactDom, request.slice('react-dom/'.length));
  }
  return request === 'scheduler' ? dirs.scheduler : null;
};

/**
 * CJS `require('react')` does not go through Vite aliases. `use-sync-external-store`
 * is a valid Node import, so Vitest leaves it external even when we ask to inline
 * it, and Node then loads the hoisted root copy — a different inode than the
 * `.pnpm` copy Vite binds. Patching Module._resolveFilename in the vitest
 * process (config eval + workers that re-load this factory) makes that
 * require land on the same physical copy as the aliases.
 */
const pinNodeReactRequire = (dirs: ReactDirs): void => {
  // SAFETY: Module._resolveFilename and Module._mpoOneReact are not in @types/node, but Node's CJS loader defines the former on every supported version and the latter is only ever written here.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- private Node loader hook that @types/node does not declare
  const ctor = Module as typeof Module & ResolverHooks;
  if (ctor._mpoOneReact) {
    return;
  }
  ctor._mpoOneReact = true;
  const orig = ctor._resolveFilename;
  ctor._resolveFilename = function _resolveFilename(request, parent, isMain, options) {
    const next = pinnedReactTarget(request, dirs);
    if (next !== null) {
      try {
        return orig.call(this, next, parent, isMain, options);
      } catch {
        // package layout didn't match — keep Node's original lookup
      }
    }
    return orig.call(this, request, parent, isMain, options);
  };
};

export interface CreateVitestConfigOptions {
  /**
   * Path to the Tamagui config file for test environments.
   * Defaults to "./tests/tamagui.config.ts".
   * Set to false to disable the Tamagui plugin.
   */
  tamaguiConfig?: string | false;

  /**
   * Test environment. Defaults to "jsdom".
   */
  environment?: 'jsdom' | 'happy-dom' | 'node';

  /**
   * Setup files to run before tests.
   */
  setupFiles?: string[];

  /**
   * Test timeout in ms. Defaults to 30000.
   */
  testTimeout?: number;

  /**
   * Additional deps to inline in test server.
   */
  inlineDeps?: string[];

  /**
   * Dependencies to externalize in test server (server.deps.external).
   */
  externalDeps?: string[];

  /**
   * Additional resolve aliases.
   */
  aliases?: Record<string, string>;

  /**
   * Coverage configuration overrides.
   */
  coverage?: {
    exclude?: string[];
  };

  /**
   * Whether to replace react-native imports with react-native-web.
   * Defaults to true.
   */
  replaceReactNative?: boolean;

  /**
   * Whether to deduplicate React to root node_modules.
   * Defaults to true. Prevents "multiple React instances" errors in monorepo.
   */
  dedupeReact?: boolean;

  /**
   * Absolute path to root node_modules for React deduplication.
   * Defaults to ../../node_modules relative to cwd.
   */
  rootNodeModules?: string;

  /**
   * Additional resolve conditions. Defaults to ["source", "test", "browser"].
   */
  conditions?: string[];

  /**
   * Test include patterns. Defaults to vitest default.
   */
  include?: string[];

  /**
   * Test exclude patterns. Defaults to vitest default.
   */
  exclude?: string[];

  /**
   * Whether to pass when no tests are found. Defaults to false.
   */
  passWithNoTests?: boolean;
}

/**
 * Rewrites `react-native` imports in app source to `react-native-web`.
 */
const replaceReactNativePlugin = (): Plugin => ({
  name: 'replace-react-native',
  transform(code: string, id: string): { code: string; map: null } | undefined {
    if (id.includes('node_modules')) {
      return undefined;
    }
    return {
      code: code.replaceAll(/from ['"]react-native['"]/gu, 'from "react-native-web"'),
      map: null,
    };
  },
});

interface OptionalTestConfig {
  include?: string[];
  exclude?: string[];
  passWithNoTests?: boolean;
}

const vitestPlugins = (replaceReactNative: boolean, tamaguiConfig: string | false): PluginOption[] => {
  const plugins: PluginOption[] = [
    react({
      jsxRuntime: 'automatic',
    }),
    phosphorTokenColorPlugin(),
  ];

  // Replace react-native imports with react-native-web
  if (replaceReactNative) {
    plugins.push(replaceReactNativePlugin());
  }

  // Tamagui plugin for test environment
  if (tamaguiConfig !== false) {
    plugins.push(
      tamaguiPlugin({
        components: ['tamagui'],
        config: tamaguiConfig,
      }),
    );
  }
  return plugins;
};

/**
 * Aliases that resolve react, react-dom and scheduler to ONE physical copy each, and the matching
 * `MPO_VITEST_*` env that pin-react-require.cjs reads in the workers.
 *
 * `.npmrc` sets `node-linker=hoisted`, so the workspace ROOT gets
 * a real `node_modules/react` directory while each package's own
 * `node_modules/react` is a symlink into `.pnpm/react@<v>/...`. Those are
 * two PHYSICALLY distinct copies of the same version, and Vite resolves
 * symlinks to their real path — so aliasing at the root while a dependency
 * (say @tanstack/react-query, whose source Vite transforms) resolves
 * through the package symlink puts two Reacts in one module graph.
 *
 * react-dom then installs its dispatcher into one copy while the component
 * tree reads the other, and every render dies on
 * `Cannot read properties of null (reading 'useEffect')` — the whole
 * components render suite, and the render half of forms.
 *
 * So resolve each package to ONE physical copy, preferring the one the
 * package under test actually resolves. react and react-dom live in
 * DIFFERENT `.pnpm` directories (`react@19.2.5` and
 * `react-dom@19.2.5_react@19.2.5`), so this is per-package: a shared
 * parent directory does not exist and assuming one loses react-dom.
 */
const dedupeReactAliases = (rootNodeModules: string) => {
  const onePhysicalCopy = (pkg: string): string => {
    for (const base of [path.resolve(process.cwd(), 'node_modules'), rootNodeModules]) {
      try {
        return fs.realpathSync(path.resolve(base, pkg));
      } catch {
        // not installed at this level — fall through to the next base
      }
    }
    return path.resolve(rootNodeModules, pkg);
  };
  const reactDir = onePhysicalCopy('react');
  const reactDomDir = onePhysicalCopy('react-dom');
  const schedulerDir = onePhysicalCopy('scheduler');
  process.env.MPO_VITEST_REACT = reactDir;
  process.env.MPO_VITEST_REACT_DOM = reactDomDir;
  process.env.MPO_VITEST_SCHEDULER = schedulerDir;
  pinNodeReactRequire({ react: reactDir, reactDom: reactDomDir, scheduler: schedulerDir });
  return {
    react: reactDir,
    'react-dom': reactDomDir,
    'react-dom/client': path.join(reactDomDir, 'client'),
    'react-dom/server': path.join(reactDomDir, 'server'),
    'react/jsx-runtime': path.join(reactDir, 'jsx-runtime'),
    'react/jsx-dev-runtime': path.join(reactDir, 'jsx-dev-runtime'),
    scheduler: schedulerDir,
  };
};

const vitestResolveAliases = (replaceReactNative: boolean, dedupeReact: boolean, rootNodeModules: string) => {
  const resolveAliases: Record<string, string> = {};
  if (replaceReactNative) {
    resolveAliases['react-native'] = 'react-native-web';
    // Replace react-native-svg with tamagui's web-safe SVG shim.
    // react-native-svg's CJS build calls require("react-native"), and in Node.js 24
    // that triggers importSyncForRequire which tries to parse react-native/index.js
    // as ESM. That file contains Flow syntax (`import typeof`) which is invalid ESM,
    // so Node.js 24 throws SyntaxError: Unexpected token 'typeof'.
    resolveAliases['react-native-svg'] = '@tamagui/react-native-svg';
  }
  if (dedupeReact) {
    Object.assign(resolveAliases, dedupeReactAliases(rootNodeModules));
  }
  return resolveAliases;
};

/**
 * The `MPO_VITEST_*` paths, kept on the `process` stub vite substitutes into transformed modules.
 */
const pinnedReactEnv = (dedupeReact: boolean) =>
  dedupeReact
    ? {
        MPO_VITEST_REACT: process.env.MPO_VITEST_REACT,
        MPO_VITEST_REACT_DOM: process.env.MPO_VITEST_REACT_DOM,
        MPO_VITEST_SCHEDULER: process.env.MPO_VITEST_SCHEDULER,
      }
    : {};

/**
 * Creates a shared Vitest configuration for workspace packages.
 *
 * This eliminates the ~100 lines of duplicated vitest config across 13+ packages,
 * handling Tamagui transforms, react-native-web replacement, React deduplication,
 * and consistent coverage/environment settings.
 *
 * @example
 * ```ts
 * // packages/components/vitest.config.mjs
 * import { createVitestConfig } from "@repo/config/vitest";
 *
 * export default createVitestConfig({
 *   setupFiles: ["./tests/setup.tsx"],
 *   tamaguiConfig: "../../features/tamagui.config.ts",
 * });
 * ```
 */
export const createVitestConfig = (options: CreateVitestConfigOptions = {}): UserConfig => {
  // The tsconfig chain below extends a generated file that a skipped
  // root `prepare` never wrote; regenerate it before vite loads any tsconfig.
  ensureTamaguiWorkspacePaths();
  const {
    tamaguiConfig = './tests/tamagui.config.ts',
    environment = 'jsdom',
    setupFiles = [],
    testTimeout = 30_000,
    inlineDeps = [],
    externalDeps = [],
    aliases = {},
    coverage,
    replaceReactNative = true,
    dedupeReact = true,
    rootNodeModules: _rootNodeModules,
    conditions = ['source', 'test', 'browser'],
    include,
    exclude,
    passWithNoTests,
  } = options;

  const rootNodeModules =
    _rootNodeModules === undefined || _rootNodeModules === ''
      ? path.resolve(process.cwd(), '../../node_modules')
      : _rootNodeModules;

  const plugins = vitestPlugins(replaceReactNative, tamaguiConfig);
  const resolveAliases = vitestResolveAliases(replaceReactNative, dedupeReact, rootNodeModules);

  const testConfig = {
    environment,
    globals: true,
    setupFiles: dedupeReact ? [pinReactRequireSetup, ...setupFiles] : setupFiles,
    testTimeout,
    coverage: {
      provider: 'v8' as const,
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: './coverage',
      all: true,
      clean: true,
      exclude: [
        'node_modules/',
        'tests/',
        '*.config.*',
        '**/*.stories.*',
        '**/*.spec.*',
        '**/*.test.*',
        ...(coverage?.exclude ?? []),
      ],
    },
    server: {
      deps: {
        // `@tanstack/*` ships `.ts` source; Vite already transforms it, but its
        // CJS child `use-sync-external-store` is a valid Node import and stays
        // external unless named here. Node then `require('react')`s the hoisted
        // root directory — a different inode than the `.pnpm` copy the aliases
        // bind. Measured Gantt stack after rebase onto main (forms Button now
        // calls `@tanstack/react-store`): useCallback from node_modules/react,
        // useSelector from @tanstack/react-store/src, react-dom from .pnpm.
        inline: [
          'react-native-web',
          'one',
          /@tamagui\//u,
          'tamagui',
          /@tanstack\//u,
          'use-sync-external-store',
          // Native ESM bypasses both the Vite React alias and the CJS require
          // pin. Transform react-i18next so useTranslation shares the renderer.
          'react-i18next',
          // Loaded natively, phosphor's IconBase never reaches the plugin
          // pipeline, so a spec would see the raw token where the browser
          // sees the resolved paint.
          '@phosphor-icons/react',
          ...inlineDeps,
        ],
        external: [pinReactRequireSetup, ...externalDeps],
        interopDefault: true,
      },
    },
  };
  const optionalTestConfig: OptionalTestConfig = {};
  if (include !== undefined) {
    optionalTestConfig.include = include;
  }
  if (exclude !== undefined) {
    optionalTestConfig.exclude = exclude;
  }
  if (passWithNoTests) {
    optionalTestConfig.passWithNoTests = true;
  }

  // SAFETY: vite's UserConfig has no `test` key until vitest augments it; the object below is the shape vitest's own defineConfig accepts.
  return {
    plugins,
    test: { ...testConfig, ...optionalTestConfig },
    resolve: {
      // Never list .test.* here. Vite tries these suffixes in order for an
      // extensionless specifier, so a leading ".test.ts" makes `import "./foo"`
      // resolve to foo.test.ts instead of foo.ts whenever both exist. That drags
      // the test file (and whatever it imports, e.g. node:test) into the module
      // graph and vitest dies with "Cannot bundle Node.js built-in node:test".
      // Test files are collected by test.include globs, not by resolution.
      extensions: ['.web.ts', '.web.tsx', '.web.js', '.web.jsx', '.ts', '.tsx', '.js', '.jsx'],
      mainFields: ['browser', 'module', 'main'],
      alias: {
        ...resolveAliases,
        ...aliases,
      },
      conditions,
      // Do not also `dedupe` react. Vite's dedupe always picks the project-root
      // copy, which under `node-linker=hoisted` is a different inode than the
      // `.pnpm` copy the aliases bind. That split is the null-dispatcher crash: the
      // alias sends react-dom to `.pnpm`, dedupe sends @tanstack/react-store's
      // `import 'react'` to the hoisted root, dispatcher is null.
      dedupe: [],
    },
    define: {
      __DEV__: true,
      global: 'globalThis',
      // This replaces the `process` identifier in transformed modules. Keep the
      // MPO_VITEST_* paths on that stub so pin-react-require.cjs still sees
      // them if Vite ever transforms the setup file.
      process: JSON.stringify({
        env: {
          NODE_ENV: 'test',
          NODE_DEBUG: false,
          ...pinnedReactEnv(dedupeReact),
        },
        platform: process.platform,
        version: process.version,
        type: 'renderer',
      }),
      'Buffer.isBuffer': "((obj) => obj?.constructor?.name === 'Buffer')",
    },
  } as UserConfig;
};
