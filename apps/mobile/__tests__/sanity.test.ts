import { describe, it, expect } from 'vitest';

describe('Sanity Check', () => {
  it('should pass', () => {
    expect(expect.getState().currentTestName).toBe('Sanity Check > should pass');
  });
});
