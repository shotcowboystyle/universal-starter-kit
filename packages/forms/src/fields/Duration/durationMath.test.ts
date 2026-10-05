import { sizeRecipeForToken } from '@repo/theme';
import { describe, expect, it } from 'vitest';

import {
  durationSegmentWidth,
  normalizeSeconds,
  parseDurationText,
  partsToSeconds,
  secondsToParts,
} from './durationMath';

describe('durationMath', () => {
  it('clamps negative and non-finite values to zero', () => {
    expect(normalizeSeconds(-100)).toBe(0);
    expect(normalizeSeconds(Number.NaN)).toBe(0);
    expect(normalizeSeconds(Number.POSITIVE_INFINITY)).toBe(0);
    expect(normalizeSeconds(1.9)).toBe(1);
  });

  it('folds days into hours when hideDays', () => {
    const parts = secondsToParts(100000, true);
    expect(parts.days).toBe(0);
    expect(parts.hours).toBe(27);
    expect(parts.minutes).toBe(46);
    expect(parts.seconds).toBe(40);
  });

  it('keeps days first-class when hideDays is false', () => {
    const parts = secondsToParts(100000, false);
    expect(parts.days).toBe(1);
    expect(parts.hours).toBe(3);
    expect(parts.minutes).toBe(46);
    expect(parts.seconds).toBe(40);
  });

  it('round-trips parts through seconds', () => {
    const seconds = partsToSeconds({ days: 1, hours: 2, minutes: 3, seconds: 4 }, false);
    expect(seconds).toBe(93784);
    expect(secondsToParts(seconds, false)).toEqual({
      days: 1,
      hours: 2,
      minutes: 3,
      seconds: 4,
    });
  });

  it('drops days when converting parts with hideDays', () => {
    expect(partsToSeconds({ days: 2, hours: 1, minutes: 0, seconds: 0 }, true)).toBe(3600);
  });

  it('parses Frappe-style duration text, clock, and raw seconds', () => {
    expect(parseDurationText('1d 2h 3m 4s')).toBe(93784);
    expect(parseDurationText('01h 30m')).toBe(5400);
    expect(parseDurationText('1:30')).toBe(5400);
    expect(parseDurationText('1:30:05')).toBe(5405);
    expect(parseDurationText('-100')).toBe(0);
    expect(parseDurationText('  ')).toBeNull();
    expect(parseDurationText('nope')).toBeNull();
  });

  it('sizes segment width from the size recipe, not a fixed 48/64', () => {
    const md = sizeRecipeForToken('$4');
    expect(durationSegmentWidth('$4', 2)).toBe(md.paddingHorizontal + md.fontSize * 2);
    expect(durationSegmentWidth('$4', 3)).toBe(md.paddingHorizontal + md.fontSize * 3);
    expect(durationSegmentWidth('$2', 2)).not.toBe(durationSegmentWidth('$6', 2));
    expect(durationSegmentWidth('$2', 2)).toBeLessThan(durationSegmentWidth('$4', 2));
  });
});
