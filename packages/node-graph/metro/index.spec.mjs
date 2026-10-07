import assert from 'node:assert/strict';
/**
 * The metro preset, specced against the real installed tree (MPO-211, plan 2.1).
 *
 * Run with `node --test public/node-graph/metro/index.spec.mjs`. This is a
 * node:test file, not a vitest one, on purpose: the preset is plain CJS with no
 * build step, and vitest's include glob here is `src/**` so it never sees it.
 *
 * The zustand assertions read the tree that is actually installed rather than a
 * fixture. That is the point — the defect this preset exists to stop is a
 * PARSE-time `import.meta` SyntaxError inside a real dependency's ESM build, and
 * a fixture cannot go stale in the way that matters.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { describe, it } from 'vitest';

const require_ = createRequire(import.meta.url);
const preset = require_('./index.js');
const { nodeGraphResolveRequest, withNodeGraph, nodeGraphMetroMarker } = preset;

const here = import.meta.dirname;
const packageRoot = path.resolve(here, '..');
const xyflowRoot = path.dirname(require_.resolve('@xyflow/react/package.json'));
/** A plausible origin INSIDE @xyflow/react, which is what asks for zustand. */
const xyflowOrigin = path.join(xyflowRoot, 'dist/esm/index.mjs');

/** @returns {object} a context shaped like metro's, with a default resolver that records. */
function makeContext(originModulePath, seen) {
  return {
    originModulePath,
    resolveRequest(_context, moduleName, platform) {
      seen.push(['context.resolveRequest', moduleName, platform]);
      return { type: 'sourceFile', filePath: `default:${moduleName}` };
    },
  };
}

