import fs from 'node:fs';
import path from 'node:path';

import { lookupTamaguiModules } from '@repo/utils/dev';
import { tamaguiPlugin } from '@tamagui/vite-plugin';
import dotenv from 'dotenv';
import type { Plugin, UserConfig } from 'vite';
import createExternal from 'vite-plugin-external';
import i18nextLoader from 'vite-plugin-i18next-loader';

import { phosphorTokenColorPlugin } from './phosphorTokenColor.ts';
import { bakePublicConfig, mergePublicConfigKeys, publicConfigPlugin, readPublicConfigKeys } from './publicConfig.ts';
import { withSingletonDepAliases } from './singletonDepAliases.ts';
import { ensureTamaguiWorkspacePaths } from './tamaguiWorkspacePaths.ts';
import { discoverPublicPackageRoots } from './workspacePublicPackages.ts';

export interface CreateViteConfigOptions {
  /**
   * Absolute path to the project root (directory containing .env files).
   * Defaults to looking up the git root.
   */
  projectRoot?: string;

  /**
   * Public config keys to expose via VITE_MP_CONFIG, declared inline.
   */
  publicConfigKeys?: string[];

  /**
   * Absolute path of the config.json whose `public` array names the keys to
   * expose via VITE_MP_CONFIG. Use this rather than importing the file into
   * the vite config: an import makes it a config dependency, so adding a key
   * restarts the dev server and re-optimizes deps, which 504s every open tab.
   * Read instead, the file is watched in dev: a change rebakes the
   * keys and reloads open clients, and the server never restarts.
   */
  publicConfigFile?: string;

  /**
   * Enable Tamagui plugin. Defaults to true.
   */
  tamagui?:
    | boolean
    | {
        /**
         * Tamagui components to include.
         * Defaults to looking up tamaguiModules from package.json files.
         */
        components?: string[];

        /**
         * Path to the Tamagui config file.
         * Defaults to "./config/tamagui.config.ts".
         */
        config?: string;

        /**
         * Path to output CSS. Defaults to "./tamagui.css".
         */
        outputCSS?: string;
      };

  /**
   * Enable i18next loader plugin. Defaults to false.
   */
  i18n?:
    | boolean
    | {
        /**
         * Paths to scan for translation files.
         * Defaults to ["../../features/i18n"].
         */
        paths?: string[];

        /**
         * How to resolve namespaces. Defaults to "basename".
         */
        namespaceResolution?: string;
      };

  /**
   * Enable One framework plugin. Defaults to false.
   * When true, uses sensible defaults for router, web, react, and native.
   */
  one?:
    | boolean
    | {
        router?: { root?: string };
        web?: { deploy?: string; defaultRenderMode?: string };
        react?: { compiler?: boolean };
        native?: { key?: string };
        deps?: Record<string, boolean>;
      };

  /**
   * SSR configuration. Defaults to reasonable values when One is enabled.
   */
  ssr?: UserConfig['ssr'];

  /**
   * Server configuration. Merged with defaults.
   */
  server?: UserConfig['server'];

  /**
   * Additional Vite plugins to include.
   */
  plugins?: UserConfig['plugins'];

  /**
   * Externalize react-router-dom. Defaults to true when One is enabled.
   */
  externalReactRouter?: boolean;

  /**
   * Additional dependency optimizations for SSR.
   */
  ssrDeps?: {
    include?: string[];
    exclude?: string[];
    external?: string[];
  };

  /**
   * Entry files for Vite's native SSR dep scanner.
   * Vite follows actual import statements from these files to determine what
   * needs pre-bundling — much more accurate than walking package.json dep trees.
   * Defaults to ["routes/**\/*.{ts,tsx}"] for One framework apps.
   * Only used when `one` is enabled.
   */
  ssrEntries?: string[];

  /**
   * CJS-only package ids force-appended to `ssr.external` AFTER the one()
   * plugin replaces the list (via configResolved), so Node's native CJS
   * loader handles them instead of Vite's ESM evaluator (which chokes on
   * `module.exports` with "module is not defined"). Only used when `one` is
   * enabled. Defaults to a list covering use-sync-external-store,
   * highlight.js, turndown, and friends; pass an array to EXTEND the default
   * list or `false` to disable entirely.
   */
  ssrCjsExternal?: string[] | false;

  /**
   * Native (vxrn rolldown / Hermes) workaround toggles. Only used when `one`
   * is enabled; all default to true.
   */
  nativeFixes?: {
    /**
     * Prepend a snippet to the classic-script native bundle that restores
     * Object.prototype methods shadowed by hoisted top-level vars (Hermes V1
     * spec-compliant var hoisting turns a flattened module's
     * `var hasOwnProperty` into `globalThis.hasOwnProperty = undefined` at
     * parse time, and React Native core dies at boot calling it).
     */
    protoShadow?: boolean;
    /**
     * When `@multiplatform.one/web3` is NOT installed, redirect the OPTIONAL
     * `@multiplatform.one/web3/native` import (from core's
     * loadWalletProvider.native.ts) to a no-op shim — rolldown otherwise
     * leaves the unresolvable specifier as a bare dynamic `import()` in the
     * classic-script bundle, which Hermes rejects at lazy-compile time.
     * Auto-skipped when web3 is installed.
     */
    web3Stub?: boolean;
  };
}

/**
 * Creates a shared Vite configuration for workspace apps.
 *
 * This abstracts away the boilerplate that's typically duplicated across
 * app vite.config.ts files, including Tamagui plugin setup, i18n,
 * env variable loading, SSR configuration, and One framework integration.
 *
 * @example
 * ```ts
 * // apps/<app>/vite.config.ts
 * import path from "node:path";
 * import { createViteConfig } from "@repo/config/vite";
 *
 * export default createViteConfig({
 *   publicConfigFile: path.resolve(__dirname, "../../packages/config/config.json"),
 *   one: { web: { deploy: "node", defaultRenderMode: "ssr" } },
 *   tamagui: { config: "./config/tamagui.config.ts" },
 *   i18n: { paths: ["../../features/i18n"] },
 * });
 * ```
 */
