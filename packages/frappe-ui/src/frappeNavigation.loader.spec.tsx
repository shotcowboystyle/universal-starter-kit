// MPO-411. A routed view reads what its route's loader rendered on the server
// through the host's navigation, so an app hands the view its loader instead
// of reading the router itself.
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { FrappeNavigationProvider, useRouteLoaderData } from './frappeNavigation';
import type { FrappeNavigation } from './frappeNavigation';

const loader = async () => ({ rows: [] });

function Probe({ of, seen }: { of?: typeof loader; seen: (value: unknown) => void }) {
  seen(useRouteLoaderData(of));
  return null;
}

function read(navigation: FrappeNavigation | undefined, of?: typeof loader): unknown {
  const seen = vi.fn();
  render(
    <FrappeNavigationProvider navigation={navigation}>
      <Probe
        of={of}
        seen={seen}
      />
    </FrappeNavigationProvider>,
  );
  return seen.mock.calls.at(-1)?.[0];
}

const base: FrappeNavigation = { usePathname: () => '/pokemon', useNavigate: () => () => {} };

describe(useRouteLoaderData, () => {
  it('hands the host the loader and returns what it read', () => {
    const useLoader = vi.fn(() => ({ rows: ['bulbasaur'] }));
    expect(read({ ...base, useLoader }, loader)).toEqual({ rows: ['bulbasaur'] });
    expect(useLoader).toHaveBeenCalledWith(loader);
  });

  it('reads nothing without a loader or a host that runs them', () => {
    const useLoader = vi.fn(() => ({ rows: ['bulbasaur'] }));
    expect(read({ ...base, useLoader })).toBeUndefined();
    expect(useLoader).not.toHaveBeenCalled();
    expect(read(base, loader)).toBeUndefined();
    expect(read(undefined, loader)).toBeUndefined();
  });
});
