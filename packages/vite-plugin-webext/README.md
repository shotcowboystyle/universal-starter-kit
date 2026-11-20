# @repo/vite-plugin-webext

Vite config factories for building a browser web extension (MV3 views,
background service worker, content scripts) as a target of a
universal-starter-kit One app. Three vite builds cover the three JS worlds
(DOM extension pages, worker, injected content script);
`runWebextPrepare` writes the manifest and the dev-mode HMR scaffolding
into a loadable staging dir:

```
<stagingDir>/manifest.json
<stagingDir>/dist/views/<view>/index.html   (popup/options/sidepanel/…)
<stagingDir>/dist/background/index.mjs      (service worker / bg script)
<stagingDir>/dist/contentScripts/index.global.js
<stagingDir>/dist/contentScripts/webext.css (web-accessible resource)
```

## Usage

One config file per JS world, plus a prepare script. Every directory
under `<targetDir>/views/` with an `index.html` becomes an extension
page.

```ts
// vite.config.webext.ts — extension pages (popup/options/…)
import { resolve } from 'node:path';
import { createWebextViewsConfig } from '@repo/vite-plugin-webext';
import { defineConfig } from 'vite';
import packageJson from './package.json';

export default defineConfig(async () =>
  createWebextViewsConfig({
    targetDir: resolve(import.meta.dirname, 'webext'),
    stagingDir: resolve(import.meta.dirname, 'dist-webext'),
    tamaguiConfig: resolve(import.meta.dirname, 'config/tamagui.config.ts'),
    packageInfo: packageJson,
    // MANDATORY for extension builds — see "one must be aliased" below.
    aliases: [{ find: /^one$/, replacement: '@repo/router/seam' }],
  }),
);
```

`createWebextBackgroundConfig` (sync) and `createWebextContentConfig`
(async) take the same options for the worker and content-script builds;
`runWebextPrepare({ targetDir, stagingDir, getManifest, isDev, port,
watch })` stages the manifest, static assets, and dev HMR scaffolding.

## Required dependencies (the real consumer contract)

Declared peers — install them next to this plugin:

| package                | why                                                                   |
| ---------------------- | --------------------------------------------------------------------- |
| `vite` >=5             | the build tool itself                                                 |
| `@vitejs/plugin-react` | views build (react fast-refresh + jsx). Lazy-imported at factory call |
| `@tamagui/vite-plugin` | views + content builds (static extraction). Lazy-imported             |

Beyond the declared peers, a real app build needs:

- **`@tamagui/web` as a direct dependency of your app.** The Tamagui
  static extractor bundles your `tamaguiConfig` to
  `<cwd>/.tamagui/tamagui.config.{cjs,mjs}` and requires it from there,
  with `@tamagui/web` left external. Under pnpm's default isolated
  `node_modules`, transitive packages are not resolvable from your app,
  so the extractor fails with "Error bundling tamagui config: Cannot
  find package '@tamagui/web'…" — and (upstream) swallows it, silently
  shipping a de-optimized runtime-styled build. This plugin turns that
  into a hard error in production builds; fix it by adding
  `@tamagui/web` to your app's `dependencies`.
- **`react-i18next` + `i18next`, if you render the i18n-using catalog
  components.** `@repo/ui` translates built-in
  copy (Alert, Toast, Carousel, ConfirmDialog, Pagination, views/,
  layouts/, …) via an optional `react-i18next` peer. Apps that never
  render those components may omit both packages and tree-shake the
  components away; apps that do render them get a named runtime error
  telling you to install `react-i18next` and `i18next`.

## `one` must be aliased to the router seam

Extension pages must NOT bundle the real `one` runtime: it drags in
`@react-navigation/core` (and server-only modules) and the build fails.
This is mandatory, not stylistic — alias `one` to the stack-navigation
seam in every webext config that renders shared feature code:

```ts
aliases: [{ find: /^one$/, replacement: "@repo/router/seam" }],
```

The seam (`@repo/router/seam`) implements One's router API
over DOM pages, so shared `features/` code written against One's router
works unchanged inside the extension.

Relatedly, `one`'s client code imports `./vite/one-server-only.mjs`
(node-only); the factories redirect any `one-server-only` id to one's
published browser/native no-op. The redirect resolves the installed
`one` package through node resolution (build cwd, then
`workspaceRoot`); when `one` is not installed at all the redirect is
skipped with a one-line warning and normal resolution proceeds.

## `workspaceRoot` semantics

`workspaceRoot` defaults to the git toplevel (`git rev-parse
--show-toplevel`) of the build cwd. It is used for two things:

1. **Workspace source aliases.** Inside the universal-starter-kit monorepo,
   every `public/*` package (and its subpath exports) is aliased to its
   TypeScript source so builds never consume stale `dist` artifacts.
   Out-of-repo there is no `public/` under the root, the aliasing
   no-ops, and `@repo/*` resolves from `node_modules` like
   any other package — the factories log one line when this happens:
   `no public/ under <root> — resolving @repo/* from
node_modules`.
2. **The one-server-only redirect** falls back to resolving `one` from
   `workspaceRoot` when it cannot be resolved from the build cwd.

Pass `workspaceRoot` explicitly when your app builds from a directory
whose git toplevel is not the dependency root (e.g. a nested repo).
