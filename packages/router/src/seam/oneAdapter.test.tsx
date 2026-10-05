import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { stackNavigator } from './navigator';
import { usePathname } from './oneAdapter';

/**
 * Mirrors CreateRootLayout.native: the consumer root layout renders around
 * the active child and reads usePathname() on that first paint — before the
 * navigation host has mounted (One: routeInfo is still undefined; seam: the
 * nav snapshot is not ready). Unguarded `.pathname` throws and the app never
 * boots.
 */
function RootLayoutReadingPathname({ children }: { children?: ReactNode }) {
  const pathname = usePathname();
  return (
    <div>
      <span data-testid="pathname">{pathname}</span>
      {children}
    </div>
  );
}

describe('usePathname (native seam, first render)', () => {
  beforeEach(() => {
    stackNavigator.detach();
    vi.restoreAllMocks();
  });

  it('returns / when a root layout reads it before the nav snapshot exists', () => {
    vi.spyOn(stackNavigator, 'getSnapshot').mockReturnValue(undefined as never);

    render(
      <RootLayoutReadingPathname>
        <div data-testid="slot" />
      </RootLayoutReadingPathname>,
    );

    expect(screen.getByTestId('pathname').textContent).toBe('/');
    expect(screen.getByTestId('slot')).toBeTruthy();
  });
});
