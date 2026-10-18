/**
 * filter-conversion — frappe tuple ↔ DataTable FilterValue bridge.
 *
 * Round-trip pairs assert frappeTupleToFilterValue is the inverse of
 * frappe-ui's filterValueToFrappeTuple (LC-16: one chain). The frappe-ui
 * package root cannot load in this plain-node vitest env (its workspace
 * dep chain resolves to raw TS that node loads natively), so the mock
 * below is a VERBATIM mirror of filterValueToFrappeTuple from
 * public/frappe-ui/src/FrappeTable.tsx — the real implementation is
 * itself pinned by public/frappe-ui/src/filterFields.spec.ts. If that
 * function changes, update this mirror to match.
 * Tuple fixtures mirror bench-verified shapes from
 * p-results/backoffice/integration-notes.md.
 */
import type { DataTableState, FilterValue } from '@repo/table';
import { describe, expect, it, vi } from 'vitest';

import type { FrappeFilter, FrappeFilters } from '../shared/types';

import {
  frappeFiltersToTableFilters,
  frappeTupleToFilterValue,
  sameFilterTuple,
  tableStateToFrappeFilters,
  toggleFilterTuple,
} from './filter-conversion';

/* oxlint-disable eslint/complexity, eslint/default-case, anti-slop/no-runtime-typeof, typescript/switch-exhaustiveness-check, typescript/strict-boolean-expressions -- verbatim mirror of frappe-ui's filterValueToFrappeTuple (see above) */
vi.mock(import('@repo/frappe-ui'), () => ({
  // Behavior-identical mirror of public/frappe-ui/src/FrappeTable.tsx
  // filterValueToFrappeTuple (only `value == null` spelled out for lint).
  filterValueToFrappeTuple(fieldname: string, filterValue: FilterValue): [string, string, unknown] | null {
    const { operator, value, values } = filterValue;
    const wrap = (pattern: string) => (typeof value === 'string' && value.includes('%') ? value : pattern);
    switch (operator) {
      case 'isEmpty': {
        return [fieldname, 'is', 'not set'];
      }
      case 'isNotEmpty': {
        return [fieldname, 'is', 'set'];
      }
      case 'isAnyOf': {
        return values?.length ? [fieldname, 'in', values] : null;
      }
      case 'isNoneOf': {
        return values?.length ? [fieldname, 'not in', values] : null;
      }
      case 'isBetween': {
        return values?.length === 2 ? [fieldname, 'between', values] : null;
      }
    }
    if (value === null || value === undefined || value === '') {
      return null;
    }
    switch (operator) {
      case 'contains': {
        return [fieldname, 'like', wrap(`%${value}%`)];
      }
      case 'doesNotContain': {
        return [fieldname, 'not like', wrap(`%${value}%`)];
      }
      case 'startsWith': {
        return [fieldname, 'like', wrap(`${value}%`)];
      }
      case 'endsWith': {
        return [fieldname, 'like', wrap(`%${value}`)];
      }
      case 'is': {
        return [fieldname, '=', value];
      }
      case 'isNot': {
        return [fieldname, '!=', value];
      }
      case 'isLessThan':
      case 'isBefore': {
        return [fieldname, '<', value];
      }
      case 'isGreaterThan':
      case 'isAfter': {
        return [fieldname, '>', value];
      }
      case 'isLessThanOrEqual':
      case 'isOnOrBefore': {
        return [fieldname, '<=', value];
      }
      case 'isGreaterThanOrEqual':
      case 'isOnOrAfter': {
        return [fieldname, '>=', value];
      }
      default: {
        return [fieldname, '=', value];
      }
    }
  },
}));
/* oxlint-enable eslint/complexity, eslint/default-case, anti-slop/no-runtime-typeof, typescript/switch-exhaustiveness-check, typescript/strict-boolean-expressions */

const { filterValueToFrappeTuple } = await import('@repo/frappe-ui');

