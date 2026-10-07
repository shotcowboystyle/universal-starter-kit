/**
 * Build-shape invariants for the DOM entry.
 *
 * Every assertion here is a regex or a filesystem read, never a render, and
 * that is deliberate: what this file protects cannot fail at runtime in a way
 * anyone can see. `import.meta` in a dependency is a PARSE error in a classic
 * script, so the script never runs, so no error boundary is reachable, and the
 * WebView is a blank rectangle with no console. By the time a test could
 * observe it, it is too late.
 *
 * So the entry's shape is asserted as text:
 *
 *  - `'use dom'` is the FIRST statement, because Metro reads the directive
 *    positionally and a comment-first file still works while an import-first
 *    one silently becomes an ordinary module.
 *  - Its top-level imports are `react` and `expo/dom` and nothing else. Design
 *    9.4 layer 3 puts it plainly: no top-level import of anything that can
 *    throw. `@repo/*` and `@xyflow/*` are named because they are
 *    the ones that reach `import.meta` transitively today.
 *  - `./dom` resolves to this exact source file on every runtime condition, and
 *    the build excludes it, because storybook-expo's
 *    `resolveWorkspaceNativeMain` prefers a compiled `dist/esm/index.native.js`
 *    whenever one exists and a compiled twin would mean the `'use dom'`
 *    directive had to survive esbuild. Nobody has proven it does.
 */

import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import { graphCommandNames } from '../react-flow/graphHandle';

import { bootGlobalKey, graphReadySettleMs } from './boot';

const domDir = import.meta.dirname;
const srcDir = path.resolve(domDir, '..');
const packageRoot = path.resolve(srcDir, '..');
const entryPath = path.join(domDir, 'NodeGraphDom.ts');
const shellPath = path.join(domDir, 'NodeGraphDomShell.ts');

let entrySource: string;
let shellSource: string;
let nativeHostSource: string;
let pkg: {
  readonly exports: Record<string, unknown>;
  readonly scripts: Record<string, string>;
};

beforeAll(async () => {
  entrySource = await readFile(entryPath, 'utf-8');
  shellSource = await readFile(shellPath, 'utf-8');
  nativeHostSource = await readFile(path.join(srcDir, 'native/NodeGraph.native.tsx'), 'utf-8');
  pkg = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf-8'));
});

/** Every `from "…"` on a line that is not `import type`. Type imports are erased. */
function runtimeImportSpecifiers(source: string): string[] {
  const out: string[] = [];
  const pattern = /^\s*import\s+(?!type\b)[\s\S]*?from\s+["']([^"']+)["']/gm;
  for (const match of source.matchAll(pattern)) {
    out.push(match[1]);
  }
  const bare = /^\s*import\s+["']([^"']+)["']/gm;
  for (const match of source.matchAll(bare)) {
    out.push(match[1]);
  }
  return out;
}

/**
 * Every specifier that survives to runtime: a value import, a bare side-effect
 * import, AND a re-export. `export { X } from "./y"` is a real edge — it is how
 * `index.native.ts` reaches the DOM entry — and leaving it out was how the
 * reachability check below first reported a clean graph that was not clean.
 */
function runtimeEdgeSpecifiers(source: string): string[] {
  const out = runtimeImportSpecifiers(source);
  const reexport = /^\s*export\s+(?!type\b)[\s\S]*?from\s+["']([^"']+)["']/gm;
  for (const match of source.matchAll(reexport)) {
    out.push(match[1]);
  }
  return out;
}

