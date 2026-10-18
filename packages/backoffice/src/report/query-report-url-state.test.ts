// `?filters=` codec specs — the query-report deep-link contract
// (query-report-url-state.ts documents the schema; list `?f=` sibling).
import { describe, expect, it } from 'vitest';

import { parseQueryReportFiltersParam, serializeQueryReportFiltersParam } from './query-report-url-state';

describe(parseQueryReportFiltersParam, () => {
  it('parses a raw JSON object param', () => {
    expect(parseQueryReportFiltersParam('{"status":"Open","limit":20}')).toStrictEqual({
      status: 'Open',
      limit: 20,
    });
  });

  it('parses a percent-encoded param (router handed it through raw)', () => {
    expect(parseQueryReportFiltersParam('%7B%22user%22%3A%22test%40example.com%22%7D')).toStrictEqual({
      user: 'test@example.com',
    });
  });

  it('takes the first value of a repeated param', () => {
    expect(parseQueryReportFiltersParam(['{"a":"1"}', '{"a":"2"}'])).toStrictEqual({ a: '1' });
  });

  it('keeps scalar values only and drops empty strings', () => {
    expect(
      parseQueryReportFiltersParam('{"s":"x","n":3,"b":true,"empty":"","arr":[1],"obj":{"x":1},"nil":null}'),
    ).toStrictEqual({ s: 'x', n: 3, b: true });
  });

  it('degrades malformed input to no filters', () => {
    expect(parseQueryReportFiltersParam()).toStrictEqual({});
    expect(parseQueryReportFiltersParam('')).toStrictEqual({});
    expect(parseQueryReportFiltersParam('not json')).toStrictEqual({});
    expect(parseQueryReportFiltersParam('["status","=","Open"]')).toStrictEqual({});
    expect(parseQueryReportFiltersParam('%E0%A4%A')).toStrictEqual({});
  });
});

describe(serializeQueryReportFiltersParam, () => {
  it('serializes scalar values with sorted keys (stable echo comparison)', () => {
    expect(serializeQueryReportFiltersParam({ b: '2', a: '1' })).toBe('{"a":"1","b":"2"}');
  });

  it('drops empty values and non-scalars; empty state drops the param', () => {
    // oxlint-disable-next-line sonarjs/no-undefined-assignment -- an undefined value is one of the empties under test
    expect(serializeQueryReportFiltersParam({ a: '', b: null, c: undefined, d: ['x'] })).toBeUndefined();
    expect(serializeQueryReportFiltersParam({})).toBeUndefined();
  });

  it('round-trips through the parser', () => {
    const filters = { status: 'Open', from_date: '2026-08-01', show_permissions: 1 };
    const serialized = serializeQueryReportFiltersParam(filters);
    expect(parseQueryReportFiltersParam(serialized)).toStrictEqual(filters);
  });
});