export function createViteConfig(options: CreateViteConfigOptions = {}): UserConfig {
  // See tamaguiWorkspacePaths.ts; the tsconfig chain must resolve
  // before vite (and tamagui's esbuild) read compilerOptions.paths.
  ensureTamaguiWorkspacePaths();
  const {
    projectRoot: _projectRoot,
    publicConfigKeys: inlinePublicConfigKeys = [],
    publicConfigFile,
    tamagui = true,
    i18n = false,
    one = false,
    ssr,
    server,
    plugins: extraPlugins = [],
    externalReactRouter,
    ssrDeps,
    ssrEntries,
    ssrCjsExternal,
    nativeFixes,
  } = options;

  const projectRoot = _projectRoot || findProjectRoot();
  const publicConfigKeys = publicConfigFile
    ? mergePublicConfigKeys(inlinePublicConfigKeys, readPublicConfigKeys(publicConfigFile))
    : inlinePublicConfigKeys;

  // Load env from project root
  dotenv.config({ path: path.resolve(projectRoot, '.env') });
  if (publicConfigKeys.length > 0) {
    // Bake only the NAMES of the public keys, never a value: this is what lets
    // the SSR node process resolve their values from ITS OWN process.env at
    // request time and publish them into the served document
    // (@repo/platform runtimeConfig.ts). Values stay out of the
    // image, so one build is deployable to every environment; the names are
    // also the allowlist that keeps a private key from ever being serialized.
    bakePublicConfig(publicConfigKeys);
  }

  const vitePlugins: UserConfig['plugins'] = [];
  vitePlugins.push(preferBuiltWorkspaceEntryPlugin());
  vitePlugins.push(phosphorTokenColorPlugin());
  if (publicConfigFile) {
    vitePlugins.push(publicConfigPlugin({ file: publicConfigFile, projectRoot, keys: inlinePublicConfigKeys }));
  }

  if (one) {
    // One plugin must be added by the consumer in their extraPlugins.
    // Alias react-native to react-native-web in SSR so Rolldown never parses
    // react-native/index.js (which contains Flow-only syntax).
    vitePlugins.push(ssrReactNativeAliasPlugin());
    vitePlugins.push(clientBrokenEsmPlugin());
    // Register a native-only resolveId plugin through vxrn's __vxrnAddNativePlugins
    // hook (consumed in vxrn's getNativePlugins). vxrn's native rolldown resolver
    // does NOT honor engine.io-client's `browser` field, so its Node `.node`
    // transports (ws + xmlhttprequest-ssl) leak into Hermes and won't even compile.
    // This re-asserts the package's own browser redirect (-> browser transports that
    // use RN's global WebSocket/XMLHttpRequest) with NO node_modules patch.
    registerNativeEngineIoBrowserTransports();
    // A mixed pnpm install (hoisted root dirs + a leftover .pnpm store) puts
    // two byte-identical copies of react, react-native and 62 other packages
    // on disk, and which one an importer reaches depends only on where that
    // importer sits. Two Reacts in one Hermes bundle means the renderer arms
    // the dispatcher on one copy while components read it as null from the
    // other — "Cannot read property 'useContext' of null" on first render.
    // It delegates through `this.resolve`, so it canonicalizes whatever the
    // rest of the chain produces, wherever it sits in the plugin order.
    registerNativeSinglePackageInstances();
    // preferBuiltWorkspaceEntryPlugin (web-only) hard-resolves every workspace
    // package to its `dist/esm/index.mjs` (WEB build), and that resolution reaches
    // the native graph too — pinning the whole @repo/* chain to web
    // (dragging @tiptap/prosemirror/html5-qrcode/etc into Hermes). This native-only
    // resolveId redirects each workspace web entry to its `dist/esm/index.native.js`
    // sibling so native gets the react-native build (the wrappers' native variants).
    registerNativeWorkspaceEntries();
    // @phosphor-icons/react renders DOM <svg>/<path>, which redboxes Hermes
    // ("View config getter callback for component `path` must be a function").
    // phosphor-react-native@3 ships the SAME *Icon-suffixed export names on
    // react-native-svg, so source keeps importing @phosphor-icons/react and
    // native transparently gets the RN implementation.
    registerNativePhosphorIcons();
    // Hermes V1 hoisted-var Object.prototype shadow fix (see the nativeFixes
    // option docs). Every rolldown classic-script native bundle is exposed.
    if (nativeFixes?.protoShadow !== false) {
      registerNativeProtoShadowFix();
    }
    // Optional-web3 stub for apps that don't install @multiplatform.one/web3
    // (auto-skipped when the package resolves).
    if (nativeFixes?.web3Stub !== false) {
      registerNativeWeb3Stub();
    }
    // CJS-only ids must land on ssr.external AFTER the one() plugin replaces
    // the list during config — configResolved runs last, so the appends stick.
    if (ssrCjsExternal !== false) {
      vitePlugins.push(ssrCjsExternalFixPlugin([...DEFAULT_SSR_CJS_EXTERNAL, ...(ssrCjsExternal ?? [])]));
    }
  }

  // Tamagui plugin
  if (tamagui) {
    const tamaguiOpts = typeof tamagui === 'object' ? tamagui : {};
    vitePlugins.push(
      tamaguiPlugin({
        components: tamaguiOpts.components || lookupTamaguiModules([process.cwd()]),
        config: tamaguiOpts.config || './config/tamagui.config.ts',
        outputCSS: tamaguiOpts.outputCSS || './public/tamagui.css',
        // Prevents the config file watcher from re-evaluating the Tamagui
        // config in the main process when the Piscina worker writes changes
        // to .tamagui/. Without this, the watcher triggers bundleConfig →
        // import() → createTamagui() on a raw @tamagui/web instance that
        // conflicts with the SSR module runner's pre-bundled instance.
        // See also: patches/@tamagui__static (forces CJS config bundles in
        // the worker to avoid ESM/CJS dual-instance globalThis conflicts).
        disableWatchTamaguiConfig: true,
      }),
    );
  }

  // i18n plugin
  if (i18n) {
    const i18nOpts = typeof i18n === 'object' ? i18n : {};
    vitePlugins.push(
      i18nextLoader({
        paths: i18nOpts.paths || ['../../features/i18n'],
        namespaceResolution: (i18nOpts.namespaceResolution as any) || 'basename',
      }),
    );
  }

  // Externalize react-router-dom (needed for One framework)
  if (externalReactRouter !== false && one) {
    vitePlugins.push(
      createExternal({
        externals: {
          'react-router-dom': {} as any,
        },
      }),
    );
  }

  // Merge extra plugins
  vitePlugins.push(...(extraPlugins as any[]));

  // SSR defaults for One framework
  const defaultSsr: UserConfig['ssr'] = one
    ? ({
        noExternal: true,
        optimizeDeps: {
          entries: ssrEntries ?? ['routes/**/*.{ts,tsx}'],
          include: [
            // @tamagui/core holds a global config singleton. It must be
            // pre-bundled as a single chunk so all SSR code shares one instance.
            // If loaded via two different paths (optimizer + module runner),
            // TamaguiProvider sets config on one instance but components read
            // from the other, triggering the "global config fallback" warning.
            '@tamagui/core',
            '@tamagui/web',
            'tamagui',
            '@tamagui/toast',
            '@tamagui/linear-gradient',
            // react-i18next and i18next must be pre-bundled for SSR so they
            // share the same React instance as react-dom/server. Without
            // explicit include, the SSR module runner loads react-i18next
            // directly from node_modules, which imports a raw
            // node_modules/react/cjs/react.development.js. That raw React
            // has its dispatcher unset (null), causing "Cannot read properties
            // of null (reading 'useSyncExternalStore')" during useTranslation.
            'react-i18next',
            'i18next',
            // @tanstack/react-store must be pre-bundled for SSR so it uses the
            // shared React chunk (react-D-en6o7j.js) instead of loading
            // use-sync-external-store/shim/with-selector as a CJS external which
            // internally does require('react') → raw node_modules React →
            // different instance from react-dom/server → dispatcher null.
            '@tanstack/react-store',
            '@tanstack/store',
            // CJS-only transitive dep of react-i18next (via html-parse-stringify).
            // Rolldown doesn't pull it into the react-i18next pre-bundle chunk, so
            // the SSR module runner gets the raw file and fails with
            // "module is not defined".
            'void-elements',
            // use-sync-external-store must share the same React instance as the
            // SSR renderer. Without bundling it in, the CJS shim does
            // require('react') at runtime → different node_modules React →
            // dispatcher null → "Cannot read properties of null (reading
            // 'useSyncExternalStore')" crash during useTranslation in SSR.
            'use-sync-external-store',
            'use-sync-external-store/shim',
            ...(ssrDeps?.include || []),
          ],
          exclude: [
            '@react-native/assets-registry',
            '@react-native-community/datetimepicker',
            'socket.io-client',
            'engine.io-client',
            'xmlhttprequest-ssl',
            // Devtools — never needed in SSR, and their nested deps have
            // version mismatches (form-core@1.27.7 needs Derived from store).
            '@tanstack/form-devtools',
            '@tanstack/react-form-devtools',
            ...(ssrDeps?.exclude || []),
          ],
          rolldownOptions: {
            // Belt-and-suspenders: force Rolldown to treat these packages as
            // external at the bundler level, not just via the exclude plugin.
            // Without this, Rolldown can still inline them as transitive deps
            // of other pre-bundled packages, causing MISSING_EXPORT errors.
            external: ['@tanstack/form-devtools', '@tanstack/react-form-devtools', ...(ssrDeps?.external || [])],
            // Shim any remaining missing exports instead of hard-failing.
            shimMissingExports: true,
          },
        },
        external: [
          'loglevel',
          '@react-native/assets-registry',
          '@react-native-community/datetimepicker',
          'socket.io-client',
          'engine.io-client',
          'xmlhttprequest-ssl',
          '@tanstack/form-devtools',
          '@tanstack/react-form-devtools',
          ...(ssrDeps?.external || []),
          // better-auth pulls @opentelemetry/* (CJS) which fails in the ESM
          // SSR module runner with "exports is not defined". Externalize so
          // Node's native CJS loader handles them.
          '@opentelemetry/semantic-conventions',
          '@opentelemetry/api',
          '@opentelemetry/sdk-trace-base',
          '@opentelemetry/sdk-trace-node',
        ],
      } as any)
    : undefined;

  // Server defaults
  //
  // When the One app runs behind Frappe's dev proxy (port 8000 → 3000), the
  // browser page origin is :8000 but the vxrn HMR WebSocket lives on :3000.
  // Werkzeug (WSGI) can't proxy WebSocket upgrades, so we tell the HMR client
  // to connect directly when ONE_PORT is explicitly configured. Otherwise Vite
  // derives the client port from its actual listener, including CLI --port.
  //
  // IMPORTANT: vxrn internally sets `hmr.path = '/__vxrnhmr'`.  We must
  // include the path here because config merging replaces the entire `hmr`
  // object (shallow merge at the `server` level).  If vxrn ever changes the
  // path, update it here too.
  const onePort = Number(process.env.ONE_PORT);
  const defaultServer: UserConfig['server'] = {
    allowedHosts: ['localhost', '127.0.0.1', 'app.localhost', 'app.test'],
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
    ...(one
      ? {
          hmr: {
            path: '/__vxrnhmr',
            ...(onePort ? { clientPort: onePort } : {}),
          },
        }
      : {}),
    ...server,
  };

  return {
    css: {
      modules: {
        localsConvention: 'camelCase',
      },
    },
    build: {
      chunkSizeWarningLimit: 600,
    },
    define: {
      // Build-time flag for Frappe translation backend tree-shaking
      'process.env.VITE_FRAPPE_ENABLED': JSON.stringify(process.env.VITE_FRAPPE_ENABLED === 'true' ? 'true' : 'false'),
      // The public-config bake. @repo/platform's runtimeConfig
      // reads exactly these two static expressions (it carries no import.meta,
      // because Expo DOM components run it as a classic script), and
      // a static `process.env.<KEY>` is what Vite, vxrn/One and Metro all
      // inline. Absent when no public keys were declared, so a build without
      // them leaves the expressions alone and the reader falls back to {}.
      ...(publicConfigKeys.length > 0
        ? {
            'process.env.VITE_MP_CONFIG': JSON.stringify(process.env.VITE_MP_CONFIG ?? ''),
            'process.env.VITE_MP_PUBLIC_CONFIG_KEYS': JSON.stringify(process.env.VITE_MP_PUBLIC_CONFIG_KEYS ?? ''),
          }
        : {}),
    },
    ssr: ssr || defaultSsr,
    resolve: {
      // The context-singleton pins are merged in HERE too, not only
      // in storybook.ts. This is the whole build config a generated app has,
      // so a package that resolves to two module records dies here first.
      alias: withSingletonDepAliases(
        {
          // Fix tamagui-build outputting `from "react.mjs"` instead of `from "react"`
          'react.mjs': 'react',

          // React 19.1+ ships its own compiler runtime.  The standalone
          // `react-compiler-runtime` beta package (pulled in by `one`) gets
          // pre-bundled by Vite with its own React copy, causing a duplicate-
          // React dispatcher-is-null crash (`useMemoCache`).  Aliasing to
          // the built-in entry point ensures a single React instance.
          'react-compiler-runtime': 'react/compiler-runtime',

          // use-sync-external-store is marked as SSR-external by the
          // ssrExternalFix plugin in vite.config.ts, so Node's CJS loader
          // handles it during SSR (avoiding the "module is not defined" error).
          // Do NOT alias it here — Vite's prefix-match aliases catch subpaths
          // like /shim/with-selector.js and /with-selector, rewriting them to
          // react/with-selector which doesn't exist, crashing dep optimisation.
        },
        projectRoot,
      ),
      // @react-navigation/core ships a nested node_modules/react-is (CJS-only).
      // Deduplication forces the root copy so clientBrokenEsmPlugin's pre-bundle
      // covers it everywhere.
      dedupe: ['react-is'],
    },
    server: defaultServer,
    envPrefix: ['VITE_', 'TAURI_ENV_'],
    plugins: vitePlugins,
  } satisfies UserConfig;
}

