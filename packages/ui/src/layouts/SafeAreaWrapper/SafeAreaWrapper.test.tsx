import { renderWithProviders } from '@repo/test-utils';
import { cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { applySafeAreaInsets } from './insets';

import { SafeAreaWrapper } from './index';

afterEach(cleanup);

const insets = { top: 47, bottom: 34, left: 0, right: 0 };

describe('applySafeAreaInsets', () => {
  it('applies padding on every requested edge and zero on the rest', () => {
    expect(applySafeAreaInsets(insets, ['top', 'bottom'], 'padding')).toEqual({
      paddingTop: 47,
      paddingBottom: 34,
      paddingLeft: 0,
      paddingRight: 0,
    });
  });

  it('switches to margin without changing inset math', () => {
    expect(applySafeAreaInsets({ top: 12, bottom: 8, left: 4, right: 6 }, ['left'], 'margin')).toEqual({
      marginTop: 0,
      marginBottom: 0,
      marginLeft: 4,
      marginRight: 0,
    });
  });

  it('zero insets stay zero', () => {
    expect(applySafeAreaInsets({ top: 0, bottom: 0, left: 0, right: 0 })).toEqual({
      paddingTop: 0,
      paddingBottom: 0,
      paddingLeft: 0,
      paddingRight: 0,
    });
  });
});

describe('SafeAreaWrapper web', () => {
  it('is a passthrough that still renders children', () => {
    const { container } = renderWithProviders(
      <SafeAreaWrapper edges={['top']} mode="margin">
        <span>Page body</span>
      </SafeAreaWrapper>,
    );
    const frame = container.querySelector('[data-testid="safe-area-wrapper"]') as HTMLElement;
    expect(frame).toBeTruthy();
    expect(frame.getAttribute('data-safe-area')).toBe('web');
    expect(frame.textContent).toContain('Page body');
  });

  it('lets caller padding compose on the wrapper', () => {
    const { container } = renderWithProviders(
      <SafeAreaWrapper padding="$4">
        <span>Padded</span>
      </SafeAreaWrapper>,
    );
    const frame = container.querySelector('[data-testid="safe-area-wrapper"]') as HTMLElement;
    expect(frame.textContent).toContain('Padded');
    const haystack = `${frame.className} ${frame.getAttribute('style') ?? ''}`;
    expect(haystack).toMatch(/_pt-|_pr-|_pb-|_pl-/);
  });
});
