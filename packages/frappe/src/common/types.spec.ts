import { describe, expect, it } from 'vitest';

import { isChildTableArray, isChildTableRow, stripNullsFromChildRow } from '../sync/merge';
import type { ChildTableRow } from '../sync/merge';

describe(isChildTableRow, () => {
  it('should return true for valid child table rows', () => {
    const validRow: ChildTableRow = {
      doctype: 'Item',
      idx: 1,
      name: 'row-1',
      parent: 'parent-doc',
      parentfield: 'items',
      parenttype: 'Invoice',
    };
    expect(isChildTableRow(validRow)).toBe(true);
  });

  it('should return true for child table rows with null fields', () => {
    const validRow: ChildTableRow = {
      doctype: null,
      idx: null,
      name: 'row-1',
      parent: null,
      parentfield: null,
      parenttype: null,
    };
    expect(isChildTableRow(validRow)).toBe(true);
  });

  it('should return false for non-objects', () => {
    expect(isChildTableRow(null)).toBe(false);
    expect(isChildTableRow()).toBe(false);
    expect(isChildTableRow('string')).toBe(false);
    expect(isChildTableRow(123)).toBe(false);
    expect(isChildTableRow([])).toBe(false);
  });

  it('should return false for objects missing required fields', () => {
    expect(isChildTableRow({})).toBe(false);
    expect(isChildTableRow({ name: 'row-1' })).toBe(false);
    expect(isChildTableRow({ name: 'row-1', idx: 1 })).toBe(false);
  });

  it('should return false for objects with wrong field types', () => {
    expect(
      isChildTableRow({
        name: 123,
        idx: 1,
        parent: 'parent',
        parentfield: 'field',
        parenttype: 'type',
      }),
    ).toBe(false);
    expect(
      isChildTableRow({
        name: 'row-1',
        idx: 'not-a-number',
        parent: 'parent',
        parentfield: 'field',
        parenttype: 'type',
      }),
    ).toBe(false);
  });
});

describe('isChildTableArray - single argument', () => {
  it('should return false for non-arrays', () => {
    expect(isChildTableArray('string')).toBe(false);
    expect(isChildTableArray(123)).toBe(false);
    expect(isChildTableArray({})).toBe(false);
    expect(isChildTableArray(null)).toBe(false);
    expect(isChildTableArray()).toBe(false);
  });

  it('should return null for empty arrays', () => {
    expect(isChildTableArray([])).toBeNull();
  });

  it('should return null for arrays with only null/undefined', () => {
    expect(isChildTableArray([null, null, undefined])).toBeNull();
  });

  it('should return true for valid child table arrays', () => {
    const childTableArray: ChildTableRow[] = [
      {
        name: 'row-1',
        doctype: 'Item',
        idx: 1,
        parent: 'parent',
        parentfield: 'items',
        parenttype: 'Invoice',
      },
      {
        name: 'row-2',
        doctype: 'Item',
        idx: 2,
        parent: 'parent',
        parentfield: 'items',
        parenttype: 'Invoice',
      },
    ];
    expect(isChildTableArray(childTableArray)).toBe(true);
  });

  it('should return true even with some null values mixed in', () => {
    const childTableArray = [
      null,
      {
        name: 'row-1',
        doctype: 'Item',
        idx: 1,
        parent: 'parent',
        parentfield: 'items',
        parenttype: 'Invoice',
      },
      undefined,
      {
        name: 'row-2',
        doctype: 'Item',
        idx: 2,
        parent: 'parent',
        parentfield: 'items',
        parenttype: 'Invoice',
      },
    ];
    expect(isChildTableArray(childTableArray)).toBe(true);
  });

  it('should return false for non-child-table arrays', () => {
    expect(isChildTableArray([1, 2, 3])).toBe(false);
    expect(isChildTableArray(['a', 'b', 'c'])).toBe(false);
    expect(isChildTableArray([{ name: 'test' }, { name: 'test2' }])).toBe(false);
  });

  it('should sample first, middle, and last elements for validation', () => {
    const largeArray = Array.from({ length: 10 }, (_, i) => ({
      name: `row-${i}`,
      doctype: 'Item',
      idx: i,
      parent: 'parent',
      parentfield: 'items',
      parenttype: 'Invoice',
    }));
    // Intentionally create an invalid object to test validation
    (largeArray as unknown[])[5] = { name: 'bad-row' };
    expect(isChildTableArray(largeArray)).toBe(false);
  });
});

