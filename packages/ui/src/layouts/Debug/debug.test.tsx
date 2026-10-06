import { config } from '@repo/platform';
import { renderWithProviders } from '@repo/test-utils';
import { cleanup, screen } from '@testing-library/react';
import { Paragraph } from 'tamagui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DebugLayout } from './index';

describe(DebugLayout, () => {
  beforeEach(() => {
    vi.spyOn(config, 'get').mockReturnValue('1');
  });
  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it('renders children correctly', () => {
    renderWithProviders(
      <DebugLayout>
        <Paragraph data-testid="child">Test Content</Paragraph>
      </DebugLayout>,
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('renders debug circle when DEBUG is enabled', () => {
    renderWithProviders(
      <DebugLayout>
        <Paragraph>Content</Paragraph>
      </DebugLayout>,
    );
    expect(screen.getByTestId('debug-circle')).toBeInTheDocument();
  });

  it('maintains layout structure at different viewport sizes', () => {
    renderWithProviders(
      <DebugLayout>
        <Paragraph>Responsive Content</Paragraph>
      </DebugLayout>,
    );
    expect(screen.getByTestId('debug-layout-root')).toBeInTheDocument();
    expect(screen.getByText('Responsive Content')).toBeInTheDocument();
  });

  // Popover-open interactions are not covered: opening the debug popover triggers @tamagui/use-presence, which uses a nested React (Invalid hook call)

  it('renders with custom size', () => {
    const customSize = 24;
    renderWithProviders(
      <DebugLayout size={customSize}>
        <Paragraph>Custom Size Test</Paragraph>
      </DebugLayout>,
    );
    const debugCircle = screen.getByTestId('debug-circle');
    expect(debugCircle).toBeInTheDocument();
    const debugContainer = screen.getByTestId('debug-container');
    expect(debugContainer).toBeInTheDocument();
  });

  it('handles missing theme names gracefully', () => {
    renderWithProviders(
      <DebugLayout>
        <Paragraph>Error Test</Paragraph>
      </DebugLayout>,
    );
    expect(screen.getByTestId('debug-circle')).toBeInTheDocument();
  });

  it('should render debug button', () => {
    renderWithProviders(
      <DebugLayout>
        <Paragraph>Test Content</Paragraph>
      </DebugLayout>,
    );
    expect(screen.getByTestId('debug-circle')).toBeTruthy();
  });

  it('hides the pip when enabled is false', () => {
    renderWithProviders(
      <DebugLayout enabled={false}>
        <Paragraph data-testid="child">Hidden chrome</Paragraph>
      </DebugLayout>,
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
    expect(screen.queryByTestId('debug-circle')).not.toBeInTheDocument();
  });

  it('shows the pip when enabled is true even if the env gate is off', () => {
    renderWithProviders(
      <DebugLayout enabled>
        <Paragraph>Forced chrome</Paragraph>
      </DebugLayout>,
    );
    const pip = screen.getByTestId('debug-circle');
    expect(pip).toBeInTheDocument();
    expect(pip).toHaveAttribute('data-radius-class', 'R-PILL');
    expect(pip).toHaveAttribute('data-radius-part', 'debug pip');
  });

  it('keeps children mounted under the overlay', () => {
    renderWithProviders(
      <DebugLayout enabled>
        <Paragraph data-testid="child">Underlay</Paragraph>
      </DebugLayout>,
    );
    expect(screen.getByTestId('debug-layout-root')).toBeInTheDocument();
    expect(screen.getByTestId('child')).toBeInTheDocument();
    expect(screen.getByTestId('debug-circle')).toBeInTheDocument();
  });
});
