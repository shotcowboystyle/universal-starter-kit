import { describe, expect, it } from 'vitest';

import { formatServiceList, waitServices } from './wait';

describe(formatServiceList, () => {
  it('returns single service as-is', () => {
    expect(formatServiceList(['api'])).toBe('api');
  });

  it("joins two services with 'and'", () => {
    expect(formatServiceList(['api', 'postgres'])).toBe('api and postgres');
  });

  it("joins three services with commas and 'and'", () => {
    expect(formatServiceList(['api', 'postgres', 'keycloak'])).toBe('api, postgres and keycloak');
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
