import { describe, expect, it } from 'vitest';

import { useUser, useUserSearch, userApi } from '@/lib/api/users';

describe('users index exports', () => {
  it('should export useUser hook', () => {
    expect(useUser).toBeDefined();
    expect(useUser).toBeTypeOf('function');
  });

  it('should export useUserSearch hook', () => {
    expect(useUserSearch).toBeDefined();
    expect(useUserSearch).toBeTypeOf('function');
  });

  it('should export userApi', () => {
    expect(userApi).toBeDefined();
    expect(userApi).toBeTypeOf('object');
  });
});