describe('isChildTableArray - multiple arguments', () => {
  const validChildTable1: ChildTableRow[] = [
    {
      name: 'row-1',
      doctype: 'Item',
      idx: 1,
      parent: 'parent',
      parentfield: 'items',
      parenttype: 'Invoice',
    },
  ];
  const validChildTable2: ChildTableRow[] = [
    {
      name: 'row-2',
      doctype: 'Item',
      idx: 2,
      parent: 'parent',
      parentfield: 'items',
      parenttype: 'Invoice',
    },
  ];
  const nonChildTable = [{ name: 'test' }, { value: 123 }];

  it('should return false when no arguments are arrays', () => {
    expect(isChildTableArray('string', 123, {})).toBe(false);
  });

  it('should return true when all non-empty arrays are child tables', () => {
    expect(isChildTableArray(validChildTable1, validChildTable2)).toBe(true);
    expect(isChildTableArray([], validChildTable1, validChildTable2)).toBe(true);
    expect(isChildTableArray(validChildTable1, [], validChildTable2)).toBe(true);
  });

  it('should return false when any array is not a child table', () => {
    expect(isChildTableArray(validChildTable1, nonChildTable)).toBe(false);
    expect(isChildTableArray(nonChildTable, validChildTable1)).toBe(false);
    expect(isChildTableArray(validChildTable1, nonChildTable, validChildTable2)).toBe(false);
  });

  it('should handle empty arrays by looking at other arrays for evidence', () => {
    expect(isChildTableArray([], validChildTable1, validChildTable2)).toBe(true);
    expect(isChildTableArray(validChildTable1, [], validChildTable2)).toBe(true);
    expect(isChildTableArray([], [], [])).toBe(false);
  });

  it("should return false when there's contradictory evidence", () => {
    const mixedArray = [
      {
        name: 'row-1',
        doctype: 'Item',
        idx: 1,
        parent: 'parent',
        parentfield: 'items',
        parenttype: 'Invoice',
      },
      { name: 'not-child-row', value: 123 },
    ];
    expect(isChildTableArray(validChildTable1, mixedArray)).toBe(false);
  });

  it('should ignore null and undefined arguments', () => {
    expect(isChildTableArray(null, validChildTable1)).toBe(true);
    expect(isChildTableArray(validChildTable1, null, validChildTable2)).toBe(true);
  });
});

describe(stripNullsFromChildRow, () => {
  it('should remove null values from child row', () => {
    const row: ChildTableRow = {
      name: 'row-1',
      doctype: undefined,
      idx: 1,
      parent: null,
      parentfield: 'items',
      parenttype: null,
    };
    const stripped = stripNullsFromChildRow(row);
    expect(stripped).toEqual({
      name: 'row-1',
      idx: 1,
      parentfield: 'items',
    });
  });

  it('should preserve falsy values that are not null', () => {
    const row = {
      name: 'row-1',
      doctype: undefined,
      idx: 0,
      parent: '',
      parentfield: false,
      parenttype: undefined,
      customField: 0,
    } as ChildTableRow & { parentfield: false; customField: number };
    const stripped = stripNullsFromChildRow(row);
    expect(stripped).toEqual({
      name: 'row-1',
      idx: 0,
      parent: '',
      parentfield: false,
      parenttype: undefined,
      customField: 0,
    });
  });

  it('should handle rows with no null values', () => {
    const row: ChildTableRow = {
      name: 'row-1',
      doctype: 'Item',
      idx: 1,
      parent: 'parent',
      parentfield: 'items',
      parenttype: 'Invoice',
    };
    const stripped = stripNullsFromChildRow(row);
    expect(stripped).toEqual(row);
  });

  it('should handle custom fields', () => {
    const row: ChildTableRow = {
      name: 'row-1',
      doctype: 'Item',
      idx: 1,
      parent: 'parent',
      parentfield: 'items',
      parenttype: 'Invoice',
      customField: 'value',
      anotherField: null,
    };
    const stripped = stripNullsFromChildRow(row);
    expect(stripped).toEqual({
      name: 'row-1',
      doctype: 'Item',
      idx: 1,
      parent: 'parent',
      parentfield: 'items',
      parenttype: 'Invoice',
      customField: 'value',
    });
  });
});