const makeState = (partial: Partial<DataTableState>): DataTableState => partial as DataTableState;

describe(frappeTupleToFilterValue, () => {
  it('maps comparison operators', () => {
    expect(frappeTupleToFilterValue(['status', '=', 'Open'])).toStrictEqual({
      operator: 'is',
      value: 'Open',
    });
    expect(frappeTupleToFilterValue(['status', '!=', 'Open'])).toStrictEqual({
      operator: 'isNot',
      value: 'Open',
    });
    expect(frappeTupleToFilterValue(['qty', '<', 5])).toStrictEqual({
      operator: 'isLessThan',
      value: 5,
    });
    expect(frappeTupleToFilterValue(['qty', '>', 5])).toStrictEqual({
      operator: 'isGreaterThan',
      value: 5,
    });
    expect(frappeTupleToFilterValue(['qty', '<=', 5])).toStrictEqual({
      operator: 'isLessThanOrEqual',
      value: 5,
    });
    expect(frappeTupleToFilterValue(['qty', '>=', 5])).toStrictEqual({
      operator: 'isGreaterThanOrEqual',
      value: 5,
    });
  });

  it('maps multi-value operators (in / not in / between)', () => {
    expect(frappeTupleToFilterValue(['status', 'in', ['Open', 'Closed']])).toStrictEqual({
      operator: 'isAnyOf',
      // oxlint-disable-next-line sonarjs/no-undefined-assignment -- toStrictEqual pins the explicit `value: undefined` key
      value: undefined,
      values: ['Open', 'Closed'],
    });
    expect(frappeTupleToFilterValue(['status', 'not in', ['Cancelled']])).toStrictEqual({
      operator: 'isNoneOf',
      // oxlint-disable-next-line sonarjs/no-undefined-assignment -- toStrictEqual pins the explicit `value: undefined` key
      value: undefined,
      values: ['Cancelled'],
    });
    expect(frappeTupleToFilterValue(['creation', 'between', ['2026-01-01', '2026-12-31']])).toStrictEqual({
      operator: 'isBetween',
      // oxlint-disable-next-line sonarjs/no-undefined-assignment -- toStrictEqual pins the explicit `value: undefined` key
      value: undefined,
      values: ['2026-01-01', '2026-12-31'],
    });
  });

  it('maps is set / is not set to empty checks', () => {
    expect(frappeTupleToFilterValue(['email', 'is', 'set'])).toStrictEqual({
      operator: 'isNotEmpty',
      // oxlint-disable-next-line sonarjs/no-undefined-assignment -- toStrictEqual pins the explicit `value: undefined` key
      value: undefined,
    });
    expect(frappeTupleToFilterValue(['email', 'is', 'not set'])).toStrictEqual({
      operator: 'isEmpty',
      // oxlint-disable-next-line sonarjs/no-undefined-assignment -- toStrictEqual pins the explicit `value: undefined` key
      value: undefined,
    });
  });

  it('decodes like patterns into contains / startsWith / endsWith', () => {
    expect(frappeTupleToFilterValue(['name', 'like', '%corp%'])).toStrictEqual({
      operator: 'contains',
      value: 'corp',
    });
    expect(frappeTupleToFilterValue(['name', 'like', 'ada%'])).toStrictEqual({
      operator: 'startsWith',
      value: 'ada',
    });
    expect(frappeTupleToFilterValue(['name', 'like', '%.org'])).toStrictEqual({
      operator: 'endsWith',
      value: '.org',
    });
    // Raw like without wildcards normalizes to contains.
    expect(frappeTupleToFilterValue(['name', 'like', 'corp'])).toStrictEqual({
      operator: 'contains',
      value: 'corp',
    });
  });

  it('decodes not like into doesNotContain', () => {
    expect(frappeTupleToFilterValue(['name', 'not like', '%spam%'])).toStrictEqual({
      operator: 'doesNotContain',
      value: 'spam',
    });
    expect(frappeTupleToFilterValue(['name', 'not like', 'spam'])).toStrictEqual({
      operator: 'doesNotContain',
      value: 'spam',
    });
  });

  it('falls back to is for unknown operators', () => {
    expect(frappeTupleToFilterValue(['name', 'descendants of', 'Root'])).toStrictEqual({
      operator: 'is',
      value: 'Root',
    });
  });
});

