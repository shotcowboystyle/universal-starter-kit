import { renderWithProviders } from '@repo/test-utils';
import { GroupPositionContext } from '@repo/theme';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SidebarFacetRow } from './sidebar-section';

afterEach(cleanup);

describe('SidebarFacetRow stacked-group radius (LC-72)', () => {
  it('resolves first / middle / last from GroupPositionContext', () => {
    renderWithProviders(
      <>
        <GroupPositionContext.Provider value="first">
          <SidebarFacetRow
            label="Open"
            count={4}
            active={false}
            onPress={vi.fn()}
          />
        </GroupPositionContext.Provider>
        <GroupPositionContext.Provider value="middle">
          <SidebarFacetRow
            label="Closed"
            count={2}
            active={false}
            onPress={vi.fn()}
          />
        </GroupPositionContext.Provider>
        <GroupPositionContext.Provider value="last">
          <SidebarFacetRow
            label="Cancelled"
            count={1}
            active={false}
            onPress={vi.fn()}
          />
        </GroupPositionContext.Provider>
      </>,
    );
    expect(screen.getByLabelText('Open').dataset.groupPosition).toBe('first');
    expect(screen.getByLabelText('Closed').dataset.groupPosition).toBe('middle');
    expect(screen.getByLabelText('Cancelled').dataset.groupPosition).toBe('last');
  });
});
