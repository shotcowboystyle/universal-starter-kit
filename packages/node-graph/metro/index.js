/**
 * Metro preset for @repo/node-graph (design §9.2, MPO-211 task 2.1).
 *
 *   const { withNodeGraph } = require("@repo/node-graph/metro");
 *   module.exports = withStorybook(withNodeGraph(config), { ... });
 *
 * Plain CommonJS with no build step, because a metro.config.js is loaded by Node
 * before any transform exists. It touches no `sourceExts`, no `blockList` and no
 * `transformer` — those belong to the app.
 *
 * It does four things.
 *
 * 1. zustand resolves to its CommonJS build. A DOM component (`'use dom'`) is
 *    bundled at platform=web, so Metro reads package exports under the `import`
 *    condition, but the host serves that bundle as a CLASSIC `<script>`, never
 *    `type="module"`. zustand's ESM builds guard dev warnings with
 *    `import.meta.env.MODE`, and in a classic script `import.meta` is a
 *    PARSE-time SyntaxError: the script never executes, so no error boundary is
 *    reachable and the WebView is a blank rectangle with no console the user can
 *    see. Its CJS builds carry no such token. Verified in this repo:
 *    @xyflow/react 12.11.5 ships a NESTED zustand 4.5.7 whose esm/index.mjs,
 *    esm/vanilla.mjs, esm/middleware.mjs, esm/shallow.mjs and esm/context.mjs
 *    all match; the root-hoisted zustand 5.0.0 matches in esm/middleware.mjs.
 *    Neither package's `.js` files do.
 *
 *    The redirect resolves from the ORIGIN module, not from this package. The
 *    request for zustand comes from inside @xyflow/react, which declares
 *    `^4.4.0` and gets a nested 4.5.7; resolving from the root would hand it the
 *    hoisted 5.x, a different major.
 *
 * 2. It wires this package into `watchFolders` and `extraNodeModules` when it is
 *    a workspace checkout, composing with the app's own discovery rather than
 *    replacing it: an existing entry for the package, or a watch folder that
 *    already covers it, is left exactly as the app wrote it.
 *
 * 3. It CHAINS any existing `resolveRequest`. apps/storybook-expo already sets
 *    one (punycode CJS, the workspace-native-main branch, the phosphor IconBase
 *    shim, the pnpm nesting walk) and ends by calling the original. Clobbering
 *    that is how MPO-74 killed five TestFlight builds.
 *
 * 4. It warns loudly when `resolver.unstable_enablePackageExports` is false. The
 *    zustand fix is only needed under package exports, so a silent no-op there
 *    produces a blank WebView with a parse error nobody attributes to metro
 *    config.
 *
 * Applying it twice is a no-op, marked with a well-known symbol on the config,
 * because a preset that wraps its own wrapper is a chain nobody can read.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const packageName = '@repo/node-graph';
const packageRoot = path.resolve(__dirname, '..');
const nodeGraphMetroMarker = Symbol.for('@repo/node-graph/metro');

/**
 * True when this copy is a workspace checkout rather than an installed
 * dependency. Adding a watch folder inside node_modules would make Metro crawl
 * the store, so the wiring in step 2 is for the checkout only.
 */
const isWorkspaceCheckout = !packageRoot.split(path.sep).includes('node_modules');

/**
 * The CJS file a zustand specifier should land on.
 *
 * zustand publishes `<root>/<subpath>.js` for every ESM `<root>/esm/<subpath>.mjs`,
 * plus directory forms for the deep subpaths (`middleware/immer`), so both
 * shapes are tried and the first that exists on disk wins. Nothing is guessed:
 * a specifier with no CJS file falls through to the next resolver untouched.
 *
 * @param {string | undefined} originModulePath the importer, per Metro's context
 * @param {string} moduleName the specifier being resolved
 * @returns {string | null} an absolute path, or null to leave the request alone
 */
function resolveZustandCjs(originModulePath, moduleName) {
  if (moduleName !== 'zustand' && !moduleName.startsWith('zustand/')) {
    return null;
  }
  const subpath = moduleName === 'zustand' ? '' : moduleName.slice('zustand/'.length);
  // An explicit ESM or package.json request is answered as asked. Rewriting it
  // would be a lie about what the importer wanted, and nothing in this package
  // makes one.
  if (subpath.startsWith('esm/') || subpath.endsWith('.mjs') || subpath === 'package.json') {
    return null;
  }
  const bases = [];
  if (typeof originModulePath === 'string' && originModulePath.length > 0) {
    bases.push(path.dirname(originModulePath));
  }
  bases.push(packageRoot, __dirname);
  let pkgJsonPath = null;
  for (const base of bases) {
    try {
      pkgJsonPath = require.resolve('zustand/package.json', { paths: [base] });
      break;
    } catch {
      /* try the next base */
    }
  }
  if (!pkgJsonPath) {
    return null;
  }
  const zustandRoot = path.dirname(pkgJsonPath);
  const candidates =
    subpath === ''
      ? [path.join(zustandRoot, 'index.js')]
      : [path.join(zustandRoot, `${subpath}.js`), path.join(zustandRoot, subpath, 'index.js')];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

/**
 * The resolver alone, for an app that already owns `resolveRequest` and would
 * rather compose by hand than hand its config over.
 *
 * @param {Function | undefined} next the resolver to defer to
 * @returns {Function} a Metro `resolveRequest`
 */
function nodeGraphResolveRequest(next) {
  return function nodeGraphResolve(context, moduleName, platform) {
    const cjs = resolveZustandCjs(context && context.originModulePath, moduleName);
    if (cjs) {
      return { type: 'sourceFile', filePath: cjs };
    }
    if (typeof next === 'function') {
      return next(context, moduleName, platform);
    }
    return context.resolveRequest(context, moduleName, platform);
  };
}

/**
 * @param {object} config a Metro config, mutated in place and returned
 * @returns {object} the same config
 */
function withNodeGraph(config) {
  const cfg = config || {};
  if (cfg[nodeGraphMetroMarker]) {
    return cfg;
  }

  cfg.resolver ??= {};
  const { resolver } = cfg;

  if (resolver.unstable_enablePackageExports === false) {
    console.warn(
      `[${packageName}/metro] resolver.unstable_enablePackageExports is false, so this preset's zustand fix cannot help. ` +
        "Under package exports Metro resolves zustand's ESM build for a DOM component's platform=web bundle, and that build's " +
        '`import.meta` is a PARSE-time SyntaxError in the classic script the WebView runs — a blank canvas with no reachable ' +
        "error boundary. Set resolver.unstable_enablePackageExports = true, or confirm your resolver reaches zustand's CJS build.",
    );
  }

  resolver.resolveRequest = nodeGraphResolveRequest(resolver.resolveRequest);

  if (isWorkspaceCheckout) {
    const watchFolders = Array.isArray(cfg.watchFolders) ? cfg.watchFolders : [];
    const covered = watchFolders.some(
      (folder) =>
        typeof folder === 'string' && (folder === packageRoot || packageRoot.startsWith(`${folder}${path.sep}`)),
    );
    cfg.watchFolders = covered ? watchFolders : [...watchFolders, packageRoot];

    const extraNodeModules = resolver.extraNodeModules ?? {};
    if (!extraNodeModules[packageName]) {
      resolver.extraNodeModules = { ...extraNodeModules, [packageName]: packageRoot };
    }
  }

  Object.defineProperty(cfg, nodeGraphMetroMarker, {
    value: true,
    enumerable: false,
    configurable: true,
  });
  return cfg;
}

module.exports = { nodeGraphMetroMarker, nodeGraphResolveRequest, withNodeGraph };