export { discoverPublicPackageRoots, publicPackageViteSourceAliases } from './workspacePublicPackages.ts';
export { publicConfigPlugin, readPublicConfigKeys, type PublicConfigPluginOptions } from './publicConfig.ts';
export { phosphorTokenColorPlugin } from './phosphorTokenColor.ts';

/**
 * Aliases react-native to react-native-web in the SSR environment.
 *
 * @react-navigation/native statically imports react-native, which causes
 * Rolldown's dep optimizer to load react-native/index.js — a file that contains
 * Flow-only syntax (`import typeof`, `as Type`) that Rolldown cannot parse.
 * Aliasing to react-native-web redirects those imports to the web-safe shim,
 * so the real react-native package is never touched during SSR bundling.
 */
function ssrReactNativeAliasPlugin(): Plugin {
  return {
    name: 'multiplatform-ssr-react-native-alias',
    enforce: 'post',
    configResolved(config) {
      const ssrEnv = (config as any).environments?.ssr;
      if (!ssrEnv?.resolve) {
        return;
      }
      const alias: Array<{ find: string | RegExp; replacement: string }> = ssrEnv.resolve.alias ?? [];
      if (!alias.some((a: any) => a.find === 'react-native')) {
        alias.push({ find: 'react-native', replacement: 'react-native-web' });
      }
      ssrEnv.resolve.alias = alias;
    },
  };
}

