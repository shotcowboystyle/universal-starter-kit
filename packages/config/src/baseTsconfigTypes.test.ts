/**
 * The shared `types` array is load-bearing.
 *
 * `packages/config/tsconfig/base.json` sets `compilerOptions.types`, which turns
 * OFF automatic @types inclusion for every program in the workspace. Anything
 * missing from that list is simply absent, with no error at the point of loss.
 *
 * `chai` is the one that bit. @vitest/expect declares
 *
 *   interface Assertion<T> extends VitestAssertion<Chai.Assertion, T>, ...
 *
 * so with no global `Chai` namespace the base interface collapses and takes
 * `.not` and the jest-dom matchers with it. Measured on 2026-09-04 against
 * origin/main cb157dd0f: public/components 421 -> 26, public/forms 343 -> 4,
 * features 168 -> 138, public/utils 4 -> 0, and no package got worse.
 *
 * Same shape as the workspace `paths` map: a config key that REPLACES rather
 * than merges, quietly dropping what it did not enumerate.
 */
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const baseTsconfig = path.resolve(__dirname, '../tsconfig/base.json');

/** JSONC: whole-line `//` comments only, plus trailing commas. */
function readJsonc(file: string): any {
  const src = fs.readFileSync(file, 'utf8');
  return JSON.parse(src.replace(/^[ \t]*\/\/.*$/gm, '').replace(/,(\s*[}\]])/g, '$1'));
}

describe('base tsconfig types', () => {
  it('keeps chai in the explicit types array', () => {
    const types = readJsonc(baseTsconfig)?.compilerOptions?.types;
    expect(types).toContain('chai');
  });

  it('keeps the jest-dom vitest matchers alongside it', () => {
    const types = readJsonc(baseTsconfig)?.compilerOptions?.types;
    expect(types).toContain('@testing-library/jest-dom/vitest');
  });
});
