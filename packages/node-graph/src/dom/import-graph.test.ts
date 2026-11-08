/**
 * The DOM subtree's import boundary (design §9.4 layer 2, MPO-211 task 2.2).
 *
 * `import.meta` in a dependency is a PARSE error in the classic script a DOM
 * component's WebView runs, so the script never executes, so no error boundary
 * is reachable, so the canvas is a blank rectangle. The static ban in
 * `scripts/verify-no-import-meta.mjs` catches the token; this catches the
 * REACH — the canvas must not be able to arrive at `frappe-ui`, `frappe`,
 * `utils`, `components` or anything else outside the allowed nine in the first
 * place. Native chrome lives on the Hermes side and may use `components`
 * freely; only the canvas is constrained.
 */

import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const here = import.meta.dirname;
const srcRoot = path.resolve(here, '..');
const packageRoot = path.resolve(srcRoot, '..');

/**
 * design §9.4 layer 2. `@tamagui/*` is a prefix; everything else is exact.
 *
 * `expo` is the TENTH, and it was not in the design's list because the design
 * wrote that list before the entry existed. `node-graph-dom.ts` imports
 * `useDOMImperativeHandle` from `expo/dom`, which is what makes the six
 * imperative methods of §9.1 reachable from the native side at all. It cannot
 * be dynamic — the hook has to run in the component body — and it cannot be
 * dropped without dropping `fitView`/`relayout`/`zoomTo`/`centerOn`/
 * `setSelection`/`exportViewport`. It is also the one external here that the
 * DOM bundler itself provides rather than bundling, so it carries none of the
 * reach this boundary exists to refuse. Widened deliberately, once, with the
 * design amended to match; anything else still fails.
 *
 * `@xyflow/system` is the ELEVENTH, widened for task 3.4. It is not a new
 * library in the bundle: `@xyflow/react` imports it internally, pins it
 * exactly, and cannot run without it, so it was already inside every DOM
 * bundle this boundary has ever passed. What changed is that `xy.ts` now names
 * it, because `getHandlePosition` — the function that turns a handle's measured
 * box into the point an edge is drawn to, and therefore the whole subject of
 * design §7.1 H2 — is not re-exported by `@xyflow/react`. EXACT and not a
 * `@xyflow/` prefix: react and system are the two halves of one library, and a
 * prefix would silently admit whatever else that scope publishes next.
 */
const allowedExact = new Set([
  '@dagrejs/dagre',
  '@repo/platform',
  '@repo/theme',
  '@xyflow/react',
  '@xyflow/system',
  'expo',
  'react',
  'react-dom',
  'tamagui',
  'zustand',
]);
const allowedPrefixes = ['@tamagui/'];

/** @returns the package specifier an external import belongs to, e.g. `@tamagui/web`. */
const packageOf = (specifier: string): string => {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
};

const isAllowed = (specifier: string): boolean => {
  const pkg = packageOf(specifier);
  if (allowedExact.has(pkg)) {
    return true;
  }
  return allowedPrefixes.some((prefix) => pkg.startsWith(prefix));
};

const importRe =
  // oxlint-disable-next-line sonarjs/super-linear-regex -- test-only scan of this package's own small source files
  /(?:^|\n)\s*(?:import|export)\s[^;]*?from\s*["'](?<from>[^"']+)["']|(?:^|\n)\s*import\s*["'](?<bare>[^"']+)["']/gu;

/** `await import("./x")` and `import("./x")`. Bare specifier only, no expressions. */
const dynamicImportRe = /\bimport\s*\(\s*["'](?<specifier>[^"']+)["']\s*\)/gu;

