import { describe, expect, it } from 'vitest';

import { osDateTimeIosDisplay } from './osDateTimeIosDisplay';

describe('osDateTimeIosDisplay', () => {
  it('uses the iOS 14+ inline calendar for dates', () => {
    expect(osDateTimeIosDisplay('date')).toBe('inline');
  });

  it('keeps the time wheel', () => {
    expect(osDateTimeIosDisplay('time')).toBe('spinner');
  });
});
