import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import RootWrapper from '@/components/layout/RootWrapper';

vi.mock('@/components/layout/AppSidebar', () => ({
  default: () => <div data-testid="app-sidebar">Sidebar</div>,
}));

vi.mock('@/components/layout/Header', () => ({
  default: ({ onToggleSidebar }: { onToggleSidebar: () => void }) => (
    <button data-testid="header" onClick={onToggleSidebar} type="button">
      Header
    </button>
  ),
}));

vi.mock('@/constants/ui', () => ({
  TOAST_DURATION: 3000,
}));

vi.mock('sonner', () => ({
  Toaster: (props: { position: string }) => (
    <div data-testid="toaster" data-position={props.position}>
      Toaster
    </div>
  ),
}));

describe('RootWrapper', () => {
  it('renders sidebar, header, children and toaster', () => {
    renderWithProviders(
      <RootWrapper>
        <div data-testid="content">Content</div>
      </RootWrapper>,
    );
    expect(screen.getByTestId('app-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('header')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-inset')).toContainElement(screen.getByTestId('content'));
    expect(screen.getByTestId('toaster')).toHaveAttribute('data-position', 'bottom-right');
  });

  it('opens the mobile overlay from the header trigger and closes it from the backdrop', () => {
    renderWithProviders(
      <RootWrapper>
        <div>Content</div>
      </RootWrapper>,
    );
    // jsdom has no matching media, so the trigger acts on the mobile (off-canvas) state.
    expect(screen.queryByTestId('sidebar-backdrop')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('header'));
    expect(screen.getByTestId('sidebar-backdrop')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('sidebar-backdrop'));
    expect(screen.queryByTestId('sidebar-backdrop')).not.toBeInTheDocument();
  });
});
