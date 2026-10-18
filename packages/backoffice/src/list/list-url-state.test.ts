/**
 * list-url-state — the `?f=` / `?sort=` codec behind the list's URL
 * round-trip (URL-state parity rule candidate: inbound AND outbound).
 */
import { describe, expect, it } from 'vitest';

import type { FrappeFilters } from '../shared/types';

import { parseFiltersParam, parseSortParam, serializeFiltersParam, serializeSortParam } from './list-url-state';

describe('filters param (?f=)', () => {
  it('round-trips filter tuples through serialize → parse', () => {
    const filters: FrappeFilters = [
      ['status', '=', 'Open'],
      ['priority', 'in', ['High', 'Medium']],
      ['description', 'like', '%probe%'],
    ];
    expect(parseFiltersParam(serializeFiltersParam(filters))).toStrictEqual(filters);
  });

  it('serializes empty filters to undefined (param dropped from the URL)', () => {
    expect(serializeFiltersParam([])).toBeUndefined();
  });

  it('parses urlencoded input (router that did not pre-decode)', () => {
    const encoded = encodeURIComponent(JSON.stringify([['status', '=', 'Open']]));
    expect(parseFiltersParam(encoded)).toStrictEqual([['status', '=', 'Open']]);
  });

  it('degrades malformed input to no filters', () => {
    expect(parseFiltersParam()).toStrictEqual([]);
    expect(parseFiltersParam('')).toStrictEqual([]);
    expect(parseFiltersParam('not json')).toStrictEqual([]);
    expect(parseFiltersParam('{"a":1}')).toStrictEqual([]);
    expect(parseFiltersParam('[[1,2,3]]')).toStrictEqual([]);
  });

  it('treats the one-router removal sentinel ("undefined") as no filters', () => {
    // The one adapter clears a param by writing the literal "undefined"
    // (one's URL serializer drops it); a stale echo must parse to empty.
    expect(parseFiltersParam('undefined')).toStrictEqual([]);
  });

  it('normalizes tuples to three entries and drops malformed rows', () => {
    expect(parseFiltersParam(JSON.stringify([['a', '=', 'b', 'extra'], ['short']]))).toStrictEqual([['a', '=', 'b']]);
  });
});

describe('sort param (?sort=<fieldname>.<asc|desc>)', () => {
  it('round-trips sort state through serialize → parse', () => {
    expect(parseSortParam(serializeSortParam({ field: 'priority', order: 'asc' }))).toStrictEqual({
      field: 'priority',
      order: 'asc',
    });
  });

  it('parses underscore fieldnames (desk facet columns)', () => {
    expect(parseSortParam('_liked_by.desc')).toStrictEqual({ field: '_liked_by', order: 'desc' });
  });

  it('rejects malformed values', () => {
    expect(parseSortParam()).toBeUndefined();
    expect(parseSortParam('')).toBeUndefined();
    expect(parseSortParam('modified')).toBeUndefined();
    expect(parseSortParam('modified.sideways')).toBeUndefined();
    expect(parseSortParam('.desc')).toBeUndefined();
  });

  it('treats the one-router removal sentinel ("undefined") as no sort', () => {
    expect(parseSortParam('undefined')).toBeUndefined();
  });

  it('accepts urlencoded input (defensive decode)', () => {
    expect(parseSortParam(encodeURIComponent('due_date.asc'))).toStrictEqual({
      field: 'due_date',
      order: 'asc',
    });
  });
});
