// MPO-411. A routed view reads what its route's loader rendered on the server
// through the host's navigation, so an app hands the view its loader instead
// of reading the router itself.
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { FrappeNavigationProvider, useRouteLoaderData } from './frappe-navigation';
import type { FrappeNavigation } from './frappe-navigation';

const loader = async () => ({ rows: [] });

// The hook hands back whatever the host's loader read, typed `unknown`; the probe just records it.
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- mirrors useRouteLoaderData's `unknown` result, which the assertions inspect
type SeenFn = (value: unknown) => void;
type UseLoader = NonNullable<FrappeNavigation['useLoader']>;

const Probe = ({ of, seen }: { of?: typeof loader; seen: SeenFn }) => {
  seen(useRouteLoaderData(of));
  return null;
};

// oxlint-disable-next-line anti-slop/no-unknown-returns -- returns useRouteLoaderData's `unknown` result for the assertions to inspect
const read = (navigation: FrappeNavigation | undefined, of?: typeof loader): unknown => {
  const seen = vi.fn<SeenFn>();
  render(
    <FrappeNavigationProvider navigation={navigation}>
      <Probe
        of={of}
        seen={seen}
      />
    </FrappeNavigationProvider>,
  );
  return seen.mock.calls.at(-1)?.[0];
};

const base: FrappeNavigation = { usePathname: () => '/pokemon', useNavigate: () => () => {} };

describe(useRouteLoaderData, () => {
  it('hands the host the loader and returns what it read', () => {
    const useLoader = vi.fn<UseLoader>(() => ({ rows: ['bulbasaur'] }));
    expect(read({ ...base, useLoader }, loader)).toStrictEqual({ rows: ['bulbasaur'] });
    expect(useLoader).toHaveBeenCalledWith(loader);
  });

  it('reads nothing without a loader or a host that runs them', () => {
    const useLoader = vi.fn<UseLoader>(() => ({ rows: ['bulbasaur'] }));
    expect(read({ ...base, useLoader })).toBeUndefined();
    expect(useLoader).not.toHaveBeenCalled();
    expect(read(base, loader)).toBeUndefined();
    expect(read(undefined, loader)).toBeUndefined();
  });
});
