import { FrappeProvider } from '@repo/frappe-ui';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { useFrappeApp } from './use-frappe-app';

const appUnder = (syncOptions?: { writeStrategy?: 'live' | 'resource' }) => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <FrappeProvider
      baseURL="https://use-frappe-app.test"
      realtime={false}
      syncOptions={syncOptions}>
      {children}
    </FrappeProvider>
  );
  return renderHook(() => useFrappeApp(), { wrapper }).result.current;
};

describe('useFrappeApp write strategy (MPO-396)', () => {
  it("bulk writes follow the provider's resource write strategy", () => {
    expect(appUnder({ writeStrategy: 'resource' })?.db().getWriteStrategy()).toBe('resource');
  });

  it('stays on the live app when the provider names none', () => {
    expect(appUnder()?.db().getWriteStrategy()).toBe('live');
  });
});
