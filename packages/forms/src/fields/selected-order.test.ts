import { describe, expect, it } from 'vitest';

import { orderOptionsBySelected } from './selected-order';

const options = [
  { value: 'apple', label: 'Apple' },
  { value: 'banana', label: 'Banana' },
  { value: 'cherry', label: 'Cherry' },
];

describe(orderOptionsBySelected, () => {
  it('selected-first pins chosen rows to the top, alphabetically among themselves', () => {
    const ordered = orderOptionsBySelected(options, ['cherry', 'apple'], 'selected-first');
    expect(ordered.map((o) => o.value)).toStrictEqual(['apple', 'cherry', 'banana']);
  });

  it('stable leaves options in the given order', () => {
    const ordered = orderOptionsBySelected(options, ['cherry'], 'stable');
    expect(ordered.map((o) => o.value)).toStrictEqual(['apple', 'banana', 'cherry']);
  });

  it('defaults to selected-first', () => {
    const ordered = orderOptionsBySelected(options, ['banana']);
    expect(ordered.map((o) => o.value)).toStrictEqual(['banana', 'apple', 'cherry']);
  });

  it('does not pin when nothing is selected', () => {
    expect(orderOptionsBySelected(options, [], 'selected-first')).toStrictEqual(options);
  });
});