/**
 * Adds packages that have broken or missing ESM default exports to the client
 * environments pre-bundle. Rolldown resolves them via their "import" condition
 * and generates a proper ESM chunk with synthetic interop default export.
 *
 * use-latest-callback: type=commonjs, exports.import → esm.mjs, but vxrn's
 * client conditions (["vxrn-web"]) skip "import" and land on "default" →
 * lib/src/index.js (CJS, named-only). Pre-bundling forces the import condition.
 */
function clientBrokenEsmPlugin(): Plugin {
  return {
    name: 'multiplatform-client-broken-esm',
    configResolved(config) {
      const clientEnv = (config as any).environments?.client;
      if (!clientEnv?.optimizeDeps) {
        return;
      }
      const extras = [
        'use-latest-callback',
        // CJS packages in vxrn's dedupe list that are not auto-added to the
        // client environment optimizer, causing "doesn't provide an export
        // named 'default'" errors when served raw by Vite.
        'escape-string-regexp',
        // Pure CJS with no "import" condition — subpath must be pre-bundled
        // explicitly so named exports (useSyncExternalStoreWithSelector) exist.
        // Root entry is SSR-external (Node handles it); client needs pre-bundle.
        'use-sync-external-store/with-selector',
        // @react-navigation/core ships a nested node_modules/react-is (CJS).
        // resolve.dedupe forces the root copy to be used; pre-bundling it here
        // adds ESM interop so named exports like isValidElementType are available.
        'react-is',
        // CJS-only packages imported by @react-navigation/* TypeScript source.
        // When the client loads @react-navigation/* via the "source" condition
        // (TypeScript), these transitive CJS deps get served raw and lack ESM
        // named exports. Pre-bundling generates the ESM interop wrappers.
        'fast-deep-equal',
        'color',
        // query-string v7 is CJS-only; imported by @react-navigation/core for URL parsing.
        'query-string',
        // react's JSX runtimes are CJS with no "import" condition, so a deep
        // import of a @repo/* src .tsx served raw fails with
        // "does not provide an export named 'jsx'".
        'react/jsx-runtime',
        'react/jsx-dev-runtime',
        // Vite never discovers a dep imported from a file inside
        // node_modules; it serves it raw. A consumer's deep import of a
        // @repo/* src file sits in node_modules, so its bare
        // "tamagui" import went raw and dragged react-native-web in raw, whose
        // CJS deps (@react-native/normalize-colors, inline-style-prefixer/lib)
        // have no ESM default. The barrel path never meets it.
        'tamagui',
      ];
      const include: string[] = clientEnv.optimizeDeps.include ?? [];
      for (const dep of extras) {
        if (!include.includes(dep)) {
          include.push(dep);
        }
      }
      clientEnv.optimizeDeps.include = include;
    },
  };
}

