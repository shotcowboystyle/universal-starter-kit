import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { readSizeRecipeEscapeRegistry, readSlotMarginRegistry, readSpecTable } from '../specRegistry.mjs';

const fixtures: string[] = [];

afterEach(() => {
  for (const dir of fixtures.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function specFile(markdown: string) {
  const root = mkdtempSync(join(tmpdir(), 'mpo-spec-registry-'));
  fixtures.push(root);
  const specPath = join(root, 'spec.md');
  writeFileSync(specPath, markdown);
  return specPath;
}

const repoSpec = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'docs', 'theme-propagation-spec.md');

describe('readSpecTable', () => {
  it('returns body rows under the heading and stops at the next section', () => {
    const rows = readSpecTable(
      '## A\n\n| X | Y |\n| - | - |\n| a | b |\n\n## B\n\n| X | Y |\n| - | - |\n| c | d |\n',
      '## A',
    );
    expect(rows).toEqual([['a', 'b']]);
  });

  it('returns null when the heading is absent', () => {
    expect(readSpecTable('## Other\n', '## A')).toBeNull();
  });
});

describe('readSlotMarginRegistry', () => {
  it('parses the SLOT-MARGIN members', () => {
    const registry = readSlotMarginRegistry(
      specFile(
        '## Slot margins\n\n| Class | Normative meaning |\n| --- | --- |\n| SLOT-MARGIN | Slots. Members: **Card.Footer**, **Card.Header** |\n',
      ),
    );
    expect(registry).toMatchObject({ present: true, members: ['Card.Footer', 'Card.Header'] });
  });

  it('is absent, not an error, when the spec or the section is missing', () => {
    expect(readSlotMarginRegistry(join(tmpdir(), 'no-such-spec.md')).present).toBe(false);
    expect(readSlotMarginRegistry(specFile('# Spec\n')).present).toBe(false);
  });

  it('throws when the section has no SLOT-MARGIN row, so a renamed class cannot empty it', () => {
    expect(() =>
      readSlotMarginRegistry(specFile('## Slot margins\n\n| Class | Meaning |\n| --- | --- |\n| SLOTS | x |\n')),
    ).toThrow(/no SLOT-MARGIN row/);
  });
});

describe('readSizeRecipeEscapeRegistry', () => {
  it('reads one { file, reason } per row, unwrapping code spans', () => {
    const registry = readSizeRecipeEscapeRegistry(
      specFile(
        '## Size-recipe escapes\n\n| File | Reason |\n| --- | --- |\n| `public/forms/src/A.tsx` | `square end-cap; pad lives on Input.Box` |\n',
      ),
    );
    expect(registry.escapes).toEqual([
      { file: 'public/forms/src/A.tsx', reason: 'square end-cap; pad lives on Input.Box' },
    ]);
  });

  it('throws on a row with no reason: an escape is declared BY its reason', () => {
    expect(() =>
      readSizeRecipeEscapeRegistry(
        specFile('## Size-recipe escapes\n\n| File | Reason |\n| --- | --- |\n| `public/forms/src/A.tsx` |  |\n'),
      ),
    ).toThrow(/has no reason/);
  });
});
