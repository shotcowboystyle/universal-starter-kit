// Vite config factories for the web-extension target of a One platform app.
//
// The target lives INSIDE the product app (apps/<name>/webext/) — the same
// pattern as the GNOME target's vite.config.gnome*.ts — and produces a
// loadable MV3 extension staging dir:
//
//   <stagingDir>/manifest.json
//   <stagingDir>/dist/views/<view>/index.html   (popup/options/sidepanel/…)
//   <stagingDir>/dist/background/index.mjs      (service worker / bg script)
//   <stagingDir>/dist/contentScripts/index.global.js
//   <stagingDir>/dist/contentScripts/webext.css (web-accessible resource)
//
// Three vite builds cover the three JS worlds (DOM views, worker, injected
// content script); `runWebextPrepare` writes the manifest and the dev-mode
// HMR scaffolding. Hard-won workarounds (workspace source aliases, the
// one-server-only browser stub, expo type-declaration stubs) come from
// @repo/utils/dev so every product app shares one copy.

import fs from 'node:fs';
import { builtinModules, createRequire } from 'node:module';
import path from 'node:path';

import {
  lookupTamaguiModules,
  oneServerOnlyBrowserStub,
  stubExpoTypeDeclarations,
  workspaceSourceAliases,
  lookupProjectRoot,
} from '@repo/utils/dev';
import babel from '@rolldown/plugin-babel';
import type { Alias, Plugin, UserConfig } from 'vite';

const PLUGIN_NAME = '@repo/vite-plugin-webext';

const logger = console;

export interface WebextPackageInfo {
  name: string;
  displayName?: string;
  version: string;
  description?: string;
}

export interface WebextTargetOptions {
  /** Absolute path of the webext target source dir (contains views/,
   *  background/, content_scripts/). */
  targetDir: string;
  /** Absolute path of the loadable-extension staging dir (manifest.json +
   *  dist/). Keep it under the app's dist/ so tree-clean stays green. */
  stagingDir: string;
  /** Absolute path to the Tamagui config compiled into the views. */
  tamaguiConfig: string;
  /** Package identity for defines and bundle names. */
  packageInfo: WebextPackageInfo;
  /** Workspace root (defaults to the git toplevel). */
  workspaceRoot?: string;
  /** Views dev-server port. */
  port?: number;
  /** Development mode (watch + HMR scaffolding). Defaults to
   *  NODE_ENV !== "production". */
  isDev?: boolean;
  /** Extra defines merged over the factory defaults. */
  define?: Record<string, unknown>;
  /** Extra resolve aliases appended after the factory's. */
  aliases?: Alias[];
}

const WEBEXT_EXTENSIONS = [
  '.webext.ts',
  '.webext.tsx',
  '.webext.js',
  '.webext.jsx',
  '.web.ts',
  '.web.tsx',
  '.web.js',
  '.web.jsx',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
];

const OPTIMIZE_INCLUDE = [
  'react',
  'react-dom',
  'webextension-polyfill',
  '@tamagui/core',
  '@tamagui/web',
  'tamagui',
  'react-native-web',
  '@repo/ui',
];

/** shiki's chunk graph (wasm/TLA) can't fold into the single-file iife a
 *  content script requires. Stub it with an empty module —
 *  @repo/ui' highlightCode() catches the missing
 *  codeToTokens and falls back to plain text. */
export function shikiStubPlugin(): Plugin {
  const VIRTUAL_ID = '\0webext-shiki-stub';
  return {
    name: 'webext-shiki-stub',
    enforce: 'pre',
    resolveId(id: string) {
      if (/^shiki(\/.*)?$/.test(id)) {
        return VIRTUAL_ID;
      }
    },
    load(id: string) {
      if (id === VIRTUAL_ID) {
        return 'export {}';
      }
    },
  };
}

function barePackageName(specifier: string): string | undefined {
  if (!specifier || /^[./#\\]/.test(specifier)) {
    return;
  }
  if (/^(node|data|file|https?):/.test(specifier)) {
    return;
  }
  const packageName = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0];
  if (builtinModules.includes(packageName)) {
    return;
  }
  return packageName;
}

/** Node ESM bare-import resolution walks parent node_modules dirs and — unlike
 *  CJS — ignores NODE_PATH. Presence of the package dir is what we probe. */
function packageVisibleFromDir(packageName: string, fromDir: string): boolean {
  let dir = fromDir;
  while (true) {
    if (fs.existsSync(path.join(dir, 'node_modules', packageName, 'package.json'))) {
      return true;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return false;
    }
    dir = parent;
  }
}

