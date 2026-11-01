import { describe, expect, it } from 'vitest';

import { adjacentRecords, childBars, groupRows, recordFacetValues, recordHistory, sortRows } from './record-data';

const facet = {
  param: 'type',
  doctype: 'Pokemon Poke Type',
  field: 'poke_type',
  orderBy: 'slot',
  options: [],
  label: 'Type',
};

describe(recordFacetValues, () => {
  it("reads a connection facet's values off the record's linked rows in slot order", () => {
    const connections = {
      'Pokemon Poke Type': [
        { name: 'b', poke_type: 'poison', slot: 2 },
        { name: 'a', poke_type: 'grass', slot: 1 },
      ],
    };
    expect(recordFacetValues(facet, {}, connections)).toStrictEqual(['grass', 'poison']);
  });

  it('reads a field facet off the record itself', () => {
    // oxlint-disable-next-line sonarjs/no-undefined-assignment -- clears the spread facet's doctype to reach the own-field path
    const own = { ...facet, doctype: undefined, field: 'status' };
    expect(recordFacetValues(own, { status: 'Open' }, {})).toStrictEqual(['Open']);
    expect(recordFacetValues(own, {}, {})).toStrictEqual([]);
  });
});

describe(sortRows, () => {
  it('orders by each key in turn, numbers numerically and text alphabetically', () => {
    const rows = [
      { method: 'machine', level: 0, move: 'toxic' },
      { method: 'level-up', level: 13, move: 'vine-whip' },
      { method: 'level-up', level: 1, move: 'tackle' },
      { method: 'level-up', level: 1, move: 'growl' },
    ];
    expect(sortRows(rows, ['method', 'level', 'move']).map((row) => row.move)).toStrictEqual([
      'growl',
      'tackle',
      'vine-whip',
      'toxic',
    ]);
  });

  it('leaves the rows as they came without keys', () => {
    const rows = [{ n: 2 }, { n: 1 }];
    expect(sortRows(rows, [])).toStrictEqual(rows);
  });
});

describe(groupRows, () => {
  it('groups by a field in the order the values first appear', () => {
    const rows = [
      { method: 'level-up', move: 'a' },
      { method: 'machine', move: 'b' },
      { method: 'level-up', move: 'c' },
    ];
    expect(groupRows(rows, 'method')).toStrictEqual([
      { value: 'level-up', rows: [rows[0], rows[2]] },
      { value: 'machine', rows: [rows[1]] },
    ]);
  });
});

describe(adjacentRecords, () => {
  const rows = [{ name: 'a' }, { name: 'b' }, { name: 'c' }];

  it('names the records either side without wrapping', () => {
    expect(adjacentRecords(rows, 'b')).toStrictEqual({ prev: rows[0], next: rows[2] });
    expect(adjacentRecords(rows, 'a')).toStrictEqual({ prev: null, next: rows[1] });
    expect(adjacentRecords(rows, 'c')).toStrictEqual({ prev: rows[1], next: null });
  });

  it('has no neighbors for a record the list does not hold', () => {
    expect(adjacentRecords(rows, 'z')).toStrictEqual({ prev: null, next: null });
  });
});

describe(recordHistory, () => {
  it('lists the last edit then the creation, newest first', () => {
    expect(
      recordHistory({
        name: 'pikachu',
        owner: 'ash@example.com',
        creation: '2026-09-01 10:00:00',
        modified: '2026-09-02 11:00:00',
        modified_by: 'misty@example.com',
      }),
    ).toStrictEqual([
      { kind: 'modified', author: 'misty@example.com', timestamp: '2026-09-02 11:00:00' },
      { kind: 'created', author: 'ash@example.com', timestamp: '2026-09-01 10:00:00' },
    ]);
  });

  it('shows only the creation when the record was never edited', () => {
    expect(recordHistory({ owner: 'ash', creation: '2026-09-01', modified: '2026-09-01' })).toStrictEqual([
      { kind: 'created', author: 'ash', timestamp: '2026-09-01' },
    ]);
  });

  it('is empty without audit fields', () => {
    expect(recordHistory({})).toStrictEqual([]);
  });
});

describe(childBars, () => {
  const stats = [
    { stat_name: 'speed', base_stat: 90 },
    { stat_name: 'hp', base_stat: 35 },
    { stat_name: 'attack', base_stat: 55 },
  ];

  it('orders the child rows by the declared order and sums them', () => {
    expect(
      childBars(stats, {
        label: 'stat_name',
        value: 'base_stat',
        order: ['hp', 'attack', 'speed'],
      }),
    ).toStrictEqual({
      bars: [
        { key: 'hp', value: 35 },
        { key: 'attack', value: 55 },
        { key: 'speed', value: 90 },
      ],
      total: 180,
    });
  });

  it('keeps undeclared rows after the declared ones and reads a missing value as zero', () => {
    expect(
      childBars([{ stat_name: 'luck' }, ...stats], {
        label: 'stat_name',
        value: 'base_stat',
        order: ['hp'],
      }).bars.map((bar) => `${bar.key}:${bar.value}`),
    ).toStrictEqual(['hp:35', 'luck:0', 'speed:90', 'attack:55']);
  });
});