/**
 * Adds engine.io-client's `browser`-field transport redirect to vxrn's NATIVE
 * rolldown pipeline via its `globalThis.__vxrnAddNativePlugins` hook.
 *
 * socket.io-client -> engine.io-client/index.js statically imports its Node
 * transports (`./globals.node.js`, `./transports/{websocket,polling-xhr}.node.js`),
 * which pull `ws` + `xmlhttprequest-ssl` + Node globals. Those `.node` files also
 * contain raw ESM `import` syntax that Hermes can't even COMPILE, so the native
 * bundle dies at boot. engine.io's own `package.json` `browser` field already
 * redirects each `*.node.js` to a browser sibling that uses the global
 * `WebSocket` / `XMLHttpRequest` React Native provides — but vxrn's native
 * resolver omits the `browser` aliasField (and its rolldown binding doesn't even
 * support `aliasFields`). vxrn's native dev engine ignores the Vite config's
 * `resolve.alias`/`resolveId` too — BUT it DOES read `globalThis.__vxrnAddNativePlugins`
 * inside `getNativePlugins`, so a `resolveId` registered there runs on native.
 * This re-asserts the browser redirect with no node_modules patch. Web is
 * unaffected (engine.io is SSR-externalized and the web client already maps `browser`).
 */
/**
 * Collapse duplicate PHYSICAL copies of the same package@version to one path
 * in the NATIVE graph, so React (and every other stateful singleton) exists
 * exactly once in the Hermes bundle.
 *
 * The workspace's node_modules is a MIXED install. `.npmrc` says
 * `node-linker=hoisted`, so the root `node_modules/<pkg>` entries are real
 * directories; but an earlier isolated install left a `node_modules/.pnpm`
 * virtual store plus per-package symlink farms behind — e.g. each package's
 * own `node_modules/react` still points at
 * `../../../node_modules/.pnpm/react@19.2.5/node_modules/react`.
 * Both trees are fully populated with byte-identical copies, and which one an
 * importer reaches depends only on where that importer sits on disk:
 *
 *   apps/<app>/app     -> node_modules/.pnpm/react@19.2.5/node_modules/react
 *   packages/forms/src -> node_modules/react            (no local symlink)
 *
 * Rolldown resolves symlinks, so the two land as two DIFFERENT absolute paths
 * and it bundles both. React 19's `useContext` is
 * `ReactSharedInternals.H.useContext(Context)` — `H` is the dispatcher the
 * renderer installs during render, and it is only ever set on the copy the
 * renderer imported. A component from the other copy therefore reads `H` as
 * null and the app dies with "Cannot read property 'useContext' of null".
 * That is the whole bug; the same split had also duplicated react-native (427
 * modules each), @tamagui/web, @react-navigation/core, one, scheduler and 58
 * more packages.
 *
 * The rule: an id that resolves inside the virtual store is rewritten to the
 * hoisted root copy when the root copy exists, carries the SAME version, and
 * actually has the file. Version equality is the safety guard — genuine
 * multi-version installs (two @babel/runtime, two viem) keep both copies.
 *
 * On a correctly installed tree this is a no-op by construction: `hoisted`
 * leaves no `.pnpm` store to match, and `isolated` makes the root entry a
 * symlink INTO the store, which realpaths back to the same directory (checked
 * explicitly). It only fires on the mixed tree, and it is cheap because only
 * BARE specifiers are inspected — once a package's entry is canonical, its own
 * relative imports resolve inside the canonical copy for free.
 */
