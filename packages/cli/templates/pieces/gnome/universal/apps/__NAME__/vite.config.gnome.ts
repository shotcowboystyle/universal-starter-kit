// Vite config for the GNOME (GTK4 / GJS / libadwaita) target.
//
// Builds gnome/main.tsx into dist/gnome/main.js, runnable with:
//
//   pnpm gnome            # interactive window
//   pnpm gnome:capture    # render, save a PNG, quit
//
// THIS IS NOT A VARIANT OF THE WEB BUILD. The web target is One (file
// router, SSR, react-native-web); this one is a plain Vite library build
// whose output GJS executes directly, rendering REAL GTK4 widgets through
// react-gnome — no webview, no DOM.
//
// The generic react-gnome settings (aliases, conditions, define, React
// dedupe, .native.* extensions) come from @react-gnome/vite-plugin; the
// Tamagui-under-GJS bundle patches come from
// @repo/vite-plugin-gnome.

import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

import { gnomePlatformExtensions, tamaguiLinkedAliases, tamaguiPlugin } from '@repo/vite-plugin-gnome';
import {
  gnomeConditions,
  gnomeDedupe,
  gnomeDefine,
  gnomeExtensions,
  gnomeLinkedAliases,
} from '@react-gnome/vite-plugin';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vite';

const require = createRequire(import.meta.url);
const nodeEnv = process.env.RGN_PROD === '1' ? 'production' : 'development';
const gnomeDir = resolve(import.meta.dirname, 'gnome');

/** Directory a package resolves to, so aliases point at THIS app's
 *  installed copy. pnpm's store layout means a bare package name resolved
 *  from a file outside this app (a linked workspace source, a hoisted
 *  @tamagui/*) can miss these — absolute paths cannot. */
function pkgDir(id: string): string {
  return dirname(require.resolve(`${id}/package.json`));
}

/** The installed @react-gnome scope directory. Under pnpm's default
 *  isolated linker it sits in THIS app's node_modules; under
 *  `node-linker=hoisted` (this scaffold's .npmrc) everything hoists to
 *  the workspace root and the app-local dir never exists. Walk upward to
 *  whichever node_modules actually holds the scope — require.resolve
 *  can't do this lookup because the @react-gnome packages' export maps
 *  hide package.json. */
function reactGnomeScopeDir(): string {
  for (let dir = import.meta.dirname; ;) {
    const candidate = resolve(dir, 'node_modules/@react-gnome');
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error('@react-gnome scope not found in any node_modules');
    }
    dir = parent;
  }
}

/** Stub real-RN Flow internals and the expo surface. A dependency that
 *  deep-imports `react-native/Libraries/...` slips past the package-root
 *  alias, and the bundler cannot parse RN's Flow sources; expo modules
 *  arrive through accidental native-condition resolution and have no GJS
 *  implementation at all. */
const stubRnLibraries: Plugin = {
  name: 'gnome-stub-rn-libraries',
  enforce: 'pre',
  resolveId(id) {
    const stub =
      id.includes('react-native/Libraries/') ||
      id.includes('NativeComponentRegistry') ||
      id.startsWith('expo-') ||
      id.includes('expo-modules-core');
    if (stub) {
      return resolve(gnomeDir, 'shims/empty-module.ts');
    }
  },
};

export default defineConfig({
  // Don't copy public/ (web favicons) or the generated tamagui.css into
  // the GJS bundle directory.
  publicDir: false,
  plugins: [stubRnLibraries, react(), tamaguiPlugin],
  resolve: {
    conditions: [...gnomeConditions],
    alias: [
      // gnomeLinkedAliases points the renderer at its SOURCE entry — right
      // for a link:ed react-gnome checkout whose dist is a stale gitignored
      // build, wrong for the registry tarball, which ships dist ONLY
      // (files: ["dist", …]). First alias match wins, so prepend the dist
      // fallback when there is no src to point at.
      ...(existsSync(resolve(reactGnomeScopeDir(), 'renderer/src/index.ts'))
        ? []
        : [
            {
              find: /^@react-gnome\/renderer$/,
              replacement: resolve(reactGnomeScopeDir(), 'renderer/dist/index.js'),
            },
          ]),
      ...gnomeLinkedAliases(reactGnomeScopeDir()),
      // `tamagui` meta-package → a lean barrel re-exporting only the
      // granular @tamagui/* packages this app's graph reaches. The full
      // meta-barrel drags web-only components into the GJS bundle.
      ...tamaguiLinkedAliases({ tamaguiBarrel: resolve(gnomeDir, 'tamagui-barrel.ts') }),
      // Barrels narrowed for GJS — see gnome/shims/*.ts for what each
      // one drops and why. Exact-name regexes so the shims' own deep
      // `…/src/*` imports don't loop back through the alias.
      {
        find: /^@multiplatform\.one\/components$/,
        replacement: resolve(gnomeDir, 'shims/components.ts'),
      },
      { find: /^@multiplatform\.one\/theme$/, replacement: resolve(gnomeDir, 'shims/theme.ts') },
      { find: /^@multiplatform\.one\/forms$/, replacement: resolve(gnomeDir, 'shims/forms.ts') },
      {
        find: /^@multiplatform\.one\/frappe-ui$/,
        replacement: resolve(gnomeDir, 'shims/frappe-ui.ts'),
      },
      // One's file router never mounts on GJS (react-native-screens is a
      // native-fabric dead end). The shim backs the router API the
      // screens consume with the framework's navigator seam.
      { find: /^one$/, replacement: resolve(gnomeDir, 'shims/one.ts') },
      // The seam BARREL also exports the DOM host and the One adapter,
      // whose @vxrn/color-scheme import has no GJS story. Resolve the
      // navigator source alone.
      {
        find: /^@multiplatform\.one\/router\/seam$/,
        replacement: resolve(pkgDir('@repo/router'), 'src/seam/navigator.ts'),
      },
    ],
    // One React instance. The @react-gnome packages carry their own react
    // and react-reconciler copies; dedupe forces every import (including
    // react-reconciler's CJS require) to this app's root.
    dedupe: [...gnomeDedupe],
    // Metro-style platform resolution. `.gnome.*` goes FIRST so a module
    // that ships a real GNOME implementation wins — this registration is
    // what makes @repo/platform's `isGnome` true rather than a
    // flag nothing ever sets. `.native.*` stays behind it as the fallback
    // for modules that only split web/native (GTK legitimately reports
    // isNative).
    extensions: [...gnomePlatformExtensions, ...gnomeExtensions],
  },
  define: gnomeDefine(nodeEnv),
  build: {
    target: 'esnext',
    outDir: 'dist/gnome',
    emptyOutDir: true,
    // GJS reads the bundle directly — keep it readable and mapped, since
    // a stack trace here is the only debugger you get.
    minify: false,
    sourcemap: 'inline',
    lib: {
      entry: resolve(gnomeDir, 'main.tsx'),
      formats: ['es'],
      fileName: () => 'main.js',
    },
    rollupOptions: {
      // GJS provides these; bundling them is not possible.
      external: [/^gi:\/\//, 'system', 'console', 'cairo'],
    },
  },
});
