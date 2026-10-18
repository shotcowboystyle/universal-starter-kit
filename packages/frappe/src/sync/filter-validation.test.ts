/**
 * Filter toolkit contracts beyond matchesFilters (covered in filters.spec):
 * schema validation (validateFilters strict/lenient), normalization of
 * object filters to tuples, filter-field extraction, display formatting,
 * getDoc fast-path extraction (extractSingleName), and the tree-operator
 * client/server evaluation gate the sync engine keys off.
 */

import { describe, expect, it } from 'vitest';

import {
  canEvaluateClientSide,
  extractFilterFields,
  extractSingleName,
  FilterOperator,
  formatFilter,
  getClientEvaluationBlockers,
  hasServerOnlyOperators,
  isTreeOperator,
  normalizeFilters,
  validateFilters,
} from './filters';
import type { FilterTuple } from './filters';

const schema = [
  { fieldname: 'title', fieldtype: 'Data' },
  { fieldname: 'amount', fieldtype: 'Currency' },
  { fieldname: 'status', fieldtype: 'Select' },
  { fieldname: 'attachment', fieldtype: 'Attach' },
];

describe(validateFilters, () => {
  it('passes valid filters against the schema', () => {
    const result = validateFilters(
      [
        ['title', 'like', '%report%'],
        ['amount', '>', 100],
        ['status', 'in', ['Open', 'Closed']],
      ],
      schema,
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toStrictEqual([]);
    expect(result.warnings).toStrictEqual([]);
  });

  it('treats empty filters as valid', () => {
    expect(validateFilters(null, schema).valid).toBe(true);
    expect(validateFilters(undefined, schema).valid).toBe(true);
  });

  it('accepts standard fields that are not in the schema', () => {
    const result = validateFilters([['modified', '>', '2024-01-01']], schema);
    expect(result.valid).toBe(true);
    expect(result.warnings).toStrictEqual([]);
  });

  it('warns about unknown fields by default but errors in strict mode', () => {
    const lenient = validateFilters([['custom_field', '=', 1]], schema);
    expect(lenient.valid).toBe(true);
    expect(lenient.warnings[0]).toContain('custom_field');

    const strict = validateFilters([['custom_field', '=', 1]], schema, { strict: true });
    expect(strict.valid).toBe(false);
    expect(strict.errors[0]).toMatchObject({ field: 'custom_field', code: 'unknown_field' });
  });

  it('rejects invalid operators', () => {
    const result = validateFilters([['title', 'resembles', 'x']], schema);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatchObject({ field: 'title', code: 'invalid_operator' });
  });

  it('warns when LIKE is used on non-text fields', () => {
    const result = validateFilters([['amount', 'like', '%5%']], schema);
    expect(result.valid).toBe(true);
    expect(result.warnings[0]).toContain('LIKE operator on non-text field');
  });

  it('warns when comparisons hit non-comparable fields', () => {
    const result = validateFilters([['attachment', '>', 3]], schema);
    expect(result.valid).toBe(true);
    expect(result.warnings[0]).toContain('Comparison operator on non-numeric/date field');
  });

  it('requires arrays for IN and exactly two values for BETWEEN', () => {
    const inResult = validateFilters([['status', 'in', 'Open']], schema);
    expect(inResult.valid).toBe(false);
    expect(inResult.errors[0].code).toBe('invalid_value');

    const betweenResult = validateFilters([['amount', 'between', [1]]], schema);
    expect(betweenResult.valid).toBe(false);
    expect(betweenResult.errors[0].code).toBe('invalid_value');

    const ok = validateFilters([['amount', 'between', [1, 10]]], schema);
    expect(ok.valid).toBe(true);
  });

  it('validates object-format filters for unknown fields', () => {
    const lenient = validateFilters({ ghost: 1, title: 'x' }, schema);
    expect(lenient.valid).toBe(true);
    expect(lenient.warnings).toHaveLength(1);

    const strict = validateFilters({ ghost: 1 }, schema, { strict: true });
    expect(strict.valid).toBe(false);
    expect(strict.errors[0].field).toBe('ghost');
  });
});

describe('normalizeFilters / extractFilterFields', () => {
  it('passes tuple filters through and converts object filters to equality tuples', () => {
    const tuples: FilterTuple[] = [['title', 'like', '%x%']];
    expect(normalizeFilters(tuples)).toBe(tuples);
    expect(normalizeFilters({ status: 'Open', amount: 5 })).toStrictEqual([
      ['status', FilterOperator.Equals, 'Open'],
      ['amount', FilterOperator.Equals, 5],
    ]);
    expect(normalizeFilters(null)).toStrictEqual([]);
  });

  it('extracts unique filter field names', () => {
    expect(
      extractFilterFields([
        ['title', 'like', '%a%'],
        ['title', '!=', 'b'],
        ['amount', '>', 1],
      ]),
    ).toStrictEqual(['title', 'amount']);
    expect(extractFilterFields(null)).toStrictEqual([]);
  });
});

describe(formatFilter, () => {
  it('formats scalar, string, array, and null values', () => {
    expect(formatFilter(['amount', '>', 5])).toBe('amount > 5');
    expect(formatFilter(['title', 'like', '%x%'])).toBe('title like "%x%"');
    expect(formatFilter(['status', 'in', ['a', 'b']])).toBe('status in ["a", "b"]');
    expect(formatFilter(['parent', 'is', null])).toBe('parent is null');
  });
});

describe('extractSingleName (getDoc fast path)', () => {
  it('extracts the name from a single name-equality tuple', () => {
    expect(extractSingleName([['name', '=', 'DOC-001']])).toBe('DOC-001');
    expect(extractSingleName([['name', '==', 'DOC-002']])).toBe('DOC-002');
  });

  it('extracts the name from an object filter', () => {
    expect(extractSingleName({ name: 'DOC-003' })).toBe('DOC-003');
  });

  it('refuses multi-filter, non-name, non-equality, and non-string cases', () => {
    expect(
      extractSingleName([
        ['name', '=', 'DOC-001'],
        ['status', '=', 'Open'],
      ]),
    ).toBeUndefined();
    expect(extractSingleName([['title', '=', 'DOC-001']])).toBeUndefined();
    expect(extractSingleName([['name', 'like', 'DOC-%']])).toBeUndefined();
    expect(extractSingleName([['name', '=', 42]])).toBeUndefined();
    expect(extractSingleName(null)).toBeUndefined();
  });
});

describe('tree-operator evaluation gate', () => {
  it('classifies tree operators as server-only', () => {
    expect(isTreeOperator('ancestors of')).toBe(true);
    expect(isTreeOperator('DESCENDANTS OF')).toBe(true);
    expect(isTreeOperator('not ancestors of')).toBe(true);
    expect(isTreeOperator('not descendants of')).toBe(true);
    expect(isTreeOperator('=')).toBe(false);
    expect(isTreeOperator('like')).toBe(false);
  });

  it('detects server-only operators inside filters', () => {
    expect(hasServerOnlyOperators([['parent', 'ancestors of', 'Root']])).toBe(true);
    expect(hasServerOnlyOperators([['title', 'like', '%x%']])).toBe(false);
    expect(hasServerOnlyOperators(null)).toBe(false);
    expect(hasServerOnlyOperators({ status: 'Open' })).toBe(false);
  });

  it('canEvaluateClientSide is the inverse gate', () => {
    expect(canEvaluateClientSide([['parent', 'descendants of', 'Root']])).toBe(false);
    expect(canEvaluateClientSide([['status', '=', 'Open']])).toBe(true);
  });

  it('explains exactly which fields block client evaluation', () => {
    const blockers = getClientEvaluationBlockers([
      ['parent', 'ancestors of', 'Root'],
      ['status', '=', 'Open'],
    ]);
    expect(blockers).toHaveLength(1);
    expect(blockers[0]).toContain('"parent"');
    expect(blockers[0]).toContain('ancestors of');
    expect(getClientEvaluationBlockers(null)).toStrictEqual([]);
  });
});