function registerNativeSinglePackageInstances(): void {
  const g = globalThis as unknown as { __vxrnAddNativePlugins?: unknown[] };
  const name = 'vxrn-single-package-instances';
  g.__vxrnAddNativePlugins = g.__vxrnAddNativePlugins ?? [];
  if (g.__vxrnAddNativePlugins.some((p) => (p as { name?: string })?.name === name)) {
    return;
  }

  const rootModules = path.join(findProjectRoot(), 'node_modules');
  // <...>/node_modules/.pnpm/<pkg>@<ver>_<peerhash>/node_modules/<name>[/<rest>]
  const storePath =
    /[\\/]node_modules[\\/]\.pnpm[\\/][^\\/]+[\\/]node_modules[\\/]((?:@[^\\/]+[\\/])?[^\\/]+)(?:[\\/](.*))?$/;

  function versionOf(dir: string): string | null {
    try {
      const raw = fs.readFileSync(path.join(dir, 'package.json'), 'utf8');
      return (JSON.parse(raw) as { version?: string }).version ?? null;
    } catch {
      return null;
    }
  }

  // package name -> hoisted root dir that is a safe stand-in, or null
  const hoisted = new Map<string, string | null>();
  function hoistedTwin(pkg: string, storeDir: string): string | null {
    if (!hoisted.has(pkg)) {
      const rootDir = path.join(rootModules, pkg);
      let twin: string | null = null;
      if (fs.existsSync(rootDir)) {
        const rootVersion = versionOf(rootDir);
        const storeVersion = versionOf(storeDir);
        // Same package, same version => identical library code, and the two
        // dirs are genuinely distinct (not one symlinked onto the other).
        if (rootVersion && rootVersion === storeVersion) {
          try {
            if (fs.realpathSync(rootDir) !== fs.realpathSync(storeDir)) {
              twin = rootDir;
            }
          } catch {
            twin = null;
          }
        }
      }
      hoisted.set(pkg, twin);
    }
    return hoisted.get(pkg) ?? null;
  }

  const seen = new Map<string, string | null>();

  g.__vxrnAddNativePlugins.push({
    name,
    async resolveId(
      this: {
        resolve: (
          id: string,
          importer: string | undefined,
          opts: { skipSelf: boolean },
        ) => Promise<{ id: string; external?: boolean | string } | null>;
      },
      id: string,
      importer?: string,
    ): Promise<string | null> {
      // Bare specifiers only: a package entry. Relative/absolute ids inside an
      // already-canonical package resolve within that copy on their own.
      if (!id || id.startsWith('.') || id.startsWith('/') || id.startsWith('\0')) {
        return null;
      }
      const key = `${id} ${importer ?? ''}`;
      const cached = seen.get(key);
      if (cached !== undefined) {
        return cached;
      }

      let out: string | null = null;
      try {
        const resolved = await this.resolve(id, importer, { skipSelf: true });
        const match = resolved?.external ? null : resolved?.id?.match(storePath);
        if (resolved && match) {
          const pkg = match[1].split(path.sep).join('/');
          const rest = match[2] ?? '';
          const storeDir = resolved.id.slice(0, resolved.id.length - (rest ? rest.length + 1 : 0));
          const twin = hoistedTwin(pkg, storeDir);
          if (twin) {
            const candidate = rest ? path.join(twin, rest) : twin;
            if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
              out = candidate;
            }
          }
        }
      } catch {
        out = null;
      }
      seen.set(key, out);
      return out;
    },
  });
}

function registerNativeEngineIoBrowserTransports(): void {
  const g = globalThis as unknown as { __vxrnAddNativePlugins?: unknown[] };
  const name = 'vxrn-engineio-browser-transports';
  g.__vxrnAddNativePlugins = g.__vxrnAddNativePlugins ?? [];
  if (g.__vxrnAddNativePlugins.some((p) => (p as { name?: string })?.name === name)) {
    return;
  }
  g.__vxrnAddNativePlugins.push({
    name,
    async resolveId(
      this: { resolve: (id: string, importer: string, opts: { skipSelf: boolean }) => unknown },
      id: string,
      importer?: string,
    ) {
      if (importer && /engine\.io-client[\\/]build[\\/]/.test(importer) && id.endsWith('.node.js')) {
        return this.resolve(`${id.slice(0, -'.node.js'.length)}.js`, importer, { skipSelf: true });
      }
      return null;
    },
  });
}

/**
 * Routes workspace (`@repo/*`) packages to their `dist/esm/index.native.js`
 * build on NATIVE, via vxrn's `globalThis.__vxrnAddNativePlugins` hook.
 *
 * Why this is needed: `preferBuiltWorkspaceEntryPlugin` (a Vite plugin, web/SSR only)
 * hard-resolves every workspace bare specifier to `<root>/dist/esm/index.mjs` — the WEB
 * build — bypassing the package.json `exports` `react-native` condition. That web
 * resolution propagates into vxrn's native graph (the native engine receives no Vite
 * userPlugins, so it cannot be made native-aware there), pinning the entire workspace
 * chain to web on native and dragging web-only deps (@tiptap, prosemirror, html5-qrcode,
 * @mixmark-io/domino, …) into Hermes. Each affected package ships a `dist/esm/index.native.js`
 * (built by tamagui-build, intra-package imports already rewritten to their `.native`
 * siblings). This resolveId matches both forms — the bare specifier and the already-resolved
 * `…/dist/esm/index.mjs` path — and redirects to the native sibling when it exists, so the
 * react-native build wins on native. Web/SSR are unaffected (this plugin runs ONLY on native).
 */
