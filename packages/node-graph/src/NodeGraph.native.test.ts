/**
 * The native twin's build-shape invariants (MPO-211 task 2.7).
 *
 * These are regex and filesystem assertions rather than renders, for the same
 * reason `dom-entry.test.ts` gives: the failures they guard against have no
 * observable runtime. React Flow reaching the Hermes side is a module-eval
 * throw on a phone with no console; the demo fixtures reaching the DOM entry
 * chunk is 60 KB nobody notices until they measure. Neither shows up in a
 * render test, and both are one import away at any time.
 */

import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { demoGraphSchema } from './react-flow/demo-node-body';
import { demoGraphSchemaId } from './react-flow/fixtures';

const srcDir = import.meta.dirname;

const read = (relative: string): string => fs.readFileSync(path.join(srcDir, relative), 'utf-8');

/**
 * Static RUNTIME `import`/`export … from` specifiers.
 *
 * `import type` and `export type` are erased by the compiler, so they are not
 * edges — `NodeGraphWebProps` is imported that way here on purpose, which is
 * what keeps both platforms' prop shapes the same object instead of two lists
 * that drift. A dynamic `import()` is not a static edge either.
 */
const staticSpecifiers = (source: string): string[] => {
  const out: string[] = [];
  const re =
    // oxlint-disable-next-line sonarjs/super-linear-regex -- scans this package's own source files once per test; the lazy [^;]*? is bounded by the next `;`.
    /(?:^|\n)\s*(?:import|export)\s+(?!type\s)[^;]*?from\s*["'](?<from>[^"']+)["']|(?:^|\n)\s*import\s*["'](?<bare>[^"']+)["']/gu;
  let match = re.exec(source);
  while (match !== null) {
    out.push(match.groups?.from ?? match.groups?.bare ?? '');
    match = re.exec(source);
  }
  return out;
};

describe('the demo schema id', () => {
  /**
   * The id is the ONE string that crosses the bridge for the package's own
   * story, so the constant and the schema it names cannot drift: renaming one
   * without the other leaves the canvas reporting "no graph schema registered".
   */
  it('is the id the demo schema actually registers under', () => {
    expect(demoGraphSchema().id).toBe(demoGraphSchemaId);
  });
});

describe('NodeGraph.native.tsx', () => {
  /**
   * The whole reason the DOM host exists. React Flow runs in a browser; a
   * static import here would put it, and its nested zustand, on the Hermes
   * side, which is the MPO-74 failure class — a module-eval throw at boot with
   * no console on the device to read it in.
   */
  it('never statically imports the canvas or @xyflow', () => {
    const specifiers = staticSpecifiers(read('NodeGraph.native.tsx'));
    const canvas = specifiers.filter(
      (specifier) =>
        specifier.includes('@xyflow') ||
        specifier.endsWith('react-flow/xy') ||
        specifier.endsWith('react-flow/NodeGraphWeb'),
    );
    expect(canvas).toStrictEqual([]);
  });

  /**
   * Type-only imports are erased, so `NodeGraphWebProps` costs nothing at
   * runtime and is what keeps the two platforms' prop shapes provably the same
   * object rather than two lists that drift.
   */
  it("takes its prop shape from the web component's, as a type", () => {
    const source = read('NodeGraph.native.tsx');
    expect(source).toMatch(/import type \{ NodeGraphWebProps \} from ["']\.\/react-flow\/NodeGraphWeb["']/u);
    expect(source).toMatch(/schemaId=\{schema\.id\}/u);
  });
});

/**
 * Every module the Hermes side actually loads, following RELATIVE imports only.
 *
 * Metro prefers a `.native` twin, so this does too. Bare specifiers are not
 * walked: they are somebody else's graph, and the question here is about ours.
 */
const reachableFrom = (entry: string): Set<string> => {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.shift()!;
    if (seen.has(file)) {
      continue;
    }
    seen.add(file);
    for (const specifier of staticSpecifiers(read(file))) {
      if (!specifier.startsWith('.')) {
        continue;
      }
      const base = path.join(path.dirname(file), specifier);
      const candidate = ['.native.tsx', '.native.ts', '.tsx', '.ts', '/index.ts']
        .map((extension) => `${base}${extension}`)
        .find((option) => fs.existsSync(path.join(srcDir, option)));
      if (candidate !== undefined) {
        queue.push(path.normalize(candidate));
      }
    }
  }
  return seen;
};

describe('what the Hermes side loads', () => {
  /**
   * THE LAYOUT ENGINE IS THE WEBVIEW'S, ALWAYS, and that is what makes the
   * m6 Android Tidy finding answerable.
   *
   * `layout/runner.ts` caches its probed runner in MODULE SCOPE. That is safe
   * only while the module lives in the realm that runs the layout — a WebView
   * recreated by Retry is a new realm, so the module is re-evaluated and the
   * runner is probed again from nothing. Reach the same module from the native
   * host and the cache outlives the WebView instead: a Retry would then inherit
   * the answer the dead realm probed, and "broken on Android" and "broken on a
   * recreated canvas" would become genuinely inseparable rather than merely
   * unseparated by one device run.
   *
   * The blob URL has the same shape — `URL.createObjectURL` registers it in the
   * realm that spawned the worker — so this one edge protects both.
   */
  it('never reaches the layout runner, so a relayout is probed per realm', () => {
    const reached = reachableFrom('NodeGraph.native.tsx');
    // The walk is real, not an empty set that trivially passes the filter.
    expect(reached.has('native/NodeGraph.native.tsx')).toBe(true);
    expect(reached.has('model/commands.ts')).toBe(true);
    expect([...reached].filter((file) => file.startsWith('layout/'))).toStrictEqual([]);
  });
});

describe('NodeGraphDomInner.tsx', () => {
  /**
   * STATIC, and deliberately so after measuring. A second dynamic import makes
   * Metro emit a shared `__common` chunk, and `expo export`'s html serializer
   * then dies with `Asset not found: …/__common-<hash>.js` while exiting 0 and
   * writing nothing. The chunk it bought was 5.6 KB.
   */
  it('reaches demoNodeBody through a static import, not a dynamic one', () => {
    const source = read('dom/NodeGraphDomInner.tsx');
    expect(staticSpecifiers(source).filter((s) => s.includes('demo-node-body'))).toStrictEqual([
      '../react-flow/demo-node-body',
    ]);
    expect(source).not.toMatch(/import\(["']\.\.\/react-flow\/demo-node-body["']\)/u);
  });

  /**
   * And only on a miss. Registering unconditionally would shadow a consumer who
   * registered their own schema under the same id, which is a debugging session
   * nobody would enjoy.
   */
  it('only supplies the demo schema when the lookup missed', () => {
    const source = read('dom/NodeGraphDomInner.tsx');
    expect(source).toMatch(/schemaId === demoGraphSchemaId \? \(demoGraphSchema\(\)/u);
    expect(source).toMatch(/getGraphSchema\(schemaId\)[\s\S]{0,80}\?\? demoSchema/u);
  });
});
