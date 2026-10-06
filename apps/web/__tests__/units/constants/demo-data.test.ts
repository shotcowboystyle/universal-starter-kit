import { describe, expect, it } from 'vitest';

import { defaultEmail } from '@/constants/demo-data';

describe('demoData constants', () => {
  it('should have correct defaultEmail value', () => {
    expect(defaultEmail).toBe('mark.s@example.com');
  });

  it('should have valid email format', () => {
    const emailRegex = /^[^\s@]+@[^\s@.]+\.[^\s@.]+$/u;
    expect(defaultEmail).toMatch(emailRegex);
  });

  it('should be a string type', () => {
    expect(defaultEmail).toBeTypeOf('string');
  });

  it('should not be empty', () => {
    expect(defaultEmail.length).toBeGreaterThan(0);
  });
});