function registerNativeWorkspaceEntries(): void {
  const g = globalThis as unknown as { __vxrnAddNativePlugins?: unknown[] };
  const name = 'vxrn-workspace-native-entries';
  g.__vxrnAddNativePlugins = g.__vxrnAddNativePlugins ?? [];
  if (g.__vxrnAddNativePlugins.some((p) => (p as { name?: string })?.name === name)) {
    return;
  }
  let roots: Map<string, string>;
  try {
    roots = discoverPublicPackageRoots(findProjectRoot());
  } catch {
    roots = new Map();
  }
  g.__vxrnAddNativePlugins.push({
    name,
    resolveId(id: string): string | null {
      // (a) bare workspace specifier (e.g. "@repo/ui")
      const root = roots.get(id);
      if (root) {
        // Prefer the built native entry when present (tamagui-build already
        // rewrote intra-package imports to their `.native` siblings).
        const nativeEntry = path.join(root, 'dist/esm/index.native.js');
        if (fs.existsSync(nativeEntry)) {
          return nativeEntry;
        }
        // Unbuilt workspace package: compile from source instead of letting
        // rolldown leave the bare specifier external — Hermes has no module
        // mode, so a surviving top-level `import` is unparseable. Mirrors
        // preferBuiltWorkspaceEntryPlugin (web) and apps/storybook-expo's
        // Metro resolveWorkspaceNativeMain. vxrn's native resolver already
        // does platform-extension resolution (.native.tsx/.ios.tsx/…).
        const srcTs = path.join(root, 'src/index.ts');
        if (fs.existsSync(srcTs)) {
          return srcTs;
        }
        const srcTsx = path.join(root, 'src/index.tsx');
        if (fs.existsSync(srcTsx)) {
          return srcTsx;
        }
        return null;
      }
      // (b) already-resolved web entry "<...>/dist/esm/index.mjs" -> ".native.js" sibling
      if (id.endsWith('/dist/esm/index.mjs')) {
        const nativeEntry = `${id.slice(0, -'.mjs'.length)}.native.js`;
        if (fs.existsSync(nativeEntry)) {
          return nativeEntry;
        }
      }
      return null;
    },
  });
}

/**
 * CJS-only ids (no usable ESM build) that escape Vite's SSR dep optimizer and
 * hit the ESM evaluator ("module is not defined" / "exports is not defined")
 * unless Node's native CJS loader handles them. Union of the lists the
 * monorepo's main app and downstream consumer apps carried as
 * app-side ssrExternalFix plugins; ids for packages an app never imports are
 * inert, so one shared default list is safe.
 */
const DEFAULT_SSR_CJS_EXTERNAL = [
  'better-sqlite3',
  'dotenv',
  'color',
  'use-sync-external-store',
  'use-sync-external-store/shim',
  'use-sync-external-store/shim/with-selector',
  'highlight.js',
  'highlight.js/lib/core',
  'turndown',
  '@mixmark-io/domino',
  'lowlight',
  // CJS-only (module.exports / exports, no usable ESM build) pulled in by
  // connectkit/wagmi/framer-motion.
  'shallowequal',
  '@emotion/is-prop-valid',
  'hoist-non-react-statics',
  'qrcode',
];

/**
 * Force-append CJS-only ids to `ssr.external`. The one() plugin REPLACES
 * ssr.external with its own list during the config hook, dropping anything
 * set statically by createViteConfig — configResolved runs after all config
 * hooks are merged, so appends here survive.
 */
function ssrCjsExternalFixPlugin(extras: string[]): Plugin {
  return {
    name: 'multiplatform-ssr-cjs-external-fix',
    configResolved(config) {
      const external = config.ssr.external ?? [];
      if (!Array.isArray(external)) {
        return;
      } // true = everything external already
      for (const e of extras) {
        if (config.command === 'build' && requiresReact(e)) {
          continue;
        }
        if (!external.includes(e)) {
          external.push(e);
        }
      }
      (config.ssr as { external?: string[] | boolean }).external = external;
    },
  };
}

function requiresReact(id: string): boolean {
  return id === 'use-sync-external-store' || id.startsWith('use-sync-external-store/');
}

/**
 * Restore Object.prototype methods shadowed by hoisted globals on NATIVE.
 *
 * vxrn's rolldown native mode emits the whole dev bundle as ONE classic
 * script and forces Hermes V1. Hermes V1 implements spec-compliant global
 * var hoisting, so a flattened module's top-level `var hasOwnProperty`
 * (e.g. acorn via an mdx pipeline) creates
 * `globalThis.hasOwnProperty = undefined` at parse time, shadowing
 * Object.prototype.hasOwnProperty for the entire runtime. React Native core
 * calls `global.hasOwnProperty()` during boot (FuseboxSessionObserver) and
 * dies with "undefined is not a function". Prepend a snippet that copies any
 * Object.prototype method back over an undefined shadowing own-property
 * before any module code runs — the shadowed vars are reassigned by their
 * own modules on init, so this only bridges the parse-to-init window.
 * Registered through globalThis.__vxrnAddNativePlugins (vxrn's native engine
 * ignores vite resolve/config). Web/SSR bundles are ESM (module-scoped vars)
 * and unaffected.
 */
function registerNativeProtoShadowFix(): void {
  const g = globalThis as unknown as { __vxrnAddNativePlugins?: unknown[] };
  const name = 'vxrn-proto-shadow-fix';
  g.__vxrnAddNativePlugins = g.__vxrnAddNativePlugins ?? [];
  if (g.__vxrnAddNativePlugins.some((p) => (p as { name?: string })?.name === name)) {
    return;
  }
  const snippet =
    `(function(){var p=Object.prototype,h=p.hasOwnProperty,ns=Object.getOwnPropertyNames(p);` +
    `for(var i=0;i<ns.length;i++){var k=ns[i];` +
    `if(typeof p[k]==="function"&&globalThis[k]===void 0&&h.call(globalThis,k)){` +
    `try{globalThis[k]=p[k]}catch(e){}}}})();`;
  g.__vxrnAddNativePlugins.push({
    name,
    renderChunk(code: string) {
      return { code: `${snippet}\n${code}`, map: null };
    },
  });
}

