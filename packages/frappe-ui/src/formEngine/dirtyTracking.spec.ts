// R-1 false "Not Saved": engine-level dirty-tracking contract.
// An untouched existing doc must read pristine, a real edit must read dirty,
// create mode must read dirty from applied defaults (desk parity).
import { describe, expect, it } from 'vitest';

import { computeDirtyFields, isSameValue } from './dirtyTracking';

describe('isSameValue (normalization-insensitive equality)', () => {
  it('treats null / undefined / empty string / empty array as one empty state', () => {
    expect(isSameValue(null, '')).toBe(true);
    expect(isSameValue(undefined, '')).toBe(true);
    expect(isSameValue(null)).toBe(true);
    expect(isSameValue([], null)).toBe(true);
    expect(isSameValue('  ', '')).toBe(true);
  });

  it('folds boolean and wire 0/1 representations', () => {
    expect(isSameValue(false, 0)).toBe(true);
    expect(isSameValue(true, 1)).toBe(true);
    expect(isSameValue(0, false)).toBe(true);
    expect(isSameValue(true, 0)).toBe(false);
    expect(isSameValue(false, 1)).toBe(false);
  });

  it('does not conflate empty with falsy non-empty values', () => {
    expect(isSameValue(0, '')).toBe(false);
    expect(isSameValue(false, '')).toBe(false);
    expect(isSameValue(0, null)).toBe(false);
  });

  it('stays strict for real values — no deep equality', () => {
    expect(isSameValue('a', 'a')).toBe(true);
    expect(isSameValue('a', 'b')).toBe(false);
    // Distinct array/object identities read as different even when
    // structurally equal (deliberate: no deep-equality time bombs).
    expect(isSameValue([{ a: 1 }], [{ a: 1 }])).toBe(false);
    // Representation changes of real content are edits (the field layer is
    // responsible for not emitting them during initialization).
    expect(isSameValue('plain', '<p>plain</p>')).toBe(false);
  });
});

describe(computeDirtyFields, () => {
  const baseline = {
    doctype: 'ToDo',
    name: 'abc',
    description: 'hello',
    status: 'Open',
    color: null,
    priority: 'Medium',
    date: '2026-08-12',
    checked: 0,
  };

  it('existing doc mount: local === baseline snapshot reads pristine', () => {
    expect(computeDirtyFields({ ...baseline }, baseline)).toEqual([]);
  });

  it("field re-representation during init does not dirty (null→'' and 0→false)", () => {
    const local = { ...baseline, color: '', checked: false };
    expect(computeDirtyFields(local, baseline)).toEqual([]);
  });

  it('a real edit reads dirty', () => {
    const local = { ...baseline, description: 'hello edited' };
    expect(computeDirtyFields(local, baseline)).toEqual(['description']);
  });

  it('revert to the exact baseline value reads clean again', () => {
    // Documented behavior: value equality, not edit history — typing and
    // deleting back to the original string is pristine. An equivalent-but-
    // differently-represented value (e.g. tiptap-normalized HTML) would
    // still read dirty, which matches desk.
    const local = { ...baseline, description: 'hello' };
    expect(computeDirtyFields(local, baseline)).toEqual([]);
  });

  it('bookkeeping keys never dirty', () => {
    const local = { ...baseline, name: 'renamed', doctype: 'Other' };
    expect(computeDirtyFields(local, baseline)).toEqual([]);
  });

  it('new doc (no baseline) with applied create-defaults reads dirty — desk parity', () => {
    const local = { doctype: 'ToDo', status: 'Open', priority: 'Medium', description: '' };
    expect(computeDirtyFields(local)).toEqual(['status', 'priority']);
  });

  it('new doc with only empty values reads pristine', () => {
    const local = { doctype: 'ToDo', description: '', color: null };
    expect(computeDirtyFields(local)).toEqual([]);
  });
});
