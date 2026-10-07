// `?filters=` codec specs — the query-report deep-link contract
// (queryReportUrlState.ts documents the schema; list `?f=` sibling).
import { describe, expect, it } from 'vitest';

import { parseQueryReportFiltersParam, serializeQueryReportFiltersParam } from './queryReportUrlState';

describe(parseQueryReportFiltersParam, () => {
  it('parses a raw JSON object param', () => {
    expect(parseQueryReportFiltersParam('{"status":"Open","limit":20}')).toEqual({
      status: 'Open',
      limit: 20,
    });
  });

  it('parses a percent-encoded param (router handed it through raw)', () => {
    expect(parseQueryReportFiltersParam('%7B%22user%22%3A%22test%40example.com%22%7D')).toEqual({
      user: 'test@example.com',
    });
  });

  it('takes the first value of a repeated param', () => {
    expect(parseQueryReportFiltersParam(['{"a":"1"}', '{"a":"2"}'])).toEqual({ a: '1' });
  });

  it('keeps scalar values only and drops empty strings', () => {
    expect(
      parseQueryReportFiltersParam('{"s":"x","n":3,"b":true,"empty":"","arr":[1],"obj":{"x":1},"nil":null}'),
    ).toEqual({ s: 'x', n: 3, b: true });
  });

  it('degrades malformed input to no filters', () => {
    expect(parseQueryReportFiltersParam()).toEqual({});
    expect(parseQueryReportFiltersParam('')).toEqual({});
    expect(parseQueryReportFiltersParam('not json')).toEqual({});
    expect(parseQueryReportFiltersParam('["status","=","Open"]')).toEqual({});
    expect(parseQueryReportFiltersParam('%E0%A4%A')).toEqual({});
  });
});

describe(serializeQueryReportFiltersParam, () => {
  it('serializes scalar values with sorted keys (stable echo comparison)', () => {
    expect(serializeQueryReportFiltersParam({ b: '2', a: '1' })).toBe('{"a":"1","b":"2"}');
  });

  it('drops empty values and non-scalars; empty state drops the param', () => {
    expect(serializeQueryReportFiltersParam({ a: '', b: null, c: undefined, d: ['x'] })).toBeUndefined();
    expect(serializeQueryReportFiltersParam({})).toBeUndefined();
  });

  it('round-trips through the parser', () => {
    const filters = { status: 'Open', from_date: '2026-08-01', show_permissions: 1 };
    const serialized = serializeQueryReportFiltersParam(filters);
    expect(parseQueryReportFiltersParam(serialized)).toEqual(filters);
  });
});
