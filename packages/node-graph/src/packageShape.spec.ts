/**
 * The package's own shape is load-bearing, so it is specced like code.
 *
 * Three of these four assertions are about a resolver nobody can see failing
 * until a bundle breaks: Metro picks the FIRST condition it recognises and
 * never reconsiders `source` or `default` (MPO-185), and `./dom` has to stay
 * pinned to source on every condition because storybook-expo's
 * `resolveWorkspaceNativeMain` prefers `dist/esm/index.native.js` whenever it
 * exists and a compiled copy would shadow the `'use dom'` directive.
 */

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

const packageRoot = path.resolve(import.meta.dirname, '..');

/** What Metro's file-based fallback accepts at `<pkg>/<subpath>` (lint.mjs:873). */
const metroFallbackExtensions = ['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs'];

/**
 * The condition names Metro matches per platform when
 * `resolver.unstable_enablePackageExports` is on (lint.mjs:868). Neither
 * `source` nor `types` is ever in the set.
 */
const metroPlatformConditions = {
  ios: new Set(['react-native', 'import', 'require', 'default']),
  web: new Set(['browser', 'import', 'require', 'default']),
};

type ExportTarget = string | { [condition: string]: ExportTarget } | ExportTarget[];

interface PackageJson {
  readonly dependencies?: Record<string, string>;
  readonly devDependencies?: Record<string, string>;
  readonly exports: Record<string, ExportTarget>;
  readonly peerDependencies?: Record<string, string>;
}

let pkg: PackageJson;

beforeAll(async () => {
  pkg = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf-8')) as PackageJson;
});

/** Every leaf string in an exports entry, whatever the condition nesting. */
function targetLeaves(target: ExportTarget): string[] {
  if (typeof target === 'string') {
    return [target];
  }
  if (Array.isArray(target)) {
    return target.flatMap(targetLeaves);
  }
  return Object.values(target).flatMap(targetLeaves);
}

function declaresSourceCondition(target: ExportTarget): boolean {
  if (typeof target === 'string') {
    return false;
  }
  if (Array.isArray(target)) {
    return target.some(declaresSourceCondition);
  }
  return Object.entries(target).some(([condition, value]) => condition === 'source' || declaresSourceCondition(value));
}

/** The first target Metro would pick for one condition set, in declaration order. */
function metroExportTarget(target: ExportTarget, conditions: Set<string>): string | null {
  if (typeof target === 'string') {
    return target;
  }
  if (Array.isArray(target)) {
    for (const item of target) {
      const hit = metroExportTarget(item, conditions);
      if (hit) {
        return hit;
      }
    }
    return null;
  }
  for (const [condition, value] of Object.entries(target)) {
    if (!conditions.has(condition)) {
      continue;
    }
    const hit = metroExportTarget(value, conditions);
    if (hit) {
      return hit;
    }
  }
  return null;
}

function hasMetroFallback(subpath: string): boolean {
  const base = path.join(packageRoot, subpath.replace(/^\.\//, ''));
  if (metroFallbackExtensions.some((ext) => existsSync(`${base}.${ext}`))) {
    return true;
  }
  if (existsSync(path.join(base, 'package.json'))) {
    return true;
  }
  return metroFallbackExtensions.some((ext) => existsSync(path.join(base, `index.${ext}`)));
}

describe('package shape', () => {
  it('exports["."] declares a source condition', () => {
    expect(declaresSourceCondition(pkg.exports['.'])).toBe(true);
  });

  it('declares the model, dom, dom-inner, demo and metro subpaths', () => {
    expect(Object.keys(pkg.exports)).toEqual(
      expect.arrayContaining(['./model', './dom', './dom-inner', './demo', './metro']),
    );
  });

  /**
   * `./dom-inner` is what an APP's `'use dom'` entry imports (design §9.3), so
   * it lives under the same pin as `./dom`: every runtime condition on source.
   */
  /**
   * `./demo` is pinned to source too, and for a reason neither of the others
   * has: it must be the SAME MODULE INSTANCE the canvas's inner tree imports.
   * An app's `'use dom'` entry supplies the schema by value, and a schema built
   * from `dist/` would carry a second copy of `GraphNode` and `GraphPort` —
   * Tamagui `styled()` components from a different build, rendering inside a
   * provider from this one. One bundle, two node implementations.
   */
  it('resolves ./dom, ./dom-inner and ./demo to a path under src/ on every condition', () => {
    for (const subpath of ['./dom', './dom-inner', './demo']) {
      const leaves = targetLeaves(pkg.exports[subpath]);
      expect(leaves.length, subpath).toBeGreaterThan(0);
      for (const leaf of leaves) {
        // `types` may point at the emitted declaration; every runtime condition
        // must stay on source, or the "use dom" directive has to survive esbuild
        // and nobody has proven it does.
        if (leaf.startsWith('./types/')) {
          continue;
        }
        expect(leaf, subpath).toMatch(/^\.\/src\//);
      }
    }
  });

  it('keeps @repo/ui an optional peer, never a dependency', () => {
    expect(pkg.peerDependencies?.['@repo/ui']).toBeDefined();
    expect(pkg.dependencies?.['@repo/ui']).toBeUndefined();
    expect(pkg.devDependencies?.['@repo/ui']).toBeUndefined();
  });

  it('gives every dist-resolving subpath a Metro file fallback', () => {
    const missing: string[] = [];
    for (const [subpath, target] of Object.entries(pkg.exports)) {
      if (subpath === '.' || !subpath.startsWith('./') || subpath.includes('*')) {
        continue;
      }
      if (hasMetroFallback(subpath)) {
        continue;
      }
      for (const [platform, conditions] of Object.entries(metroPlatformConditions)) {
        const resolved = metroExportTarget(target, conditions);
        if (!resolved?.startsWith('./dist/')) {
          continue;
        }
        missing.push(`"${subpath}" resolves to ${resolved} on ${platform}, which is never built`);
        break;
      }
    }
    expect(missing).toEqual([]);
  });
});
