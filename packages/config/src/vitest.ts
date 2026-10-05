import fs from 'node:fs';
import Module from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { tamaguiPlugin } from '@tamagui/vite-plugin';
import react from '@vitejs/plugin-react';
import type { UserConfig } from 'vite';

import { phosphorTokenColorPlugin } from './phosphorTokenColor.ts';
import { ensureTamaguiWorkspacePaths } from './tamaguiWorkspacePaths.ts';

const pinReactRequireSetup = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../pinReactRequire.cjs');

/**
 * CJS `require('react')` does not go through Vite aliases. `use-sync-external-store`
 * is a valid Node import, so Vitest leaves it external even when we ask to inline
 * it, and Node then loads the hoisted root copy — a different inode than the
 * `.pnpm` copy Vite binds. Patching Module._resolveFilename in the vitest
 * process (config eval + workers that re-load this factory) makes that
 * require land on the same physical copy as the aliases.
 */
function pinNodeReactRequire(reactDir: string, reactDomDir: string, schedulerDir: string): void {
  const ctor = Module as typeof Module & {
    _resolveFilename: (request: string, parent: unknown, isMain: boolean, options?: unknown) => string;
    _mpoOneReact?: boolean;
  };
  if (ctor._mpoOneReact) {
    return;
  }
  ctor._mpoOneReact = true;
  const orig = ctor._resolveFilename;
  ctor._resolveFilename = function pinned(request, parent, isMain, options) {
    const next =
      request === 'react'
        ? reactDir
        : request.startsWith('react/')
          ? path.join(reactDir, request.slice('react/'.length))
          : request === 'react-dom'
            ? reactDomDir
            : request.startsWith('react-dom/')
              ? path.join(reactDomDir, request.slice('react-dom/'.length))
              : request === 'scheduler'
                ? schedulerDir
                : null;
    if (next) {
      try {
        return orig.call(this, next, parent, isMain, options);
      } catch {
        // package layout didn't match — keep Node's original lookup
      }
    }
    return orig.call(this, request, parent, isMain, options);
  };
}

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
export function createVitestConfig(options: CreateVitestConfigOptions = {}): UserConfig {
  // The tsconfig chain below extends a generated file that a skipped
  // root `prepare` never wrote; regenerate it before vite loads any tsconfig.
  ensureTamaguiWorkspacePaths();
  const {
    tamaguiConfig = './tests/tamagui.config.ts',
    environment = 'jsdom',
    setupFiles = [],
    testTimeout = 30000,
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

  const rootNodeModules = _rootNodeModules || path.resolve(process.cwd(), '../../node_modules');

  const plugins: any[] = [
    react({
      jsxRuntime: 'automatic',
    }),
    phosphorTokenColorPlugin(),
  ];

  // Replace react-native imports with react-native-web
  if (replaceReactNative) {
    plugins.push({
      name: 'replace-react-native',
      transform(code: string, id: string) {
        if (id.includes('node_modules')) {
          return;
        }
        return {
          code: code.replace(/from ['"]react-native['"]/g, 'from "react-native-web"'),
          map: null,
        };
      },
    });
  }

  // Tamagui plugin for test environment
  if (tamaguiConfig !== false) {
    plugins.push(
      tamaguiPlugin({
        components: ['tamagui'],
        config: tamaguiConfig,
      } as any),
    );
  }

  // Build resolve aliases
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
    // `.npmrc` sets `node-linker=hoisted`, so the workspace ROOT gets
    // a real `node_modules/react` directory while each package's own
    // `node_modules/react` is a symlink into `.pnpm/react@<v>/...`. Those are
    // two PHYSICALLY distinct copies of the same version, and Vite resolves
    // symlinks to their real path — so aliasing at the root while a dependency
    // (say @tanstack/react-query, whose source Vite transforms) resolves
    // through the package symlink puts two Reacts in one module graph.
    //
    // react-dom then installs its dispatcher into one copy while the component
    // tree reads the other, and every render dies on
    // `Cannot read properties of null (reading 'useEffect')` — the whole
    // components render suite, and the render half of forms.
    //
    // So resolve each package to ONE physical copy, preferring the one the
    // package under test actually resolves. react and react-dom live in
    // DIFFERENT `.pnpm` directories (`react@19.2.5` and
    // `react-dom@19.2.5_react@19.2.5`), so this is per-package: a shared
    // parent directory does not exist and assuming one loses react-dom.
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
    resolveAliases.react = reactDir;
    resolveAliases['react-dom'] = reactDomDir;
    resolveAliases['react-dom/client'] = path.join(reactDomDir, 'client');
    resolveAliases['react-dom/server'] = path.join(reactDomDir, 'server');
    resolveAliases['react/jsx-runtime'] = path.join(reactDir, 'jsx-runtime');
    resolveAliases['react/jsx-dev-runtime'] = path.join(reactDir, 'jsx-dev-runtime');
    const schedulerDir = onePhysicalCopy('scheduler');
    resolveAliases.scheduler = schedulerDir;
    process.env.MPO_VITEST_REACT = reactDir;
    process.env.MPO_VITEST_REACT_DOM = reactDomDir;
    process.env.MPO_VITEST_SCHEDULER = schedulerDir;
    pinNodeReactRequire(reactDir, reactDomDir, schedulerDir);
  }

  const testConfig: Record<string, unknown> = {
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
        ...(coverage?.exclude || []),
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
          /@tamagui\//,
          'tamagui',
          /@tanstack\//,
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
        ...(externalDeps.length > 0
          ? { external: [pinReactRequireSetup, ...externalDeps] }
          : { external: [pinReactRequireSetup] }),
        interopDefault: true,
      },
    },
  };
  if (include) {
    testConfig.include = include;
  }
  if (exclude) {
    testConfig.exclude = exclude;
  }
  if (passWithNoTests) {
    testConfig.passWithNoTests = true;
  }

  return {
    plugins,
    test: testConfig,
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
      // MPO_VITEST_* paths on that stub so pinReactRequire.cjs still sees
      // them if Vite ever transforms the setup file.
      process: JSON.stringify({
        env: {
          NODE_ENV: 'test',
          NODE_DEBUG: false,
          ...(dedupeReact
            ? {
                MPO_VITEST_REACT: process.env.MPO_VITEST_REACT,
                MPO_VITEST_REACT_DOM: process.env.MPO_VITEST_REACT_DOM,
                MPO_VITEST_SCHEDULER: process.env.MPO_VITEST_SCHEDULER,
              }
            : {}),
        },
        platform: process.platform,
        version: process.version,
        type: 'renderer',
      }),
      'Buffer.isBuffer': "((obj) => obj?.constructor?.name === 'Buffer')",
    },
  } as UserConfig;
}
