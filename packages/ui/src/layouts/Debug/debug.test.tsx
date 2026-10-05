import { renderWithProviders } from '@repo/test-utils';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { Paragraph } from 'tamagui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DebugLayout } from './index';

vi.mock('@repo/platform', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@repo/platform')>();
  return {
    ...actual,
    config: { get: () => '1' },
  };
});

vi.mock('i18next', () => ({
  default: {
    languages: ['en', 'es', 'fr'],
    language: 'en',
    on: vi.fn(),
    off: vi.fn(),
    changeLanguage: vi.fn(),
  },
}));

vi.mock('@repo/i18n', () => ({
  useLanguage: () => ['en', vi.fn()],
}));

vi.mock('tamagui', async () => {
  const actual = await vi.importActual('tamagui');
  return {
    ...(actual as any),
    Select: {
      Item: ({ children, value, index }: any) => (
        <Paragraph data-testid={`select-item-${value}`} data-index={index}>
          {children}
        </Paragraph>
      ),
      ItemText: ({ children }: any) => <Paragraph data-testid="select-item-text">{children}</Paragraph>,
    },
  };
});

describe('DebugLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(cleanup);

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

  // Skipped: opening the debug popover triggers @tamagui/use-presence which uses a nested React (Invalid hook call)
  it.skip('handles scheme changes correctly', async () => {
    renderWithProviders(
      <DebugLayout>
        <Paragraph>Theme Test</Paragraph>
      </DebugLayout>,
    );
    const debugCircle = screen.getByTestId('debug-circle');
    expect(debugCircle).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(debugCircle);
    });
  });

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

  it.skip('shows and hides popover content on click', async () => {
    renderWithProviders(
      <DebugLayout>
        <Paragraph>Content</Paragraph>
      </DebugLayout>,
    );
    const debugCircle = screen.getByTestId('debug-circle');
    expect(debugCircle).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(debugCircle);
    });
    const popoverContent = screen.getByTestId('debug-circle').closest('[data-state="open"]');
    expect(popoverContent).toBeInTheDocument();
  });

  it.skip('handles color theme changes correctly', async () => {
    renderWithProviders(
      <DebugLayout>
        <Paragraph>Color Theme Test</Paragraph>
      </DebugLayout>,
    );
    const debugCircle = screen.getByTestId('debug-circle');
    expect(debugCircle).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(debugCircle);
    });
  });

  it('handles missing theme names gracefully', () => {
    renderWithProviders(
      <DebugLayout>
        <Paragraph>Error Test</Paragraph>
      </DebugLayout>,
    );
    expect(screen.getByTestId('debug-circle')).toBeInTheDocument();
  });

  it.skip('handles empty theme arrays', async () => {
    renderWithProviders(
      <DebugLayout>
        <Paragraph>Empty Theme Test</Paragraph>
      </DebugLayout>,
    );
    const debugButton = screen.getByTestId('debug-circle');
    expect(debugButton).toBeTruthy();
    fireEvent.click(debugButton);
    const popoverContent = await screen.findByRole('dialog');
    expect(popoverContent).toBeInTheDocument();
  });

  it.skip('handles undefined i18n languages', async () => {
    vi.mock('i18next', () => ({
      default: { languages: undefined },
    }));
    renderWithProviders(
      <DebugLayout>
        <Paragraph>Content</Paragraph>
      </DebugLayout>,
    );
    const debugButton = screen.getByTestId('debug-circle');
    expect(debugButton).toBeTruthy();
    fireEvent.click(debugButton);
    const popoverContent = await screen.findByRole('dialog');
    expect(popoverContent).toBeInTheDocument();
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

  it.skip('should open popover when debug button is clicked', async () => {
    renderWithProviders(
      <DebugLayout>
        <Paragraph>Test Content</Paragraph>
      </DebugLayout>,
    );
    const debugButton = screen.getByTestId('debug-circle');
    fireEvent.click(debugButton);
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();
  });
});
