import { describe, expect, it } from 'vitest';

import {
  DRAWN_ICON_NAMES,
  filterDrawnIcons,
  isDrawnIconName,
  parseIconOptions,
  resolveIconCatalog,
} from './drawn-icon-names';

describe('drawn icon set', () => {
  it('exposes the measured console-sheet names and no more', () => {
    expect(DRAWN_ICON_NAMES).toStrictEqual([
      'chev-d',
      'chev-r',
      'chev-l',
      'x',
      'check',
      'warn',
      'arr-d',
      'copy',
      'disk',
      'grip',
      'chev-u',
      'arr-u',
      'arr-r',
      'upload',
      'mail',
      'menu',
    ]);
  });

  it('rejects names that are not in the drawn set', () => {
    expect(isDrawnIconName('mail')).toBe(true);
    expect(isDrawnIconName('scan')).toBe(false);
    expect(isDrawnIconName('×')).toBe(false);
  });

  it('filters the catalog by name substring', () => {
    expect(filterDrawnIcons(DRAWN_ICON_NAMES, 'arr')).toStrictEqual(['arr-d', 'arr-u', 'arr-r']);
    expect(filterDrawnIcons(DRAWN_ICON_NAMES, 'zzz')).toStrictEqual([]);
  });

  it('drops unknown df.options names instead of inventing glyphs', () => {
    expect(parseIconOptions('mail\nscan\nupload')).toStrictEqual(['mail', 'upload']);
    expect(resolveIconCatalog(['mail', 'nope'])).toStrictEqual(['mail']);
  });
});
