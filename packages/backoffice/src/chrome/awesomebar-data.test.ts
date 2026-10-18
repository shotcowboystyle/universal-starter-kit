import { describe, expect, it } from 'vitest';

import { matchQueryIndices, rankNameMatches } from './awesomebar-data';

describe(matchQueryIndices, () => {
  it('returns empty indices for an empty query', () => {
    expect(matchQueryIndices('', 'ToDo')).toStrictEqual([]);
    expect(matchQueryIndices('   ', 'ToDo')).toStrictEqual([]);
  });

  it('returns contiguous indices for a substring (Frappe prefix/contains)', () => {
    expect(matchQueryIndices('todo', 'ToDo')).toStrictEqual([0, 1, 2, 3]);
    expect(matchQueryIndices('do', 'ToDo')).toStrictEqual([2, 3]);
  });

  it('returns subsequence indices when the query is not contiguous (Linear/Spotlight)', () => {
    expect(matchQueryIndices('tdo', 'ToDo')).toStrictEqual([0, 2, 3]);
    expect(matchQueryIndices('so', 'Sales Order')).toStrictEqual([0, 6]);
  });

  it('returns null when no subsequence exists', () => {
    expect(matchQueryIndices('xyz', 'ToDo')).toBeNull();
  });
});

describe(rankNameMatches, () => {
  const names = ['ToDo', 'ToDo Template', 'Note', 'User', 'Sales Order', 'Sales Invoice'];

  it('ranks a prefix match first and shorter names ahead of longer ones', () => {
    expect(rankNameMatches('todo', names, 4)[0]).toBe('ToDo');
  });

  it('matches a subsequence that substring matching would miss', () => {
    expect(rankNameMatches('tdo', names, 4)).toContain('ToDo');
  });

  it('ranks word-start initials above later subsequence hits', () => {
    const ranked = rankNameMatches('so', names, 4);
    expect(ranked[0]).toBe('Sales Order');
    expect(ranked).toContain('Sales Invoice');
  });

  it('returns an empty list for no matches or an empty query', () => {
    expect(rankNameMatches('zzz', names, 4)).toStrictEqual([]);
    expect(rankNameMatches('', names, 4)).toStrictEqual([]);
  });
});
