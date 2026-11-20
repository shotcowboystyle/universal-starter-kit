import { describe, expect, it } from 'vitest';

import type { TableFilter } from '../types';

import { serializeTableState, deserializeTableState, validateUrlState } from './url-state-utils';

const mkFilter = (id: string, value: string): TableFilter => ({
  id,
  columnId: id,
  value: { operator: 'is', value },
});

describe(serializeTableState, () => {
  it('serializes pagination (1-based page)', () => {
    const result = serializeTableState({
      pagination: { pageIndex: 2, pageSize: 25 },
    });
    expect(result.page).toBe('3');
    expect(result.pageSize).toBe('25');
  });

  it('serializes sorting', () => {
    const result = serializeTableState({
      sorting: [
        { id: 'name', desc: false },
        { id: 'date', desc: true },
      ],
    });
    expect(result.sort).toBe('name:asc,date:desc');
  });

  it('serializes filters as base64 JSON', () => {
    const filters = [mkFilter('status', 'active')];
    const result = serializeTableState({ filters });
    expect(JSON.parse(atob(result.filters))).toStrictEqual(filters);
  });

  it('serializes global filter as search', () => {
    const result = serializeTableState({ globalFilter: 'hello' });
    expect(result.search).toBe('hello');
  });

  it('serializes active view', () => {
    const result = serializeTableState({ activeViewId: 'view-1' });
    expect(result.view).toBe('view-1');
  });

  it('returns empty object for empty state', () => {
    expect(serializeTableState({})).toStrictEqual({});
  });

  it('omits empty sorting array', () => {
    const result = serializeTableState({ sorting: [] });
    expect(result.sort).toBeUndefined();
  });

  it('omits empty filters array', () => {
    const result = serializeTableState({ filters: [] });
    expect(result.filters).toBeUndefined();
  });
});

describe(deserializeTableState, () => {
  it('deserializes pagination (converts to 0-based)', () => {
    const result = deserializeTableState({ page: '3', pageSize: '25' });
    expect(result.pagination).toStrictEqual({ pageIndex: 2, pageSize: 25 });
  });

  it('defaults page size to 25 when not provided (DG-TBL-04)', () => {
    const result = deserializeTableState({ page: '1' });
    expect(result.pagination).toStrictEqual({ pageIndex: 0, pageSize: 25 });
  });

  it('deserializes sorting', () => {
    const result = deserializeTableState({ sort: 'name:asc,date:desc' });
    expect(result.sorting).toStrictEqual([
      { id: 'name', desc: false },
      { id: 'date', desc: true },
    ]);
  });

  it('deserializes filters from base64', () => {
    const filters = [mkFilter('status', 'active')];
    const result = deserializeTableState({
      filters: btoa(JSON.stringify(filters)),
    });
    expect(result.filters).toStrictEqual(filters);
  });

  it('deserializes search', () => {
    const result = deserializeTableState({ search: 'query' });
    expect(result.globalFilter).toBe('query');
  });

  it('deserializes active view', () => {
    const result = deserializeTableState({ view: 'v2' });
    expect(result.activeViewId).toBe('v2');
  });

  it('returns empty state for empty input', () => {
    expect(deserializeTableState({})).toStrictEqual({});
  });

  it('handles invalid page number gracefully', () => {
    const result = deserializeTableState({ page: 'abc' });
    expect(result.pagination).toBeUndefined();
  });

  it('handles invalid filters gracefully', () => {
    const result = deserializeTableState({ filters: 'not-base64!' });
    expect(result.filters).toBeUndefined();
  });
});

describe('serializeTableState + deserializeTableState roundtrip', () => {
  it('roundtrips pagination', () => {
    const original = { pagination: { pageIndex: 4, pageSize: 50 } };
    const serialized = serializeTableState(original);
    const deserialized = deserializeTableState(serialized);
    expect(deserialized.pagination).toStrictEqual(original.pagination);
  });

  it('roundtrips sorting', () => {
    const original = {
      sorting: [
        { id: 'col1', desc: true },
        { id: 'col2', desc: false },
      ],
    };
    const serialized = serializeTableState(original);
    const deserialized = deserializeTableState(serialized);
    expect(deserialized.sorting).toStrictEqual(original.sorting);
  });

  it('roundtrips filters', () => {
    const original = {
      filters: [mkFilter('status', 'active'), mkFilter('type', 'user')],
    };
    const serialized = serializeTableState(original);
    const deserialized = deserializeTableState(serialized);
    expect(deserialized.filters).toStrictEqual(original.filters);
  });
});

describe(validateUrlState, () => {
  it('returns valid for empty state', () => {
    expect(validateUrlState({})).toStrictEqual({ isValid: true, errors: [] });
  });

  it('validates correct state', () => {
    const result = validateUrlState({
      page: '1',
      pageSize: '10',
      sort: 'name:asc',
      filters: btoa(JSON.stringify([])),
    });
    expect(result.isValid).toBe(true);
  });

  it('rejects invalid page number', () => {
    const result = validateUrlState({ page: 'abc' });
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Invalid page number');
  });

  it('rejects zero page number', () => {
    const result = validateUrlState({ page: '0' });
    expect(result.isValid).toBe(false);
  });

  it('rejects invalid page size', () => {
    const result = validateUrlState({ pageSize: '-5' });
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Invalid page size');
  });

  it('rejects sort without direction', () => {
    const result = validateUrlState({ sort: 'name' });
    expect(result.isValid).toBe(false);
    expect(result.errors[0]).toContain('Invalid sort parameter');
  });

  it('rejects sort with invalid direction', () => {
    const result = validateUrlState({ sort: 'name:up' });
    expect(result.isValid).toBe(false);
  });

  it('rejects non-base64 filters', () => {
    const result = validateUrlState({ filters: 'not-base64!' });
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Invalid filters format');
  });

  it('rejects non-array filters', () => {
    const result = validateUrlState({ filters: btoa('{"not":"array"}') });
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Filters must be an array');
  });
});
