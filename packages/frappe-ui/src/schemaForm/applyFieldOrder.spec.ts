import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { FieldSchema } from '../fieldRegistry';

import { applyFieldOrder, applyOrderToSchema } from './applyFieldOrder';

import type { FormSchema } from './index';

const named = (...names: string[]): FieldSchema[] => names.map((name) => ({ type: 'Data', name, label: name }));

describe('applyFieldOrder (R2 / MPO-22)', () => {
  it('is identity when order is missing or empty', () => {
    const fields = named('a', 'b', 'c');
    expect(applyFieldOrder(fields).map((f) => f.name)).toEqual(['a', 'b', 'c']);
    expect(applyFieldOrder(fields, []).map((f) => f.name)).toEqual(['a', 'b', 'c']);
  });

  it('reorders listed fields in place; unlisted keep their meta positions', () => {
    // meta [a, b, c, d, e], order [c, a] → listed occupy slots 0 and 2
    // unlisted b/d/e stay; listed fill those slots as c then a.
    expect(applyFieldOrder(named('a', 'b', 'c', 'd', 'e'), ['c', 'a']).map((f) => f.name)).toEqual([
      'c',
      'b',
      'a',
      'd',
      'e',
    ]);
  });

  it('ignores unknown names and duplicate order entries', () => {
    expect(applyFieldOrder(named('a', 'b', 'c'), ['c', 'nope', 'c', 'a']).map((f) => f.name)).toEqual(['c', 'b', 'a']);
  });

  it('does not invent fields that are not in the meta list', () => {
    expect(applyFieldOrder(named('a', 'b'), ['b', 'a', 'ghost']).map((f) => f.name)).toEqual(['b', 'a']);
  });
});

describe(applyOrderToSchema, () => {
  it('permutes listed fields across sections without changing the tree shape', () => {
    const a = named('a')[0];
    const b = named('b')[0];
    const c = named('c')[0];
    const d = named('d')[0];
    const schema: FormSchema = {
      fields: [a, b, c, d],
      sections: [
        { label: 'One', columns: [{ fields: [a, b] }] },
        { label: 'Two', columns: [{ fields: [c, d] }] },
      ],
    };
    const next = applyOrderToSchema(schema, ['d', 'a']);
    expect(next.sections).toHaveLength(2);
    expect(next.sections[0]?.columns[0]?.fields.map((f) => f.name)).toEqual(['d', 'b']);
    expect(next.sections[1]?.columns[0]?.fields.map((f) => f.name)).toEqual(['c', 'a']);
    expect(next.sections[0]?.label).toBe('One');
    expect(next.sections[1]?.label).toBe('Two');
  });
});

describe('FrappeForm R2 wiring', () => {
  it('forwards order onto SchemaForm (cheap R2, not a sections tree)', () => {
    const src = readFileSync(join(import.meta.dirname, '../FrappeForm.tsx'), {
      encoding: 'utf-8',
    });
    expect(src).toMatch(/order\?: string\[\]/);
    expect(src).toMatch(/order=\{order\}/);
  });
});
