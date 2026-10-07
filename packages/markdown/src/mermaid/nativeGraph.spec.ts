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
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const srcDir = path.resolve(import.meta.dirname, '..');

const codeExt = new Set(['.ts', '.tsx']);
const skip = /\.(spec|test|stories)\.tsx?$/;

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      return walk(full);
    }
    if (!codeExt.has(path.extname(e.name))) {
      return [];
    }
    if (skip.test(e.name)) {
      return [];
    }
    return [full];
  });
}

/** The file a native bundler resolves for `file` (its `.native` sibling wins). */
function nativeTier(file: string): string {
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
}

const importPatterns = [
  /(?:^|\n)\s*(?:import|export)\s+(?:type\s+)?(?:[^'"();]*?\sfrom\s*)?["']([^"']+)["']/g,
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
];

/** Module specifiers, static and dynamic, with comments stripped. */
function specifiers(file: string): string[] {
  const src = fs
    .readFileSync(file, 'utf-8')
    .replaceAll(/\/\*[\s\S]*?\*\//g, '')
    .replaceAll(/(^|\s)\/\/[^\n]*/g, '$1');
  const found: string[] = [];
  for (const pattern of importPatterns) {
    pattern.lastIndex = 0;
    let match = pattern.exec(src);
    while (match) {
      found.push(match[1]);
      match = pattern.exec(src);
    }
  }
  return found;
}

const isMermaid = (spec: string) => spec === 'mermaid' || spec.startsWith('mermaid/');

describe('native module graph', () => {
  it('never reaches the mermaid engine', () => {
    const offenders = [...new Set(walk(srcDir).map(nativeTier))]
      .filter((file) => specifiers(file).some(isMermaid))
      .map((file) => path.relative(srcDir, file))
      .sort();
    expect(offenders).toEqual([]);
  });

  it("keeps the web tier's lazy mermaid import, which is where it belongs", () => {
    const web = path.join(srcDir, 'mermaid', 'renderMermaidDiagram.ts');
    expect(specifiers(web).some(isMermaid)).toBe(true);
  });
});
