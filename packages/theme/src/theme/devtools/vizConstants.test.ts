import { describe, expect, it } from 'vitest';

import { fallbackGray, stepToPx, cellSize } from './vizConstants';

describe('fallbackGray', () => {
  it('returns lighter gray for step 1', () => {
    const rgb = fallbackGray(1);
    expect(rgb).toBe('rgb(230,230,230)');
  });

  it('returns darker gray for step 12', () => {
    const rgb = fallbackGray(12);
    expect(rgb).toBe('rgb(40,40,40)');
  });

  it('returns mid-gray for step 6', () => {
    const rgb = fallbackGray(6);
    const match = rgb.match(/rgb\((\d+),(\d+),(\d+)\)/);
    expect(match).not.toBeNull();
    const value = Number(match![1]);
    expect(value).toBeGreaterThan(100);
    expect(value).toBeLessThan(200);
  });

  it('produces monotonically decreasing gray values from step 1 to 12', () => {
    const values = Array.from({ length: 12 }, (_, i) => {
      const match = fallbackGray(i + 1).match(/(\d+)/);
      return Number(match![1]);
    });
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeLessThanOrEqual(values[i - 1]);
    }
  });
});

describe('stepToPx', () => {
  it('maps step 1 to half a cell', () => {
    expect(stepToPx(1)).toBe(cellSize / 2);
  });

  it('maps step 2 to 1.5 cells', () => {
    expect(stepToPx(2)).toBe(cellSize + cellSize / 2);
  });

  it('maps step 12 correctly', () => {
    expect(stepToPx(12)).toBe(11 * cellSize + cellSize / 2);
  });

  it('increases by cellSize per step', () => {
    expect(stepToPx(3) - stepToPx(2)).toBe(cellSize);
    expect(stepToPx(7) - stepToPx(6)).toBe(cellSize);
  });
});

describe('cellSize', () => {
  it('is 32', () => {
    expect(cellSize).toBe(32);
  });
});