describe("tuple ↔ FilterValue round-trips (against frappe-ui's real mapper)", () => {
  const roundTrippable: FrappeFilter[] = [
    ['status', '=', 'Open'],
    ['status', '!=', 'Open'],
    ['qty', '>', 5],
    ['qty', '<', 5],
    ['since', '>=', '2026-01-01'],
    ['since', '<=', '2026-12-31'],
    ['status', 'in', ['Open', 'Closed']],
    ['status', 'not in', ['Cancelled']],
    ['creation', 'between', ['2026-01-01', '2026-12-31']],
    ['email', 'is', 'set'],
    ['email', 'is', 'not set'],
    ['name', 'like', '%corp%'],
    ['name', 'like', 'ada%'],
    ['name', 'like', '%.org'],
    ['name', 'not like', '%spam%'],
  ];

  it.each(roundTrippable.map((tuple) => ({ tuple, label: JSON.stringify(tuple) })))(
    'round-trips $label',
    ({ tuple }) => {
      const filterValue = frappeTupleToFilterValue(tuple);
      expect(filterValueToFrappeTuple(tuple[0], filterValue)).toStrictEqual(tuple);
    },
  );

  it('round-trips FilterValue → tuple → FilterValue for text operators', () => {
    const values: FilterValue[] = [
      { operator: 'contains', value: 'corp' },
      { operator: 'startsWith', value: 'ada' },
      { operator: 'endsWith', value: '.org' },
      { operator: 'doesNotContain', value: 'spam' },
    ];
    for (const filterValue of values) {
      const tuple = filterValueToFrappeTuple('name', filterValue);
      expect(tuple).not.toBeNull();
      expect(frappeTupleToFilterValue(tuple as FrappeFilter)).toStrictEqual(filterValue);
    }
  });
});

describe(frappeFiltersToTableFilters, () => {
  it('maps tuples to TableFilter entries with stable ids and columnIds', () => {
    const filters: FrappeFilters = [
      ['status', '=', 'Open'],
      ['owner', 'like', '%admin%'],
    ];
    expect(frappeFiltersToTableFilters(filters)).toStrictEqual([
      { id: 'bo-status-0', columnId: 'status', value: { operator: 'is', value: 'Open' } },
      { id: 'bo-owner-1', columnId: 'owner', value: { operator: 'contains', value: 'admin' } },
    ]);
  });

  it('returns [] for no filters', () => {
    expect(frappeFiltersToTableFilters([])).toStrictEqual([]);
  });
});

