import { describe, expect, it } from 'vitest';

import {
  average,
  bucketWidth,
  facetDistribution,
  foldDistribution,
  histogram,
  multiValued,
  orderRows,
  topBy,
} from './insights-data';

const rows = [
  { name: 'bulbasaur', xp: 64, height: 7 },
  { name: 'charmander', xp: 62, height: 6 },
  { name: 'charizard', xp: 240, height: 17 },
  { name: 'pikachu', xp: 112, height: 4 },
  { name: 'mew', xp: null, height: 4 },
];

const types = new Map<string, string[]>([
  ['bulbasaur', ['grass', 'poison']],
  ['charmander', ['fire']],
  ['charizard', ['fire', 'flying']],
  ['pikachu', ['electric']],
  ['missingno', ['normal']],
]);

describe(facetDistribution, () => {
  it('counts the listed records per value, most common first, ties A to Z', () => {
    expect(facetDistribution(types, rows)).toStrictEqual([
      { value: 'fire', count: 2 },
      { value: 'electric', count: 1 },
      { value: 'flying', count: 1 },
      { value: 'grass', count: 1 },
      { value: 'poison', count: 1 },
    ]);
  });

  it('ignores values of records outside the rows', () => {
    expect(facetDistribution(types, rows).some((entry) => entry.value === 'normal')).toBe(false);
  });
});

describe(foldDistribution, () => {
  const entries = facetDistribution(types, rows);

  it('keeps a distribution that fits', () => {
    expect(foldDistribution(entries, 5)).toStrictEqual(entries);
  });

  it('folds the tail into one other entry holding its sum', () => {
    expect(foldDistribution(entries, 3)).toStrictEqual([
      { value: 'fire', count: 2 },
      { value: 'electric', count: 1 },
      { value: '', count: 3, other: true },
    ]);
  });
});

describe(multiValued, () => {
  it('counts the listed records carrying more than one value', () => {
    expect(multiValued(types, rows)).toBe(2);
  });
});

describe(average, () => {
  it('means a field over every row, a missing value as 0', () => {
    expect(average(rows, 'xp')).toBeCloseTo((64 + 62 + 240 + 112) / 5);
  });

  it('is 0 for no rows', () => {
    expect(average([], 'xp')).toBe(0);
  });
});

describe(topBy, () => {
  it("ranks by a field, largest first, ties in the rows' order", () => {
    expect(topBy(rows, 'height', 3).map((row) => row.name)).toStrictEqual(['charizard', 'bulbasaur', 'charmander']);
    expect(
      topBy(rows, 'height', 5)
        .slice(3)
        .map((row) => row.name),
    ).toStrictEqual(['pikachu', 'mew']);
  });

  it('never mutates its input', () => {
    const before = rows.map((row) => row.name);
    topBy(rows, 'xp', 2);
    expect(rows.map((row) => row.name)).toStrictEqual(before);
  });
});

describe(histogram, () => {
  it('buckets a field from 0 and keeps the empty buckets between', () => {
    expect(histogram(rows, 'xp', 60)).toStrictEqual([
      { label: '0–59', value: 1 },
      { label: '60–119', value: 3 },
      { label: '120–179', value: 0 },
      { label: '180–239', value: 0 },
      { label: '240–299', value: 1 },
    ]);
  });

  it('is empty for no rows', () => {
    expect(histogram([], 'xp', 60)).toStrictEqual([]);
  });

  it('picks a round width for about six buckets when none is given', () => {
    expect(bucketWidth(240)).toBe(50);
    expect(bucketWidth(17)).toBe(5);
    expect(bucketWidth(0)).toBe(1);
    expect(histogram(rows, 'height').map((bucket) => bucket.label)).toStrictEqual(['0–4', '5–9', '10–14', '15–19']);
  });
});

describe(orderRows, () => {
  it('orders by each key in turn, a missing value first ascending', () => {
    expect(
      orderRows(rows, [
        { field: 'height', order: 'desc' },
        { field: 'name', order: 'asc' },
      ]).map((row) => row.name),
    ).toStrictEqual(['charizard', 'bulbasaur', 'charmander', 'mew', 'pikachu']);
    expect(orderRows(rows, [{ field: 'xp', order: 'asc' }])[0].name).toBe('mew');
  });

  it('keeps the rows as they are without an order, and never mutates them', () => {
    // oxlint-disable-next-line unicorn/no-useless-undefined -- the parameter is required; undefined is the case under test
    expect(orderRows(rows, undefined)).toStrictEqual(rows);
    // A serialised "no order" (JSON.parse('null')) used to throw on `.length`.
    expect(orderRows(rows, null)).toStrictEqual(rows);
    const before = rows.map((row) => row.name);
    orderRows(rows, [{ field: 'xp', order: 'desc' }]);
    expect(rows.map((row) => row.name)).toStrictEqual(before);
  });
});