/** What Metro and tsgo would resolve a relative specifier to, inside this package. */
function resolveRelative(from: string, specifier: string): string | null {
  const base = path.resolve(path.dirname(from), specifier);
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
  ]) {
    if (/\.tsx?$/.test(candidate) && existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await sourceFiles(full)));
      continue;
    }
    if (/\.tsx?$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

describe('NodeGraphDom.ts', () => {
  it('is a .ts file, never a .tsx', () => {
    // The automatic JSX runtime injects a top-level
    // `import { jsx } from "react/jsx-runtime"`, so "no top-level import" is
    // not achievable in a .tsx. The entry uses `createElement` instead.
    expect(existsSync(entryPath)).toBe(true);
    expect(existsSync(path.join(domDir, 'NodeGraphDom.tsx'))).toBe(false);
  });

  it("carries 'use dom' as its first statement", () => {
    const withoutLeadingComments = entrySource
      .replace(/^﻿/, '')
      .replace(/^(?:\s*(?:\/\/[^\n]*|\/\*[\s\S]*?\*\/)\s*)*/, '');
    expect(withoutLeadingComments).toMatch(/^["']use dom["'];/);
  });

  it('has no top-level import of a @repo/* or @xyflow/* module', () => {
    // The named half of the ban: these are the packages that reach
    // `import.meta` transitively today (design 9.4 layer 1). It holds across
    // BOTH files, because the entry now reaches the canvas through the shell
    // and a ban that stopped at the directive would guard one import statement.
    for (const source of [entrySource, shellSource]) {
      expect(source).not.toMatch(/^\s*import\s+(?!type\b)[\s\S]*?["']@multiplatform\.one\//m);
      expect(source).not.toMatch(/^\s*import\s+(?!type\b)[\s\S]*?["']@xyflow\//m);
    }
  });

  it('imports react and the shell at the top level, and nothing else', () => {
    // The strict half. A new top-level import here is a decision, and it should
    // cost a line in this spec rather than pass unnoticed.
    expect(runtimeImportSpecifiers(entrySource).sort()).toEqual(['./NodeGraphDomShell', 'react']);
  });

  it('renders the shell rather than reimplementing it', () => {
    // Design 9.3: an app's entry is this file with two more imports. If the
    // package's own reference entry grew a body, the thing an app copies would
    // stop being the thing the package tests.
    expect(entrySource).toMatch(/createElement\(\s*NodeGraphDomShell/);
  });
});

describe('NodeGraphDomShell.ts', () => {
  it('is a .ts file, never a .tsx', () => {
    expect(existsSync(shellPath)).toBe(true);
    expect(existsSync(path.join(domDir, 'NodeGraphDomShell.tsx'))).toBe(false);
  });

  it("does NOT carry the 'use dom' directive", () => {
    // The directive belongs to the app's file. A second one here would root a
    // second DOM bundle inside the first, which is not a thing Metro can do.
    //
    // Asserted positionally, exactly as the entry's own directive is: the
    // string appears half a dozen times in this file's prose, and a bare
    // substring search would forbid explaining the mechanism.
    const withoutLeadingComments = shellSource
      .replace(/^\uFEFF/, '')
      .replace(/^(?:\s*(?:\/\/[^\n]*|\/\*[\s\S]*?\*\/)\s*)*/, '');
    expect(withoutLeadingComments).not.toMatch(/^["']use dom["'];/);
  });

  it('imports react and expo/dom at the top level, and nothing else', () => {
    expect(runtimeImportSpecifiers(shellSource).sort()).toEqual(['expo/dom', 'react']);
  });

  it('stamps the same boot global `boot.ts` reads', () => {
    // It cannot import `boot.ts` — that would be a top-level import of ours —
    // so the key is written twice, and this is what stops the two drifting.
    expect(shellSource).toContain(bootGlobalKey);
    expect(shellSource).toMatch(/stage:\s*["']script["']/);
  });

  it('dynamic-imports NodeGraphDomInner inside a try/catch', () => {
    expect(shellSource).toMatch(/import\(\s*["']\.\/NodeGraphDomInner["']\s*\)/);
    const dynamicImportIndex = shellSource.indexOf('import("./NodeGraphDomInner")');
    const tryIndex = shellSource.lastIndexOf('try {', dynamicImportIndex);
    const catchIndex = shellSource.indexOf('catch', dynamicImportIndex);
    expect(tryIndex).toBeGreaterThan(-1);
    expect(catchIndex).toBeGreaterThan(dynamicImportIndex);
  });

  it("takes the config and the schema an app's entry supplies", () => {
    // The whole amendment in two prop names. Both are live objects, so neither
    // can be JSON and neither can cross the bridge; the only module that can
    // hold them is the app's own `'use dom'` file.
    expect(shellSource).toMatch(/readonly config\?: TamaguiInternalConfig;/);
    expect(shellSource).toMatch(/readonly schema\?: GraphSchema<N, E>;/);
  });
});

describe('NodeGraphDom.ts, continued', () => {
  /**
   * Design 9.1 says this is the only file in the package with a default export.
   * Measured, that is true of every SHIPPED file and false of the stories: a
   * CSF module's meta IS its default export, Storybook requires it, and all
   * four story files are excluded from the build by the same `--exclude`
   * pattern that excludes this entry. So the invariant that actually matters —
   * only one default export can reach `dist` or a Metro bundle — is asserted
   * with stories set aside, and the design's sentence is the one that needs the
   * qualifier.
   */
  it('is the only default export outside the stories', async () => {
    const files = await sourceFiles(srcDir);
    const withDefault: string[] = [];
    for (const file of files) {
      if (file.endsWith('.stories.tsx')) {
        continue;
      }
      const source = await readFile(file, 'utf-8');
      if (/^\s*export\s+default\b/m.test(source)) {
        withDefault.push(path.relative(srcDir, file));
      }
    }
    expect(withDefault).toEqual(['dom/NodeGraphDom.ts']);
  });
});

describe('package.json exports["./dom"]', () => {
  function leaves(target: unknown): string[] {
    if (typeof target === 'string') {
      return [target];
    }
    if (Array.isArray(target)) {
      return target.flatMap(leaves);
    }
    if (target && typeof target === 'object') {
      return Object.values(target).flatMap(leaves);
    }
    return [];
  }

  it('resolves to src/dom/NodeGraphDom.ts on every runtime condition', () => {
    const all = leaves(pkg.exports['./dom']);
    expect(all.length).toBeGreaterThan(0);
    const runtime = all.filter((leaf) => !leaf.startsWith('./types/'));
    expect(new Set(runtime)).toEqual(new Set(['./src/dom/NodeGraphDom.ts']));
    for (const leaf of runtime) {
      expect(existsSync(path.join(packageRoot, leaf))).toBe(true);
    }
  });

  it('declares source, react-native and default, the three Metro can pick', () => {
    expect(Object.keys(pkg.exports['./dom'] as object)).toEqual(
      expect.arrayContaining(['source', 'react-native', 'default']),
    );
  });
});

describe('package.json exports["./dom-inner"]', () => {
  function leaves(target: unknown): string[] {
    if (typeof target === 'string') {
      return [target];
    }
    if (Array.isArray(target)) {
      return target.flatMap(leaves);
    }
    if (target && typeof target === 'object') {
      return Object.values(target).flatMap(leaves);
    }
    return [];
  }

  /**
   * Pinned to source for the same reason `./dom` is, and for one more: the file
   * on the other side is imported BY a `'use dom'` module, so a compiled copy
   * would have to survive the DOM transform's own boundary handling. Source is
   * the only leaf anyone has proven.
   */
  it('resolves to src/dom/NodeGraphDomShell.ts on every runtime condition', () => {
    const all = leaves(pkg.exports['./dom-inner']);
    expect(all.length).toBeGreaterThan(0);
    const runtime = all.filter((leaf) => !leaf.startsWith('./types/'));
    expect(new Set(runtime)).toEqual(new Set(['./src/dom/NodeGraphDomShell.ts']));
    for (const leaf of runtime) {
      expect(existsSync(path.join(packageRoot, leaf))).toBe(true);
    }
  });

  /**
   * Metro warns and retries `<pkg>/dom-inner.*` when the condition it picked is
   * missing, and does NOT reconsider `source` or `default` (MPO-185). `model.ts`
   * is the same file for `./model`; this one matters more, because what is on
   * the other side is what an app's DOM entry imports and a failed resolution
   * there is a blank WebView.
   */
  it('has the Metro file fallback at the package root', () => {
    expect(existsSync(path.join(packageRoot, 'dom-inner.ts'))).toBe(true);
  });
});

describe('package.json exports["."]', () => {
  /**
   * The native half is pinned to source for the same reason `./dom` is, one
   * step out.
   *
   * `native/NodeGraph.native.tsx` RENDERS the DOM component, so it imports the
   * entry — and the entry is excluded from the build, so a compiled native
   * barrel would ship `import "../dom/NodeGraphDom"` pointing at a file that
   * was never emitted. The design pinned `./dom` and left `.`'s `react-native`
   * condition on `./dist/esm/index.native.js`; that combination cannot both
   * hold. Source wins, because it is the half that carries `'use dom'`.
   *
   * The `types` condition moves with it: it pointed at `./types/index.d.ts`,
   * which is the WEB barrel's declarations, so a native consumer was being
   * offered `NodeGraphWeb` and `useGraphController` — neither of which can run
   * on the Hermes side.
   *
   * There is a second reason, measured while making the first one true.
   * `tamagui-build` emits a `<name>.native.js` PLATFORM TWIN of every module it
   * compiles, so `src/index.ts` produces `dist/esm/index.native.js` — the same
   * path `src/index.native.ts` would compile to. The two collided, and whichever
   * was written last won. `dist/esm/index.native.js` is therefore the compiled
   * WEB barrel wearing a native filename, and pointing the `react-native`
   * condition at it hands a native consumer the React Flow canvas.
   */
  it('resolves the react-native condition to the native source barrel', () => {
    const dot = pkg.exports['.'] as Record<string, unknown>;
    expect(dot['react-native']).toEqual({
      types: './types/index.native.d.ts',
      default: './src/index.native.ts',
    });
  });

  it('keeps the web conditions on dist', () => {
    const dot = pkg.exports['.'] as Record<string, string>;
    expect(dot.import).toBe('./dist/esm/index.mjs');
    expect(dot.require).toBe('./dist/cjs/index.cjs');
  });
});

describe('the build --exclude pattern', () => {
  /** The regex the build script hands `tamagui-build`, read out of package.json. */
  function excludePattern(): RegExp {
    const match = /--exclude\s+'([^']+)'/.exec(pkg.scripts.build);
    expect(match, `no --exclude in build script: ${pkg.scripts.build}`).not.toBeNull();
    return new RegExp(match![1]);
  }

  it('keeps the DOM entry out of dist', () => {
    expect(excludePattern().test('src/dom/NodeGraphDom.ts')).toBe(true);
  });

  /**
   * The same pattern also matches `NodeGraphDomInner`, and that is correct
   * rather than a slip: `./dom` is pinned to source on every condition, so the
   * entry is loaded from `src/` and its relative `import("./NodeGraphDomInner")`
   * resolves from `src/` too. Nothing in `dist` references the inner tree, and a
   * compiled twin of it could only shadow the source one.
   */
  it('keeps the inner tree out of dist with it', () => {
    expect(excludePattern().test('src/dom/NodeGraphDomInner.tsx')).toBe(true);
  });

  /**
   * And the shell, for the same reason one step out: it holds the dynamic
   * `import("./NodeGraphDomInner")`, so a compiled shell in `dist` would open a
   * relative path to a module the build never emitted.
   */
  it('keeps the shell out of dist with it', () => {
    expect(excludePattern().test('src/dom/NodeGraphDomShell.ts')).toBe(true);
  });

  /** Neither is platform-specific and neither reaches the entry, so both compile. */
  it('still builds the wire and the boot record', () => {
    expect(excludePattern().test('src/dom/wire.ts')).toBe(false);
    expect(excludePattern().test('src/dom/boot.ts')).toBe(false);
  });

  it('excludes specs and stories', () => {
    const pattern = excludePattern();
    expect(pattern.test('src/dom/domEntry.spec.ts')).toBe(true);
    expect(pattern.test('src/nodes/GraphNode.stories.tsx')).toBe(true);
    expect(pattern.test('src/nodes/GraphNode.tsx')).toBe(false);
  });

  /**
   * The one that is easy to get wrong, and did get written wrong first.
   *
   * Excluding the entry from `dist` is only half the job: anything that
   * IMPORTS it has to be excluded too, or the build emits a module whose
   * relative `import "../dom/NodeGraphDom"` points at a file that was never
   * written. Metro fails that resolution at bundle time with a message about a
   * missing module, several layers away from the exclusion that caused it.
   *
   * So the rule is stated as a graph: every source file that can reach the
   * entry is excluded from the build. Adding a native file that renders the
   * DOM component and forgetting the pattern fails HERE, not in a bundler log.
   */
  it('excludes everything that can reach the DOM entry', async () => {
    const files = await sourceFiles(srcDir);
    const importers = new Map<string, string[]>();
    for (const file of files) {
      const source = await readFile(file, 'utf-8');
      const targets: string[] = [];
      for (const specifier of runtimeEdgeSpecifiers(source)) {
        if (!specifier.startsWith('.')) {
          continue;
        }
        const resolved = resolveRelative(file, specifier);
        if (resolved) {
          targets.push(resolved);
        }
      }
      // The dynamic import is an edge too: it is how the entry reaches the
      // inner tree, and how the inner tree ends up in the same fate.
      for (const match of source.matchAll(/import\(\s*["'](\.[^"']+)["']\s*\)/g)) {
        const resolved = resolveRelative(file, match[1]);
        if (resolved) {
          targets.push(resolved);
        }
      }
      importers.set(file, targets);
    }

    const reaches = new Set<string>([entryPath]);
    for (let changed = true; changed;) {
      changed = false;
      for (const [file, targets] of importers) {
        if (reaches.has(file)) {
          continue;
        }
        if (!targets.some((target) => reaches.has(target))) {
          continue;
        }
        reaches.add(file);
        changed = true;
      }
    }

    const pattern = excludePattern();
    const leaked = [...reaches]
      .map((file) => path.relative(packageRoot, file))
      .filter((relative) => !pattern.test(relative))
      .sort();
    expect(leaked).toEqual([]);
  });
});

describe('the native host', () => {
  it("keeps its watchdog clear of the canvas's own settle grace", () => {
    // Asserted as text because importing the host pulls in react-native, which
    // does not resolve under happy-dom.
    //
    // The assertion is a RELATION, not design 9.4's literal 4000 any more.
    // 4000 was never measured, and on emulator-5590 rebooted fresh it fired on
    // a canvas that rendered on the first Retry (MPO-211). What actually has to
    // hold is that the watchdog cannot undercut the time the canvas spends
    // deliberately waiting for its own diagnostics to settle — a watchdog
    // inside that window would declare a healthy canvas dead while it was
    // filling in its own panel, which is a worse version of the bug it
    // replaces. Two settle graces is the margin, so the boot itself has at
    // least one grace of room on top.
    const match = /readyTimeoutMs\s*=\s*(\d+)/.exec(nativeHostSource);
    expect(match, 'the native host no longer declares readyTimeoutMs').not.toBeNull();
    const timeout = Number(match?.[1]);
    expect(timeout).toBeGreaterThan(graphReadySettleMs * 2);
  });

  it('renders GraphFallback when the watchdog fires', () => {
    expect(nativeHostSource).toContain('GraphFallback');
    expect(nativeHostSource).toMatch(/no-ready/);
  });

  it('draws a fallback rather than a WebView when no DOM entry was supplied', () => {
    // Design 9.3. A host with no entry has nothing to wait for: the canvas
    // would boot, find no config and say so four seconds later, so the refusal
    // happens before a WebView exists and reads as its own reason.
    expect(nativeHostSource).toMatch(/no-dom-entry/);
    expect(nativeHostSource).toMatch(/domEntry/);
    expect(nativeHostSource).toMatch(/getNodeGraphDomEntry/);
  });

  /**
   * EVERY command, not design §9.1's original six.
   *
   * The shell forwards each one by hand across `useDOMImperativeHandle`, and a
   * forgotten one is a button that silently does nothing on a phone with no
   * console to find it in. `graphCommandNames` is the compile-time-exhaustive
   * tuple; this is the runtime half, because the forwarder's own cast to
   * `DOMImperativeFactory` is where the type checking stops.
   */
  it('forwards every command in graphCommandNames', () => {
    for (const command of graphCommandNames) {
      expect(shellSource, `useDOMImperativeHandle is missing ${command}`).toMatch(new RegExp(`\\b${command}:\\s*\\(`));
    }
    expect(shellSource).toContain('useDOMImperativeHandle');
  });

  /**
   * Milestone 6 added five commands and could have added them by looping over
   * `graphCommandNames` at runtime. It does not, because that would be a
   * top-level import of ours into the one file design §9.4 layer 3 forbids
   * them in — and the spec above would then be checking the tuple against
   * itself.
   */
  it('keeps the tuple OUT of the shell, so the import list stays at two', () => {
    expect(runtimeImportSpecifiers(shellSource).sort()).toEqual(['expo/dom', 'react']);
  });
});