/**
 * Redirect the OPTIONAL `@multiplatform.one/web3` native import to a no-op
 * shim on NATIVE when the package is not installed (see the nativeFixes
 * option docs). Rolldown leaves the unresolvable specifier as a bare dynamic
 * `import()` in the classic-script native bundle — Hermes rejects that at
 * lazy-compile time ("SyntaxError: Invalid expression encountered"), killing
 * the root _layout route. Web/SSR resolve the same specifier through vite's
 * normal pipeline and are unaffected.
 */
function registerNativeWeb3Stub(): void {
  const g = globalThis as unknown as { __vxrnAddNativePlugins?: unknown[] };
  const name = 'vxrn-web3-stub';
  g.__vxrnAddNativePlugins = g.__vxrnAddNativePlugins ?? [];
  if (g.__vxrnAddNativePlugins.some((p) => (p as { name?: string })?.name === name)) {
    return;
  }
  try {
    // web3 installed — its real native entry resolves; no stub needed.
    require.resolve('@multiplatform.one/web3', { paths: [findProjectRoot(), process.cwd()] });
    return;
  } catch {
    // not installed — stub below
  }
  // The shim ships as plain JS (vxrn does not transform node_modules TS).
  // Resolve it relative to this module: `src/shims/` when running from
  // source, `../src/shims/` from the built `lib/` bundle (src ships in the
  // published tarball).
  const here = path.dirname(new URL(import.meta.url).pathname);
  const shim = [
    path.resolve(here, 'shims/web3Stub.native.js'),
    path.resolve(here, '../src/shims/web3Stub.native.js'),
  ].find((candidate) => fs.existsSync(candidate));
  if (!shim) {
    return;
  }
  g.__vxrnAddNativePlugins.push({
    name,
    resolveId(id: string) {
      if (id === '@multiplatform.one/web3/native' || id === '@multiplatform.one/web3') {
        return shim;
      }
      return null;
    },
  });
}

function findProjectRoot(): string {
  try {
    const { execSync } = require('node:child_process');
    return execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
  } catch {
    return process.cwd();
  }
}

/**
 * Resolve `@phosphor-icons/react` to `phosphor-react-native` in the NATIVE
 * graph only. The web package renders DOM `<svg>`/`<path>` and crashes Hermes
 * the moment any icon mounts; the RN package draws the same icon set through
 * react-native-svg and (as of v3) exports identical `*Icon`-suffixed names,
 * so app/library source needs no platform splits. Skipped (with a warning)
 * when phosphor-react-native isn't installed in the consuming project.
 */
function registerNativePhosphorIcons(): void {
  const g = globalThis as unknown as { __vxrnAddNativePlugins?: unknown[] };
  const name = 'vxrn-phosphor-native-icons';
  g.__vxrnAddNativePlugins = g.__vxrnAddNativePlugins ?? [];
  if (g.__vxrnAddNativePlugins.some((p) => (p as { name?: string })?.name === name)) {
    return;
  }
  let nativeEntry: string | null = null;
  try {
    // The package's exports map doesn't expose "./package.json", so resolve
    // the entry itself (require condition -> lib/commonjs/index.js) and swap
    // to the ESM build; the icons import react-native-svg.
    const cjsEntry = require.resolve('phosphor-react-native', {
      paths: [findProjectRoot(), process.cwd()],
    });
    const esmEntry = cjsEntry.replace(
      `${path.sep}lib${path.sep}commonjs${path.sep}`,
      `${path.sep}lib${path.sep}module${path.sep}`,
    );
    nativeEntry = fs.existsSync(esmEntry) ? esmEntry : cjsEntry;
  } catch {
    nativeEntry = null;
  }
  g.__vxrnAddNativePlugins.push({
    name,
    resolveId(id: string): string | null {
      if (id !== '@phosphor-icons/react') {
        return null;
      }
      if (!nativeEntry) {
        console.warn(
          '[config] @phosphor-icons/react imported in the native graph but ' +
            'phosphor-react-native is not installed — icons will crash Hermes. ' +
            'Add phosphor-react-native to your app dependencies.',
        );
        return null;
      }
      return nativeEntry;
    },
  });
}

/**
 * package.json `exports` cannot branch on whether `dist/` exists. For workspace
 * packages, prefer `dist/esm/index.{mjs,js}` when built; otherwise fall back to
 * `src/index.ts` so local dev works without a build while published tarballs
 * still resolve through `exports` to `dist`.
 */
function preferBuiltWorkspaceEntryPlugin(): Plugin {
  const roots = discoverPublicPackageRoots(findProjectRoot());

  return {
    name: 'multiplatform-prefer-built-workspace-main',
    enforce: 'pre',
    resolveId(id) {
      const root = roots.get(id);
      if (!root) {
        return null;
      }
      const distCandidates = [path.join(root, 'dist/esm/index.mjs'), path.join(root, 'dist/esm/index.js')];
      for (const file of distCandidates) {
        if (fs.existsSync(file)) {
          return file;
        }
      }
      const srcTs = path.join(root, 'src/index.ts');
      if (fs.existsSync(srcTs)) {
        return srcTs;
      }
      const srcTsx = path.join(root, 'src/index.tsx');
      if (fs.existsSync(srcTsx)) {
        return srcTsx;
      }

      // Vendored packages (e.g. keycloak-js) have no src/ — resolve via
      // package.json exports/main so the dep scanner doesn't fail.
      const pkgJsonPath = path.join(root, 'package.json');
      if (fs.existsSync(pkgJsonPath)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
          const entry = pkg.exports?.['.']?.import || pkg.exports?.['.']?.default || pkg.main || pkg.module;
          if (entry) {
            const resolved = path.resolve(root, entry);
            if (fs.existsSync(resolved)) {
              return resolved;
            }
          }
        } catch {
          /* ignore */
        }
      }
      return null;
    },
  };
}
