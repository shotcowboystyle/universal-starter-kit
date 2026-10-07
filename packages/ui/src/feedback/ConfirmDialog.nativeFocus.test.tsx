import { renderWithProviders } from '@repo/test-utils';
import type { ForwardedRef, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ConfirmDialog } from './ConfirmDialog';

const nativeHost = vi.hoisted(() => ({
  query: vi.fn<() => HTMLElement[]>(() => []),
  focus: vi.fn<() => void>(),
  preventDefault: vi.fn<() => void>(),
}));

vi.mock(import('tamagui'), async (original) => ({
  ...(await original()),
  isWeb: false,
}));

vi.mock(import('../surfaces'), async (original) => {
  const React = await import('react');
  return {
    ...(await original()),
    DialogContent: React.forwardRef(function NativeContent(
      { children, onOpenAutoFocus }: { children?: ReactNode; onOpenAutoFocus?: (event: Event) => void },
      ref: ForwardedRef<HTMLElement>,
    ) {
      React.useImperativeHandle(ref, () => {
        // RN 0.83 exposes HTMLElement for native host refs, without web focus APIs.
        const host = Object.create(HTMLElement.prototype);
        host.querySelectorAll = nativeHost.query;
        host.focus = nativeHost.focus;
        return host;
      }, []);
      React.useEffect(() => {
        onOpenAutoFocus?.({ preventDefault: nativeHost.preventDefault } as unknown as Event);
      }, [onOpenAutoFocus]);
      return <div>{children}</div>;
    }) as never,
  };
});

describe('ConfirmDialog native focus ownership', () => {
  it('leaves native host refs and open focus to the platform', () => {
    renderWithProviders(
      <ConfirmDialog
        open
        title="Delete project?"
        body="This cannot be undone."
      />,
    );
    expect(nativeHost.query).not.toHaveBeenCalled();
    expect(nativeHost.focus).not.toHaveBeenCalled();
    expect(nativeHost.preventDefault).not.toHaveBeenCalled();
  });
});
