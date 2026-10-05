import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { DRAWING_PRAGMA, isDrawingFile, readDrawingRegistry } from '../drawingRegistry.mjs';

const fixtures: string[] = [];

afterEach(() => {
  for (const dir of fixtures.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function specWith(members: { drawing?: string; chrome?: string }) {
  const root = mkdtempSync(join(tmpdir(), 'mpo-drawing-'));
  fixtures.push(root);
  const drawingMembers = members.drawing ? `Members: **${members.drawing}**` : 'Members: *(none)*';
  const chromeMembers = members.chrome ? `Members: **${members.chrome}**` : 'Members: *(none)*';
  const markdown = `# Theme

## Drawing files

| Class        | Normative meaning |
| ------------ | ----------------- |
| DRAWING      | Glyphs. ${drawingMembers} |
| CHROME-ALLOW | Exceptions. ${chromeMembers} |
`;
  const specPath = join(root, 'spec.md');
  writeFileSync(specPath, markdown);
  return specPath;
}

describe('readDrawingRegistry', () => {
  it('parses DRAWING and CHROME-ALLOW members from the spec table', () => {
    const specPath = specWith({
      drawing: 'listing/glyphs/CanvasGlyph.tsx',
      chrome: 'Card',
    });
    const registry = readDrawingRegistry(specPath);
    expect(registry.present).toBe(true);
    expect(registry.files).toEqual(['listing/glyphs/CanvasGlyph.tsx']);
    expect(registry.chromeAllow).toEqual(['Card']);
  });

  it('yields empty lists when the spec file is missing', () => {
    const registry = readDrawingRegistry(join(tmpdir(), 'no-such-spec.md'));
    expect(registry.present).toBe(false);
    expect(registry.files).toEqual([]);
    expect(registry.chromeAllow).toEqual([]);
  });
});

describe('isDrawingFile / DRAWING_PRAGMA', () => {
  it('matches a registered path suffix', () => {
    expect(
      isDrawingFile('packages/marketplace/src/listing/glyphs/CanvasGlyph.tsx', ['listing/glyphs/CanvasGlyph.tsx']),
    ).toBe(true);
    expect(isDrawingFile('features/lookout/src/WallScreen.tsx', ['CanvasGlyph.tsx'])).toBe(false);
    expect(isDrawingFile('features/demo/FooCanvasGlyph.tsx', ['CanvasGlyph.tsx'])).toBe(false);
  });

  it('matches the file pragma', () => {
    expect(DRAWING_PRAGMA.test('// mpo-drawing — canvas mark\nexport const G = 1;\n')).toBe(true);
    expect(DRAWING_PRAGMA.test('export const G = 1;\n')).toBe(false);
  });
});
