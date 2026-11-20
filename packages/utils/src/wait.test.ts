import { describe, expect, it } from 'vitest';

import { formatServiceList, waitServices } from './wait';

describe(formatServiceList, () => {
  it('returns single service as-is', () => {
    expect(formatServiceList(['frappe'])).toBe('frappe');
  });

  it("joins two services with 'and'", () => {
    expect(formatServiceList(['frappe', 'postgres'])).toBe('frappe and postgres');
  });

  it("joins three services with commas and 'and'", () => {
    expect(formatServiceList(['frappe', 'postgres', 'keycloak'])).toBe('frappe, postgres and keycloak');
  });

  it('joins four services correctly', () => {
    expect(formatServiceList(['a', 'b', 'c', 'd'])).toBe('a, b, c and d');
  });
});

describe('waitServices constant', () => {
  it('contains the expected service names', () => {
    expect(waitServices).toContain('postgres');
    expect(waitServices).toContain('keycloak');
  });

  it('has exactly 2 services', () => {
    expect(waitServices).toHaveLength(2);
  });
});
