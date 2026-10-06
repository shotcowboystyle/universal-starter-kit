import { describe, expect, it } from 'vitest';

import { NAVIGATION_DELAY_MS, TOAST_DURATION } from '@/constants/ui';

describe('ui constants', () => {
  it('should have correct TOAST_DURATION value', () => {
    expect(TOAST_DURATION).toBe(1000);
    expect(TOAST_DURATION).toBeTypeOf('number');
  });

  it('should have correct NAVIGATION_DELAY_MS value', () => {
    expect(NAVIGATION_DELAY_MS).toBe(500);
    expect(NAVIGATION_DELAY_MS).toBeTypeOf('number');
  });

  it('should have positive values', () => {
    expect(TOAST_DURATION).toBeGreaterThan(0);
    expect(NAVIGATION_DELAY_MS).toBeGreaterThan(0);
  });

  it('should have TOAST_DURATION greater than NAVIGATION_DELAY_MS', () => {
    expect(TOAST_DURATION).toBeGreaterThan(NAVIGATION_DELAY_MS);
  });
});