/**
 * Every specifier that puts a module in the DOM BUNDLE — static and dynamic
 * alike.
 *
 * The dynamic ones are not optional here, and reading them as optional is how
 * this spec passed while guarding almost nothing. `node-graph-dom.ts` reaches the
 * entire canvas through one `await import("./NodeGraphDomInner")` (design §9.4
 * layer 3), so a static-only walk visited 12 model and wire modules and never
 * saw `NodeGraphDomInner`, `NodeGraphWeb`, `xy.ts` or anything they pull. The
 * tree this boundary exists to constrain was the exact tree it could not see.
 *
 * Layer 3's dynamic import buys CATCHABILITY — a module-eval throw becomes a
 * reportable `lastError.phase === "module"` instead of a fatal — and nothing
 * else. Under Metro it compiles to a `require`, so the module is in the bundle
 * either way, and an `import.meta` inside it is still a parse error that blanks
 * the WebView before any boundary runs. Bundling is what this walk models, so
 * bundling is what it must follow.
 */
const staticImports = (source: string): string[] => {
  const found: string[] = [];
  for (const match of source.matchAll(importRe)) {
    const specifier = match.groups?.from ?? match.groups?.bare;
    if (specifier !== undefined) {
      found.push(specifier);
    }
  }
  for (const match of source.matchAll(dynamicImportRe)) {
    const specifier = match.groups?.specifier;
    if (specifier !== undefined) {
      found.push(specifier);
    }
  }
  return found;
};

const extensions = ['.ts', '.tsx', '.native.ts', '.native.tsx', '.js', '.jsx'];

const resolveRelative = (fromFile: string, specifier: string): string | null => {
  const base = path.resolve(path.dirname(fromFile), specifier);
  for (const candidate of [
    base,
    ...extensions.map((ext) => `${base}${ext}`),
    ...extensions.map((ext) => path.join(base, `index${ext}`)),
  ]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return null;
};

interface Walk {
  readonly externals: Map<string, string[]>;
  readonly visited: string[];
  readonly unresolved: string[];
}

/** Walks static imports transitively from `roots`, staying inside `src/`. */
const walk = (roots: readonly string[]): Walk => {
  const externals = new Map<string, string[]>();
  const visited: string[] = [];
  const unresolved: string[] = [];
  const queue = [...roots];
  const seen = new Set<string>(roots);
  while (queue.length > 0) {
    const file = queue.pop()!;
    visited.push(file);
    const source = fs.readFileSync(file, 'utf-8');
    for (const specifier of staticImports(source)) {
      if (specifier.startsWith('.')) {
        const resolved = resolveRelative(file, specifier);
        if (resolved === null) {
          unresolved.push(`${path.relative(packageRoot, file)} -> ${specifier}`);
        } else if (!seen.has(resolved)) {
          seen.add(resolved);
          queue.push(resolved);
        }
      } else {
        // A node: builtin inside the DOM subtree cannot run in a WebView at all,
        // so it is a harder failure than a disallowed package, not a softer one;
        // it is keyed by its full specifier rather than folded into a package.
        const key = specifier.startsWith('node:') ? specifier : packageOf(specifier);
        const users = externals.get(key) ?? [];
        users.push(path.relative(packageRoot, file));
        externals.set(key, users);
      }
    }
  }
  return { externals, visited, unresolved };
};

const filesUnder = (dir: string): string[] => {
  if (!fs.existsSync(dir)) {
    return [];
  }
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...filesUnder(full));
    } else if (/\.(?:tsx?|jsx?)$/u.test(entry.name) && !/\.(?:spec|test|stories)\./u.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
};

/** The entry `package.json` promises on every condition, per design §3.1. */
const domEntry = (): string => {
  const pkg = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf-8'));
  const target = pkg.exports?.['./dom'];
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- an exports entry is a string or a conditions object
  const declared = typeof target === 'string' ? target : target?.source;
  return path.resolve(packageRoot, declared ?? './src/dom/node-graph-dom.ts');
};