/**
 * The Tamagui static extractor bundles the app's tamagui config to
 * `<cwd>/.tamagui/tamagui.config.{cjs,mjs}` and then loads it (ESM `import()`
 * for .mjs, `require()` for .cjs), leaving its externals (`@tamagui/web`,
 * `@tamagui/core`, react…) as live imports resolved FROM that artifact. When
 * one of them cannot be resolved there (pnpm's default isolated layout
 * without a direct `@tamagui/web` dependency), the extractor logs "Error
 * bundling tamagui config: Cannot find package …", swallows the error, and
 * the build exits 0 with a silently de-optimized runtime-styled bundle.
 * Production builds must fail instead: after the build, replay the artifact's
 * imports with the loader semantics the extractor would use — CJS resolution
 * for .cjs (honors NODE_PATH, which pnpm bin shims set), an ESM-style
 * node_modules walk for .mjs (ESM ignores NODE_PATH — exactly the divergence
 * that breaks the .mjs artifact under pnpm) — and name the missing package.
 * A missing artifact (bundling died before writing it) is equally fatal.
 */
function tamaguiConfigBundleGuard(isDev: boolean): Plugin {
  return {
    name: 'webext-tamagui-config-guard',
    closeBundle() {
      if (isDev) {
        return;
      }
      const dotDir = path.join(process.cwd(), '.tamagui');
      const artifacts = ['tamagui.config.cjs', 'tamagui.config.mjs']
        .map((name) => path.join(dotDir, name))
        .filter((file) => fs.existsSync(file));
      if (artifacts.length === 0) {
        // No .tamagui dir at all means the extractor never ran for this
        // build (nothing to verify) — an existing dir without the config
        // artifact means bundling died before writing it.
        if (!fs.existsSync(dotDir)) {
          return;
        }
        throw new Error(
          `[${PLUGIN_NAME}] the Tamagui static extractor did not produce its bundled config ` +
            `(expected ${path.join(dotDir, 'tamagui.config.{cjs,mjs}')}). The build would ` +
            'silently fall back to a de-optimized runtime-styled bundle. Re-run with ' +
            'DEBUG=tamagui to see the underlying bundling error.',
        );
      }
      const artifact = artifacts.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
      const source = fs.readFileSync(artifact, 'utf-8');
      const requireFromArtifact = createRequire(artifact);
      const importRe = /(?:require\s*\(\s*|import\s*\(\s*|from\s*|import\s*)["']([^"'\n]+)["']/g;
      const missing = new Set<string>();
      for (const match of source.matchAll(importRe)) {
        const packageName = barePackageName(match[1]);
        if (!packageName) {
          continue;
        }
        if (artifact.endsWith('.cjs')) {
          try {
            requireFromArtifact.resolve(packageName);
          } catch {
            missing.add(packageName);
          }
        } else if (!packageVisibleFromDir(packageName, dotDir)) {
          missing.add(packageName);
        }
      }
      if (missing.size > 0) {
        const names = [...missing].map((name) => `"${name}"`).join(', ');
        throw new Error(
          `[${PLUGIN_NAME}] Tamagui config bundling failed: ${names} cannot be resolved ` +
            `from ${artifact}. The Tamagui static extractor swallows this ("Error bundling ` +
            'tamagui config") and ships a de-optimized runtime-styled build. Fix: add ' +
            `${names} to your app's dependencies — under pnpm's default isolated ` +
            'node_modules, transitive packages are not resolvable from the app.',
        );
      }
    },
  };
}

function resolveDefaults(options: WebextTargetOptions) {
  const workspaceRootInferred = options.workspaceRoot == null;
  const workspaceRoot = options.workspaceRoot ?? lookupProjectRoot();
  const isDev = options.isDev ?? process.env.NODE_ENV !== 'production';
  const port = options.port ?? (Number(process.env.PORT) || 3303);
  return { workspaceRoot, workspaceRootInferred, isDev, port };
}

/** Peers stay lazy so requiring them is deferred to the factory that needs
 *  them — but a missing peer must name itself, not crash the config file. */
async function importPeer<T>(load: () => Promise<T>, specifier: string): Promise<T> {
  try {
    return await load();
  } catch (error) {
    throw new Error(
      `[${PLUGIN_NAME}] could not import its peer dependency "${specifier}" — install it ` +
        `next to ${PLUGIN_NAME} (it is a required peer): ${error instanceof Error ? error.message : error}`,
      { cause: error },
    );
  }
}

function baseDefine(options: WebextTargetOptions, isDev: boolean): Record<string, unknown> {
  return {
    __DEV__: isDev,
    __NAME__: JSON.stringify(options.packageInfo.name),
    'process.env.NODE_ENV': JSON.stringify(isDev ? 'development' : 'production'),
    global: 'globalThis',
    ...options.define,
  };
}

const loggedNoPublicRoots = new Set<string>();

function baseResolve(options: WebextTargetOptions, workspaceRoot: string, workspaceRootInferred: boolean) {
  const sourceAliases = workspaceSourceAliases(workspaceRoot);
  // Out-of-repo consumers have no public/ checkout, so the in-repo source
  // aliasing silently no-ops — say so once, to make the divergence visible.
  if (workspaceRootInferred && Object.keys(sourceAliases).length === 0 && !loggedNoPublicRoots.has(workspaceRoot)) {
    loggedNoPublicRoots.add(workspaceRoot);
    logger.info(
      `[${PLUGIN_NAME}] no public/ under ${workspaceRoot} — resolving @repo/* from node_modules`,
    );
  }
  return {
    alias: [
      ...Object.entries(sourceAliases).map(([find, replacement]) => ({
        find,
        replacement,
      })),
      { find: 'react-native', replacement: 'react-native-web' },
      { find: '@', replacement: options.targetDir },
      ...(options.aliases ?? []),
    ],
    extensions: WEBEXT_EXTENSIONS,
    mainFields: ['browser', 'module', 'main'],
  } satisfies UserConfig['resolve'];
}

function baseOptimizeDeps(): UserConfig['optimizeDeps'] {
  return {
    include: OPTIMIZE_INCLUDE,
    esbuildOptions: {
      resolveExtensions: WEBEXT_EXTENSIONS,
      mainFields: ['module', 'main'],
    },
  };
}

/** Discover view names — every directory under <targetDir>/views with an
 *  index.html becomes an extension page (popup, options, sidepanel, …). */
export function listWebextViews(targetDir: string): string[] {
  const viewsDir = path.join(targetDir, 'views');
  if (!fs.existsSync(viewsDir)) {
    return [];
  }
  return fs
    .readdirSync(viewsDir)
    .filter((file) => fs.statSync(path.join(viewsDir, file)).isDirectory())
    .filter((view) => fs.existsSync(path.join(viewsDir, view, 'index.html')));
}

/** The extension pages build (popup/options/sidepanel/devtools…). */
export async function createWebextViewsConfig(options: WebextTargetOptions): Promise<UserConfig> {
  const { workspaceRoot, workspaceRootInferred, isDev, port } = resolveDefaults(options);
  // Both vite-integration peers load lazily at factory-call time so a consumer
  // following the peer contract sees a named error, not a module-scope crash.
  const { default: react, reactCompilerPreset } = await importPeer(
    async () => await import('@vitejs/plugin-react'),
    '@vitejs/plugin-react',
  );
  const { tamaguiPlugin } = await importPeer(async () => await import('@tamagui/vite-plugin'), '@tamagui/vite-plugin');
  const views = listWebextViews(options.targetDir);
  return {
    root: options.targetDir,
    base: isDev ? `http://localhost:${port}/` : '/dist/',
    plugins: [
      stubExpoTypeDeclarations(),
      oneServerOnlyBrowserStub(workspaceRoot),
      react({ jsxRuntime: 'automatic' }),
      // Same React Compiler pass the One app runs (react 19 built-in
      // runtime) — extension views get the memoization for free.
      babel({ presets: [reactCompilerPreset()] }),
      tamaguiPlugin({
        components: lookupTamaguiModules([options.targetDir]),
        config: options.tamaguiConfig,
        outputCSS: path.join(options.targetDir, 'tamagui.css'),
      }) as Plugin,
      tamaguiConfigBundleGuard(isDev),
    ],
    define: baseDefine(options, isDev),
    optimizeDeps: baseOptimizeDeps(),
    esbuild: {
      jsx: 'automatic',
      target: 'esnext',
    },
    resolve: baseResolve(options, workspaceRoot, workspaceRootInferred),
    server: {
      port,
      hmr: {
        host: 'localhost',
        protocol: 'ws',
        clientPort: port,
      },
      origin: `http://localhost:${port}`,
      cors: true,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
    },
    build: {
      watch: isDev ? {} : undefined,
      outDir: path.join(options.stagingDir, 'dist'),
      emptyOutDir: false,
      sourcemap: isDev ? 'inline' : false,
      terserOptions: {
        mangle: false,
      },
      rollupOptions: {
        input: Object.fromEntries(
          views.map((view) => [view, path.join(options.targetDir, 'views', view, 'index.html')]),
        ),
      },
    },
  };
}

/** The background service-worker (chromium) / background-script (firefox)
 *  build — a single-file iife, no DOM. */
export function createWebextBackgroundConfig(options: WebextTargetOptions): UserConfig {
  const { workspaceRoot, workspaceRootInferred, isDev } = resolveDefaults(options);
  return {
    root: options.targetDir,
    plugins: [oneServerOnlyBrowserStub(workspaceRoot)],
    define: baseDefine(options, isDev),
    optimizeDeps: baseOptimizeDeps(),
    esbuild: {
      jsx: 'automatic',
      target: 'esnext',
    },
    resolve: baseResolve(options, workspaceRoot, workspaceRootInferred),
    build: {
      watch: isDev ? {} : undefined,
      outDir: path.join(options.stagingDir, 'dist/background'),
      cssCodeSplit: false,
      emptyOutDir: false,
      sourcemap: isDev ? 'inline' : false,
      lib: {
        entry: path.join(options.targetDir, 'background/main.ts'),
        name: options.packageInfo.name,
        formats: ['iife'],
      },
      rollupOptions: {
        output: {
          entryFileNames: 'index.mjs',
          extend: true,
        },
      },
    },
  };
}

/** The content-script build — a single-file iife injected into pages, with
 *  Tamagui CSS extracted separately (webext.css web-accessible resource). */
export async function createWebextContentConfig(options: WebextTargetOptions): Promise<UserConfig> {
  const { workspaceRoot, workspaceRootInferred, isDev } = resolveDefaults(options);
  const { default: react, reactCompilerPreset } = await importPeer(
    async () => await import('@vitejs/plugin-react'),
    '@vitejs/plugin-react',
  );
  const { tamaguiPlugin } = await importPeer(async () => await import('@tamagui/vite-plugin'), '@tamagui/vite-plugin');
  return {
    root: options.targetDir,
    plugins: [
      stubExpoTypeDeclarations(),
      oneServerOnlyBrowserStub(workspaceRoot),
      shikiStubPlugin(),
      // The react plugin transforms JSX (the esbuild jsx setting below
      // stays for non-plugin paths); the babel pass adds the compiler.
      react({ jsxRuntime: 'automatic' }),
      babel({ presets: [reactCompilerPreset()] }),
      tamaguiPlugin({
        components: lookupTamaguiModules([options.targetDir]),
        config: options.tamaguiConfig,
        outputCSS: path.join(options.targetDir, 'tamagui.content.css'),
      }) as Plugin,
      tamaguiConfigBundleGuard(isDev),
    ],
    define: {
      ...baseDefine(options, isDev),
      process: {
        env: {
          NODE_ENV: JSON.stringify(isDev ? 'development' : 'production'),
        },
      },
    },
    optimizeDeps: baseOptimizeDeps(),
    esbuild: {
      jsx: 'automatic',
      target: 'esnext',
    },
    resolve: baseResolve(options, workspaceRoot, workspaceRootInferred),
    build: {
      watch: isDev ? {} : undefined,
      outDir: path.join(options.stagingDir, 'dist/contentScripts'),
      cssCodeSplit: false,
      emptyOutDir: false,
      sourcemap: isDev ? 'inline' : false,
      lib: {
        entry: path.join(options.targetDir, 'content_scripts/index.tsx'),
        name: options.packageInfo.name,
        formats: ['iife'],
        // Without this, Vite names the extracted stylesheet after the nearest
        // package.json — so the file tracked whichever app hosts the target
        // (`one.css` since webext folded into apps/one) while the manifest
        // declares a stable target-owned name.
        cssFileName: 'webext',
      },
      rollupOptions: {
        output: {
          entryFileNames: 'index.global.js',
          extend: true,
        },
      },
    },
  };
}

// ── prepare pipeline (manifest + dev HMR scaffolding) ─────────────

export interface WebextPrepareOptions {
  targetDir: string;
  stagingDir: string;
  /** Produces the manifest object (app-owned — permissions, views, icons).
   *  Typed `object` so interface-typed manifests (webextension-polyfill's
   *  WebExtensionManifest has no index signature) assign cleanly. */
  getManifest: () => Promise<object> | object;
  /** Static files (icons, …) copied verbatim into the staging root.
   *  Defaults to `<targetDir>/static` when it exists. */
  staticDir?: string;
  isDev?: boolean;
  port?: number;
  /** Watch manifest/html sources and rewrite on change (dev loop). */
  watch?: boolean;
}

/** Copy static extension files (icons, …) into the staging root — the
 *  staging dir is build output (gitignored), so committed assets live in
 *  the target source tree instead. */
export async function copyWebextStatic(options: WebextPrepareOptions): Promise<void> {
  const staticDir = options.staticDir ?? path.join(options.targetDir, 'static');
  if (!fs.existsSync(staticDir)) {
    return;
  }
  await fs.promises.mkdir(options.stagingDir, { recursive: true });
  await fs.promises.cp(staticDir, options.stagingDir, { recursive: true });
}

export async function writeWebextManifest(options: WebextPrepareOptions): Promise<void> {
  const manifestPath = path.join(options.stagingDir, 'manifest.json');
  await fs.promises.mkdir(path.dirname(manifestPath), { recursive: true });
  await fs.promises.writeFile(manifestPath, JSON.stringify(await options.getManifest(), null, 2), 'utf-8');
}

/** Dev mode: emit view HTML that loads main.tsx from the vite dev server
 *  (extension pages can't be served BY vite — the html on disk must point
 *  at it) plus the react-refresh preamble shim. */
export async function stubWebextIndexHtml(options: WebextPrepareOptions): Promise<void> {
  const port = options.port ?? 3303;
  for (const view of listWebextViews(options.targetDir)) {
    let data = await fs.promises.readFile(path.join(options.targetDir, 'views', view, 'index.html'), 'utf-8');
    data = data.replace(
      '</head>',
      `  <script type="module" src="http://localhost:${port}/@vite/client"></script>
  <script type="module" src="/dist/refresh.js"></script>
</head>`,
    );
    data = data
      .replace(
        '<script type="module" src="./main.tsx"></script>',
        `<script type="module" src="http://localhost:${port}/views/${view}/main.tsx"></script>`,
      )
      .replace('<div id="app"></div>', '<div id="app">vite server did not start</div>');
    const outPath = path.join(options.stagingDir, 'dist/views', view, 'index.html');
    await fs.promises.mkdir(path.dirname(outPath), { recursive: true });
    await fs.promises.writeFile(outPath, data, 'utf-8');
  }
}

export async function writeWebextRefreshScript(options: WebextPrepareOptions): Promise<void> {
  const port = options.port ?? 3303;
  const refreshPath = path.join(options.stagingDir, 'dist/refresh.js');
  await fs.promises.mkdir(path.dirname(refreshPath), { recursive: true });
  await fs.promises.writeFile(
    refreshPath,
    `window.__vite_plugin_react_preamble_installed__ = true;
window.$RefreshReg$ = () => {};
window.$RefreshSig$ = () => (type) => type;
window.addEventListener('load', () => {
  import("http://localhost:${port}/@react-refresh")
    .then((RefreshRuntime) => {
      if (RefreshRuntime && typeof RefreshRuntime.injectIntoGlobalHook === 'function') {
        RefreshRuntime.injectIntoGlobalHook(window);
      }
    })
    .catch(console.error);
});
`,
    'utf-8',
  );
}

/** One-shot (prod) or watching (dev) prepare: manifest + static assets +
 *  dev scaffolding. */
export async function runWebextPrepare(options: WebextPrepareOptions): Promise<void> {
  const isDev = options.isDev ?? process.env.NODE_ENV !== 'production';
  if (!isDev) {
    await copyWebextStatic(options);
    await writeWebextManifest(options);
    return;
  }
  await copyWebextStatic(options);
  await stubWebextIndexHtml(options);
  await writeWebextRefreshScript(options);
  await writeWebextManifest(options);
  if (options.watch) {
    const { watch } = await import('chokidar');
    watch(path.join(options.targetDir, '**/*.html')).on(
      'change',
      async () => await stubWebextIndexHtml(options).catch(console.error),
    );
    watch(path.join(options.targetDir, 'manifest.ts')).on(
      'change',
      async () => await writeWebextManifest(options).catch(console.error),
    );
  }
}