describe(tableStateToFrappeFilters, () => {
  it("converts toolbar filters through frappe-ui's mapper", () => {
    const state = makeState({
      filters: [
        { id: 'f1', columnId: 'status', value: { operator: 'is', value: 'Open' } },
        { id: 'f2', columnId: 'email', value: { operator: 'contains', value: 'corp' } },
      ],
    });
    expect(tableStateToFrappeFilters(state)).toStrictEqual([
      ['status', '=', 'Open'],
      ['email', 'like', '%corp%'],
    ]);
  });

  it('skips half-built toolbar filters (no operator or empty value)', () => {
    const state = makeState({
      filters: [
        {
          id: 'f1',
          columnId: 'status',
          value: { operator: '', value: 'x' } as unknown as FilterValue,
        },
        { id: 'f2', columnId: 'email', value: { operator: 'contains', value: '' } },
        { id: 'f3', columnId: 'status', value: { operator: 'isAnyOf', value: null, values: [] } },
      ],
    });
    expect(tableStateToFrappeFilters(state)).toStrictEqual([]);
  });

  it('converts FilterValue-shaped column filters through the same mapper', () => {
    const state = makeState({
      columnFilters: [{ id: 'owner', value: { operator: 'startsWith', value: 'adm' } }],
    });
    expect(tableStateToFrappeFilters(state)).toStrictEqual([['owner', 'like', 'adm%']]);
  });

  it('treats scalar column filters as equality and skips empty ones', () => {
    const state = makeState({
      columnFilters: [
        { id: 'status', value: 'Open' },
        { id: 'qty', value: 0 },
        { id: 'empty', value: '' },
        { id: 'missing', value: null },
        // oxlint-disable-next-line sonarjs/no-undefined-assignment -- an explicitly undefined filter value is the case under test
        { id: 'gone', value: undefined },
      ],
    });
    expect(tableStateToFrappeFilters(state)).toStrictEqual([
      ['status', '=', 'Open'],
      ['qty', '=', 0],
    ]);
  });

  it('maps global search to name like', () => {
    const state = makeState({ globalFilter: 'todo' });
    expect(tableStateToFrappeFilters(state)).toStrictEqual([['name', 'like', '%todo%']]);
  });

  it('ignores blank global search', () => {
    expect(tableStateToFrappeFilters(makeState({ globalFilter: '   ' }))).toStrictEqual([]);
    expect(tableStateToFrappeFilters(makeState({ globalFilter: '' }))).toStrictEqual([]);
  });

  it('combines all three sources in order (filters, columnFilters, globalFilter)', () => {
    const state = makeState({
      filters: [{ id: 'f1', columnId: 'status', value: { operator: 'is', value: 'Open' } }],
      columnFilters: [{ id: 'priority', value: 'High' }],
      globalFilter: 'urgent',
    });
    expect(tableStateToFrappeFilters(state)).toStrictEqual([
      ['status', '=', 'Open'],
      ['priority', '=', 'High'],
      ['name', 'like', '%urgent%'],
    ]);
  });

  it('handles a state with no filter sources at all', () => {
    expect(tableStateToFrappeFilters(makeState({}))).toStrictEqual([]);
  });
});

describe(sameFilterTuple, () => {
  it('matches identical tuples', () => {
    expect(sameFilterTuple(['status', '=', 'Open'], ['status', '=', 'Open'])).toBe(true);
  });

  it("compares values loosely via String (1 vs '1')", () => {
    expect(sameFilterTuple(['enabled', '=', 1], ['enabled', '=', '1'])).toBe(true);
  });

  it('rejects differing field, operator, or value', () => {
    expect(sameFilterTuple(['status', '=', 'Open'], ['priority', '=', 'Open'])).toBe(false);
    expect(sameFilterTuple(['status', '=', 'Open'], ['status', '!=', 'Open'])).toBe(false);
    expect(sameFilterTuple(['status', '=', 'Open'], ['status', '=', 'Closed'])).toBe(false);
  });
});

describe(toggleFilterTuple, () => {
  it('adds a tuple when absent', () => {
    const filters: FrappeFilters = [['status', '=', 'Open']];
    expect(toggleFilterTuple(filters, ['priority', '=', 'High'])).toStrictEqual([
      ['status', '=', 'Open'],
      ['priority', '=', 'High'],
    ]);
  });

  it('removes a tuple when present (loose value match)', () => {
    const filters: FrappeFilters = [
      ['status', '=', 'Open'],
      ['enabled', '=', '1'],
    ];
    expect(toggleFilterTuple(filters, ['enabled', '=', 1])).toStrictEqual([['status', '=', 'Open']]);
  });

  it('does not mutate the input list', () => {
    const filters: FrappeFilters = [['status', '=', 'Open']];
    toggleFilterTuple(filters, ['status', '=', 'Open']);
    toggleFilterTuple(filters, ['priority', '=', 'High']);
    expect(filters).toStrictEqual([['status', '=', 'Open']]);
  });
});
