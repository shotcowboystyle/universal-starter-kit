/**
 * MPO-10 regression guard.
 *
 * mermaid must not appear anywhere on this package's NATIVE source graph.
 * `import()` is not tree-shakable, so a single dynamic import on a native
 * module forces every native bundler that reaches it to parse mermaid and
 * emit its chunk — and mermaid's published chunks are illegal ESM ("use
 * strict" inside functions with non-simple parameter lists), which fails
 * `one build --platform ios` outright with no bundle at all.
 *
 * The blast radius is the whole workspace: this package's barrel re-exports
 * ./mermaid, so any native consumer that reaches the barrel — including
 * anyone importing one component from @repo/frappe-ui — used to
 * inherit the failure.
 *
 * The rule this pins: for every module in src/, the tier a native bundler
 * resolves (the `.native` sibling when one exists, otherwise the shared
 * file) carries no `mermaid` specifier.
 */

import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const srcDir = path.resolve(import.meta.dirname, '..');

const codeExt = new Set(['.ts', '.tsx']);
const SKIP_REGEX = /\.(?:spec|test|stories)\.tsx?$/u;
const BLOCK_COMMENT_REGEX = /\/\*[\s\S]*?\*\//gu;
const LINE_COMMENT_REGEX = /(?<lead>^|\s)\/\/[^\n]*/gu;

const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      return walk(full);
    }
    if (!codeExt.has(path.extname(e.name))) {
      return [];
    }
    if (SKIP_REGEX.test(e.name)) {
      return [];
    }
    return [full];
  });

/** The file a native bundler resolves for `file` (its `.native` sibling wins). */
const nativeTier = (file: string): string => {
  const ext = path.extname(file);
  if (file.endsWith(`.native${ext}`)) {
    return file;
  }
  const base = file.slice(0, -ext.length);
  for (const e of ['.native.tsx', '.native.ts']) {
    if (fs.existsSync(base + e)) {
      return base + e;
    }
  }
  return file;
};

const importPatterns = [
  // oxlint-disable-next-line sonarjs/super-linear-regex -- test-only scan over this package's own source files
  /(?:^|\n)\s*(?:import|export)\s+(?:type\s+)?(?:[^'"();]*?\sfrom\s*)?["'](?<spec>[^"']+)["']/gu,
  /\bimport\s*\(\s*["'](?<spec>[^"']+)["']\s*\)/gu,
];

/** Module specifiers, static and dynamic, with comments stripped. */
const specifiers = (file: string): string[] => {
  const src = fs
    .readFileSync(file, 'utf-8')
    .replaceAll(BLOCK_COMMENT_REGEX, '')
    .replaceAll(LINE_COMMENT_REGEX, '$<lead>');
  const found: string[] = [];
  for (const pattern of importPatterns) {
    for (const match of src.matchAll(pattern)) {
      const spec = match.groups?.spec;
      if (spec !== undefined) {
        found.push(spec);
      }
    }
  }
  return found;
};

const isMermaid = (spec: string) => spec === 'mermaid' || spec.startsWith('mermaid/');

describe('native module graph', () => {
  it('never reaches the mermaid engine', () => {
    const offenders = [...new Set(walk(srcDir).map(nativeTier))]
      .filter((file) => specifiers(file).some(isMermaid))
      .map((file) => path.relative(srcDir, file))
      .toSorted();
    expect(offenders).toStrictEqual([]);
  });

  it("keeps the web tier's lazy mermaid import, which is where it belongs", () => {
    const web = path.join(srcDir, 'mermaid', 'render-mermaid-diagram.ts');
    expect(specifiers(web).some(isMermaid)).toBe(true);
  });
});