describe('withNodeGraph', () => {
  it('chains an existing resolveRequest instead of replacing it', () => {
    const seen = [];
    const original = (context, moduleName, platform) => {
      seen.push(['original', moduleName, platform]);
      return { type: 'sourceFile', filePath: `original:${moduleName}` };
    };
    const config = withNodeGraph({ resolver: { resolveRequest: original } });

    const result = config.resolver.resolveRequest(makeContext(xyflowOrigin, seen), 'classcat', 'web');

    assert.deepEqual(result, { type: 'sourceFile', filePath: 'original:classcat' });
    assert.deepEqual(seen, [['original', 'classcat', 'web']]);
  });

  it('falls through to context.resolveRequest when the config had none', () => {
    const seen = [];
    const config = withNodeGraph({});
    const result = config.resolver.resolveRequest(makeContext(xyflowOrigin, seen), 'classcat', 'web');
    assert.deepEqual(result, { type: 'sourceFile', filePath: 'default:classcat' });
    assert.deepEqual(seen, [['context.resolveRequest', 'classcat', 'web']]);
  });

  it('resolves zustand and zustand/middleware to .js, never .mjs', () => {
    const seen = [];
    const config = withNodeGraph({});
    const context = makeContext(xyflowOrigin, seen);

    for (const specifier of ['zustand', 'zustand/middleware']) {
      const result = config.resolver.resolveRequest(context, specifier, 'web');
      assert.equal(result.type, 'sourceFile', `${specifier} must resolve to a source file`);
      assert.ok(result.filePath.endsWith('.js'), `${specifier} resolved to ${result.filePath}, which does not end .js`);
      assert.ok(!result.filePath.endsWith('.mjs'), `${specifier} resolved to the ESM build ${result.filePath}`);
      assert.ok(fs.existsSync(result.filePath), `${result.filePath} does not exist`);
      assert.equal(
        fs.readFileSync(result.filePath, 'utf-8').includes('import.meta'),
        false,
        `${result.filePath} still carries the import.meta token`,
      );
    }
    assert.deepEqual(seen, [], 'the zustand branch must not reach the next resolver');
  });

  it('resolves zustand from the ORIGIN module, so @xyflow/react keeps its nested copy', () => {
    const nested = path.join(xyflowRoot, 'node_modules/zustand');
    if (!fs.existsSync(nested)) {
      return;
    } // a hoisted tree has nothing to prove here

    const config = withNodeGraph({});
    const result = config.resolver.resolveRequest(makeContext(xyflowOrigin, []), 'zustand', 'web');
    assert.ok(
      result.filePath.startsWith(nested + path.sep),
      `zustand resolved to ${result.filePath}, not @xyflow/react's own nested copy`,
    );
    const declared = require_(path.join(xyflowRoot, 'package.json')).dependencies.zustand;
    const resolved = require_(path.join(nested, 'package.json')).version;
    assert.ok(
      declared.includes(resolved.split('.')[0]),
      `nested zustand ${resolved} does not satisfy @xyflow/react's ${declared}`,
    );
  });

  it('leaves an explicit ESM request alone rather than lying about what was asked for', () => {
    const seen = [];
    const config = withNodeGraph({});
    const result = config.resolver.resolveRequest(makeContext(xyflowOrigin, seen), 'zustand/esm/index.mjs', 'web');
    assert.deepEqual(result, { type: 'sourceFile', filePath: 'default:zustand/esm/index.mjs' });
  });

  it('does not double-wrap when applied twice', () => {
    const seen = [];
    const original = (_context, moduleName) => ({
      type: 'sourceFile',
      filePath: `original:${moduleName}`,
    });
    const once = withNodeGraph({ resolver: { resolveRequest: original } });
    const wrapped = once.resolver.resolveRequest;
    const twice = withNodeGraph(once);

    assert.equal(twice, once, 'the second application must return the same config');
    assert.equal(twice.resolver.resolveRequest, wrapped, 'the second application must not wrap the resolver again');
    assert.equal(once[nodeGraphMetroMarker], true);
    assert.equal(
      Object.keys(once).includes(String(nodeGraphMetroMarker)),
      false,
      'the marker must not be an enumerable key',
    );
    twice.resolver.resolveRequest(makeContext(xyflowOrigin, seen), 'classcat', 'web');
    assert.deepEqual(seen, []);
  });

  it('warns when unstable_enablePackageExports is false, and warns once', () => {
    const warnings = [];
    const realWarn = console.warn;
    console.warn = (...args) => warnings.push(args.join(' '));
    try {
      const config = withNodeGraph({ resolver: { unstable_enablePackageExports: false } });
      withNodeGraph(config);
    } finally {
      console.warn = realWarn;
    }
    assert.equal(warnings.length, 1, `expected one warning, got ${warnings.length}`);
    assert.match(warnings[0], /unstable_enablePackageExports/);
    assert.match(warnings[0], /node-graph/);
  });

  it('says nothing when unstable_enablePackageExports is true', () => {
    const warnings = [];
    const realWarn = console.warn;
    console.warn = (...args) => warnings.push(args.join(' '));
    try {
      withNodeGraph({ resolver: { unstable_enablePackageExports: true } });
    } finally {
      console.warn = realWarn;
    }
    assert.deepEqual(warnings, []);
  });

  it('wires the package into watchFolders and extraNodeModules without clobbering', () => {
    const config = withNodeGraph({});
    assert.ok(config.watchFolders.includes(packageRoot));
    assert.equal(config.resolver.extraNodeModules['@repo/node-graph'], packageRoot);

    const workspaceRoot = path.resolve(packageRoot, '../..');
    const owned = withNodeGraph({
      watchFolders: [workspaceRoot],
      resolver: { extraNodeModules: { '@repo/node-graph': '/somewhere/else' } },
    });
    assert.deepEqual(owned.watchFolders, [workspaceRoot], 'an ancestor watch folder already covers it');
    assert.equal(
      owned.resolver.extraNodeModules['@repo/node-graph'],
      '/somewhere/else',
      'an app that named the package itself keeps its own answer',
    );
  });
});

describe('nodeGraphResolveRequest', () => {
  it('is exported alone for an app that already owns resolveRequest', () => {
    const seen = [];
    const next = (_context, moduleName) => {
      seen.push(moduleName);
      return { type: 'sourceFile', filePath: `next:${moduleName}` };
    };
    const resolve = nodeGraphResolveRequest(next);
    assert.ok(resolve(makeContext(xyflowOrigin, []), 'zustand', 'web').filePath.endsWith('.js'));
    assert.deepEqual(resolve(makeContext(xyflowOrigin, []), 'classcat', 'web'), {
      type: 'sourceFile',
      filePath: 'next:classcat',
    });
    assert.deepEqual(seen, ['classcat']);
  });
});

describe('apps/storybook-expo wiring', () => {
  const configPath = path.resolve(packageRoot, '../../apps/storybook-expo/metro.config.js');

  it('applies withNodeGraph before withStorybook', () => {
    const src = fs.readFileSync(configPath, 'utf-8');
    assert.match(src, /require\("@multiplatform\.one\/node-graph\/metro"\)/);
    const graphAt = src.indexOf('withNodeGraph(');
    const storybookAt = src.lastIndexOf('withStorybook(');
    assert.ok(graphAt !== -1, 'metro.config.js never calls withNodeGraph');
    assert.ok(
      graphAt > storybookAt || src.includes('withStorybook(withNodeGraph('),
      'withNodeGraph must wrap the config BEFORE withStorybook sees it',
    );
  });
});
