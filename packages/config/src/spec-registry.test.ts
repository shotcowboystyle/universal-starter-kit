import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it, onTestFinished } from 'vitest';

import { readSizeRecipeEscapeRegistry, readSlotMarginRegistry, readSpecTable } from '../spec-registry.mjs';

const specFile = (markdown: string) => {
  const root = mkdtempSync(path.join(tmpdir(), 'mpo-spec-registry-'));
  onTestFinished(() => {
    rmSync(root, { recursive: true, force: true });
  });
  const specPath = path.join(root, 'spec.md');
  writeFileSync(specPath, markdown);
  return specPath;
};

describe(readSpecTable, () => {
  it('returns body rows under the heading and stops at the next section', () => {
    const rows = readSpecTable(
      '## A\n\n| X | Y |\n| - | - |\n| a | b |\n\n## B\n\n| X | Y |\n| - | - |\n| c | d |\n',
      '## A',
    );
    expect(rows).toStrictEqual([['a', 'b']]);
  });

  it('returns null when the heading is absent', () => {
    expect(readSpecTable('## Other\n', '## A')).toBeNull();
  });
});

describe(readSlotMarginRegistry, () => {
  it('parses the SLOT-MARGIN members', () => {
    const registry = readSlotMarginRegistry(
      specFile(
        '## Slot margins\n\n| Class | Normative meaning |\n| --- | --- |\n| SLOT-MARGIN | Slots. Members: **Card.Footer**, **Card.Header** |\n',
      ),
    );
    expect(registry).toMatchObject({ present: true, members: ['Card.Footer', 'Card.Header'] });
  });

  it('is absent, not an error, when the spec or the section is missing', () => {
    expect(readSlotMarginRegistry(path.join(tmpdir(), 'no-such-spec.md')).present).toBe(false);
    expect(readSlotMarginRegistry(specFile('# Spec\n')).present).toBe(false);
  });

  it('throws when the section has no SLOT-MARGIN row, so a renamed class cannot empty it', () => {
    expect(() =>
      readSlotMarginRegistry(specFile('## Slot margins\n\n| Class | Meaning |\n| --- | --- |\n| SLOTS | x |\n')),
    ).toThrow(/no SLOT-MARGIN row/u);
  });
});

describe(readSizeRecipeEscapeRegistry, () => {
  it('reads one { file, reason } per row, unwrapping code spans', () => {
    const registry = readSizeRecipeEscapeRegistry(
      specFile(
        '## Size-recipe escapes\n\n| File | Reason |\n| --- | --- |\n| `public/forms/src/A.tsx` | `square end-cap; pad lives on Input.Box` |\n',
      ),
    );
    expect(registry.escapes).toStrictEqual([
      { file: 'public/forms/src/A.tsx', reason: 'square end-cap; pad lives on Input.Box' },
    ]);
  });

  it('throws on a row with no reason: an escape is declared BY its reason', () => {
    expect(() =>
      readSizeRecipeEscapeRegistry(
        specFile('## Size-recipe escapes\n\n| File | Reason |\n| --- | --- |\n| `public/forms/src/A.tsx` |  |\n'),
      ),
    ).toThrow(/has no reason/u);
  });
});
