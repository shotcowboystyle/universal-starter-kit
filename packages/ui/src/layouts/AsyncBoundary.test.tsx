/**
 * @vitest-environment jsdom
 */

import { renderWithProviders } from '@repo/test-utils';
import { createDefaultThemeConfig } from '@repo/theme';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { TamaguiProvider, Text, YStack } from 'tamagui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Badge } from '../Badge';
import { Text as HouseText } from '../Text';

import { AsyncBoundary, resolveAsyncStatus, useAsyncCount, __resetAsyncDevWarnSeen } from './AsyncBoundary';

afterEach(() => {
  __resetAsyncDevWarnSeen();
});

describe('resolveAsyncStatus', () => {
  it('prioritizes error over loading and empty', () => {
    expect(resolveAsyncStatus({ error: 'fail', loading: true, empty: true })).toBe('error');
    expect(resolveAsyncStatus({ loading: true, empty: true })).toBe('loading');
    expect(resolveAsyncStatus({ empty: true })).toBe('empty');
    expect(resolveAsyncStatus({})).toBe('data');
  });
});

describe('AsyncBoundary', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('renders data children when ready', () => {
    renderWithProviders(
      <AsyncBoundary>
        <Text>Ready rows</Text>
      </AsyncBoundary>,
    );
    expect(screen.getByText('Ready rows')).toBeInTheDocument();
    expect(document.querySelector('[data-async-status="data"]')).toBeTruthy();
  });

  it('shows layout skeleton when loading=true', () => {
    renderWithProviders(<AsyncBoundary loading layout="list" />);
    expect(document.querySelector('[data-async-skeleton="list"]')).toBeTruthy();
    expect(document.querySelector('[data-async-status="loading"]')).toBeTruthy();
    expect(screen.queryByText('No items found')).toBeNull();
  });

  it('keeps previous data on refetch instead of replacing it with a skeleton', () => {
    const { rerender } = renderWithProviders(
      <AsyncBoundary layout="list">
        <Text>Ready rows</Text>
      </AsyncBoundary>,
    );
    expect(screen.getByText('Ready rows')).toBeInTheDocument();

    rerender(
      <AsyncBoundary loading layout="list">
        <Text>Ready rows</Text>
      </AsyncBoundary>,
    );

    expect(screen.getByText('Ready rows')).toBeInTheDocument();
    expect(document.querySelector('[data-async-skeleton]')).toBeNull();
    expect(document.querySelector('[data-async-pending]')).toBeTruthy();
    expect(document.querySelector('[data-async-status="data"]')).toBeTruthy();
    expect(document.querySelector('[data-async-status]')).toHaveAttribute('aria-busy', 'true');
  });

  it('keeps previous data when children unmount during a refetch', () => {
    const { rerender } = renderWithProviders(
      <AsyncBoundary layout="list">
        <Text>Ready rows</Text>
      </AsyncBoundary>,
    );

    rerender(<AsyncBoundary loading layout="list" />);

    expect(screen.getByText('Ready rows')).toBeInTheDocument();
    expect(document.querySelector('[data-async-skeleton]')).toBeNull();
  });

  it('still blanks on refetch when keepPrevious is false', () => {
    const { rerender } = renderWithProviders(
      <AsyncBoundary layout="list">
        <Text>Ready rows</Text>
      </AsyncBoundary>,
    );

    rerender(
      <AsyncBoundary loading keepPrevious={false} layout="list">
        <Text>Ready rows</Text>
      </AsyncBoundary>,
    );

    expect(screen.queryByText('Ready rows')).toBeNull();
    expect(document.querySelector('[data-async-skeleton]')).toBeTruthy();
  });

  it('keeps previous data on a refetch error and still offers retry', () => {
    const onRetry = vi.fn();
    const { rerender } = renderWithProviders(
      <AsyncBoundary layout="list" onRetry={onRetry}>
        <Text>Ready rows</Text>
      </AsyncBoundary>,
    );

    rerender(
      <AsyncBoundary error="Network unreachable" errorTitle="Couldn't load data" layout="list" onRetry={onRetry}>
        <Text>Ready rows</Text>
      </AsyncBoundary>,
    );

    expect(screen.getByText('Ready rows')).toBeInTheDocument();
    expect(screen.getByText("Couldn't load data")).toBeInTheDocument();
    expect(document.querySelector('[data-async-stale]')).toBeTruthy();
    fireEvent.click(screen.getByText('Retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('shows empty chrome only when empty and not error', () => {
    renderWithProviders(<AsyncBoundary empty emptyTitle="Nothing here" compact />);
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
    expect(document.querySelector('[data-async-state="empty"]')).toBeTruthy();
    expect(document.querySelector('[data-empty-intent="neutral"]')).toBeTruthy();
  });

  it('forbids empty chrome when error is set — even if empty=true', () => {
    renderWithProviders(
      <AsyncBoundary
        empty
        emptyTitle="No items found"
        error="Network unreachable"
        errorTitle="Couldn't load data"
        compact
      />,
    );
    expect(screen.queryByText('No items found')).toBeNull();
    expect(screen.getByText("Couldn't load data")).toBeInTheDocument();
    expect(screen.getByText('Network unreachable')).toBeInTheDocument();
    expect(document.querySelector('[data-async-state="error"]')).toBeTruthy();
    expect(document.querySelector('[data-empty-intent="error"]')).toBeTruthy();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('empty-chrome-ignored-on-error'));
  });

  it('calls onRetry from default error action', () => {
    const onRetry = vi.fn();
    renderWithProviders(<AsyncBoundary error compact onRetry={onRetry} />);
    fireEvent.click(screen.getByText('Retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('hides chrome and Badge counts on error', () => {
    function CountProbe() {
      const count = useAsyncCount(12);
      return <Text data-testid="count">{count == null ? 'hidden' : String(count)}</Text>;
    }
    renderWithProviders(
      <AsyncBoundary
        error="boom"
        chrome={
          <Badge count={9}>
            <Text>Inbox</Text>
          </Badge>
        }>
        <CountProbe />
      </AsyncBoundary>,
    );
    // Chrome suppressed on error
    expect(screen.queryByText('Inbox')).toBeNull();
    expect(screen.queryByText('9')).toBeNull();
    // Children not rendered in error status either
    expect(screen.queryByTestId('count')).toBeNull();
  });

  it('exposes hideBadges to nested Badge when error slot is custom', () => {
    renderWithProviders(
      <AsyncBoundary
        error={
          <>
            <Text>Custom failure</Text>
            <Badge count={3}>
              <Text>Nested</Text>
            </Badge>
          </>
        }
      />,
    );
    expect(screen.getByText('Custom failure')).toBeInTheDocument();
    expect(screen.getByText('Nested')).toBeInTheDocument();
    // Count badge suppressed via context even inside custom error slot
    expect(screen.queryByText('3')).toBeNull();
  });
});

const houseConfig = createDefaultThemeConfig();
const SCHEMES = ['light', 'dark'] as const;

function weightClasses(el: Element): string[] {
  return String((el as HTMLElement).className || '')
    .split(' ')
    .filter((c) => c.startsWith('_fow-'))
    .sort();
}

function SchemeWrap({ scheme, children }: { scheme: (typeof SCHEMES)[number]; children: ReactNode }) {
  return (
    <TamaguiProvider config={houseConfig.tamagui} defaultTheme={scheme} disableInjectCSS>
      <YStack backgroundColor="$background">{children}</YStack>
    </TamaguiProvider>
  );
}

function renderInScheme(scheme: (typeof SCHEMES)[number], ui: ReactElement) {
  return renderWithProviders(<SchemeWrap scheme={scheme}>{ui}</SchemeWrap>);
}

function expectRetryWeight400(pin: string[]) {
  const node = screen.getByText('Retry');
  expect(node.tagName).not.toBe('BUTTON');
  expect(weightClasses(node)).toEqual(pin);
  expect(node.className).toMatch(/_fow-400\b/);
  expect(node.className).not.toMatch(/_fow-500\b/);
  expect(node.className).not.toMatch(/_fow-600\b/);
}

describe('AsyncBoundary Retry label weight', () => {
  it.each(SCHEMES)('%s: first-load Retry TEXT NODE is weight 400, never 500/600', (scheme) => {
    renderInScheme(scheme, <HouseText fontWeight="400">Retry-pin</HouseText>);
    const pin = weightClasses(screen.getByText('Retry-pin'));
    cleanup();

    renderInScheme(scheme, <AsyncBoundary error compact onRetry={() => {}} />);
    expectRetryWeight400(pin);
  });

  it.each(SCHEMES)('%s: stale-refetch Retry TEXT NODE is weight 400, never 500/600', (scheme) => {
    renderInScheme(scheme, <HouseText fontWeight="400">Retry-pin</HouseText>);
    const pin = weightClasses(screen.getByText('Retry-pin'));
    cleanup();

    const { rerender } = renderInScheme(
      scheme,
      <AsyncBoundary layout="list" onRetry={() => {}}>
        <Text>Ready rows</Text>
      </AsyncBoundary>,
    );
    rerender(
      <SchemeWrap scheme={scheme}>
        <AsyncBoundary error="Network unreachable" errorTitle="Couldn't load data" layout="list" onRetry={() => {}}>
          <Text>Ready rows</Text>
        </AsyncBoundary>
      </SchemeWrap>,
    );

    expectRetryWeight400(pin);
  });
});

describe('AsyncBoundary layout skeletons', () => {
  it.each(['list', 'table', 'kanban', 'dashboard', 'generic'] as const)('renders %s skeleton', (layout) => {
    renderWithProviders(<AsyncBoundary loading layout={layout} />);
    expect(document.querySelector(`[data-async-skeleton="${layout}"]`)).toBeTruthy();
  });
});