describe("the DOM subtree's import boundary", () => {
  it('keeps every external inside the allowed eleven of design 9.4', (ctx) => {
    const entry = domEntry();
    const roots = fs.existsSync(entry) ? [entry] : filesUnder(path.join(srcRoot, 'dom'));
    if (roots.length === 0) {
      ctx.skip(
        `nothing to walk yet: ${path.relative(packageRoot, entry)} lands in task 2.4 and src/dom holds no other module. This turns itself on the moment it does.`,
      );
      return;
    }
    const { externals, visited, unresolved } = walk(roots);
    expect(unresolved, 'every relative import inside src/ must resolve').toStrictEqual([]);
    // The walk has to ARRIVE at the canvas, or the rest of this test is theatre.
    // These three sit behind the entry's dynamic import; a static-only walk
    // reaches none of them and still reports green.
    const relative = visited.map((file) => path.relative(packageRoot, file));
    for (const required of [
      // The shell is the entry's only import, and the canvas hangs off it. If
      // the walk stopped at the directive it would guard one `createElement`.
      'src/dom/node-graph-dom-shell.ts',
      'src/dom/NodeGraphDomInner.tsx',
      'src/react-flow/NodeGraphWeb.tsx',
      'src/react-flow/xy.ts',
    ]) {
      expect(relative, `the walk must reach ${required}`).toContain(required);
    }
    const refused = [...externals.entries()].filter(([specifier]) => !isAllowed(specifier));
    expect(
      refused.map(([specifier, users]) => `${specifier} (from ${users.join(', ')})`),
      'only @repo/theme, @repo/platform, tamagui, @tamagui/*, @xyflow/react, @xyflow/system, react, react-dom, @dagrejs/dagre, zustand and expo/dom may be reached from the DOM entry',
    ).toStrictEqual([]);
  });

  it('refuses a reach into @repo/frappe-ui', () => {
    // The falsification, run as a spec instead of by hand, so it cannot rot:
    // the walker is pointed at a real module that reaches frappe-ui.
    expect(isAllowed('@repo/frappe-ui')).toBe(false);
    expect(isAllowed('@repo/frappe-ui/dist/x')).toBe(false);
    for (const refused of [
      '@repo/ui',
      '@repo/forms',
      '@repo/frappe',
      '@repo/backoffice',
      '@repo/rich-text',
      '@repo/utils',
    ]) {
      expect(isAllowed(refused), `${refused} must be refused`).toBe(false);
    }
  });

  it('allows exactly the eleven, and @tamagui by prefix', () => {
    for (const allowed of [
      '@repo/theme',
      '@repo/platform',
      'tamagui',
      '@tamagui/web',
      '@tamagui/core',
      '@xyflow/react',
      '@xyflow/system',
      'react',
      'react-dom',
      'react/jsx-runtime',
      '@dagrejs/dagre',
      'zustand',
      'zustand/middleware',
      'expo/dom',
    ]) {
      expect(isAllowed(allowed), `${allowed} must be allowed`).toBe(true);
    }
    // The widening is `expo` and nothing near it. A sibling Expo package that
    // WOULD pull real code into the bundle stays refused.
    for (const refused of ['expo-haptics', 'expo-font', 'expo-asset', 'expo-router']) {
      expect(isAllowed(refused), `${refused} must be refused`).toBe(false);
    }
    // `@xyflow/system` is EXACT, not a prefix widening. Whatever that scope
    // publishes next does not ride in on it.
    for (const refused of ['@xyflow/svelte', '@xyflow/minimap']) {
      expect(isAllowed(refused), `${refused} must be refused`).toBe(false);
    }
  });

  it('walks transitively, not one level', () => {
    // Proven on the package's own tree: src/index.ts reaches @xyflow/react only
    // through src/react-flow/xy.ts, so a one-level walk would miss it.
    const { externals, visited } = walk([path.join(srcRoot, 'index.ts')]);
    expect(visited.length).toBeGreaterThan(3);
    expect(externals.has('@xyflow/react')).toBe(true);
    expect(
      staticImports(fs.readFileSync(path.join(srcRoot, 'index.ts'), 'utf-8')).some((s) => s.startsWith('@xyflow')),
      'src/index.ts must not import @xyflow directly, or this proves nothing',
    ).toBe(false);
  });
});
