import { describe, expect, it } from 'vitest';

import { filledCount } from './ratingMath';

describe('filledCount', () => {
  it('maps the 0–1 fraction onto discrete stars', () => {
    expect(filledCount(0, 5)).toBe(0);
    expect(filledCount(0.1, 5)).toBe(1);
    expect(filledCount(0.5, 5)).toBe(3);
    expect(filledCount(1, 5)).toBe(5);
    expect(filledCount(0.5, 3)).toBe(2);
  });

  it('clamps overflow, negatives, and non-finite values', () => {
    expect(filledCount(3, 5)).toBe(5);
    expect(filledCount(-1, 5)).toBe(0);
    expect(filledCount(Number.NaN, 5)).toBe(0);
    expect(filledCount(Number.POSITIVE_INFINITY, 5)).toBe(5);
  });

  it('returns zero stars when maxStars is not positive', () => {
    expect(filledCount(1, 0)).toBe(0);
    expect(filledCount(1, -2)).toBe(0);
  });
});
