import { renderWithProviders } from '@repo/test-utils';
import { describe, expect, it, vi } from 'vitest';

const nativeHost = vi.hoisted(() => ({
  query: vi.fn(() => []),
  focus: vi.fn(),
  preventDefault: vi.fn(),
}));

vi.mock('tamagui', async (original) => ({
  ...(await original<typeof import('tamagui')>()),
  isWeb: false,
}));

vi.mock('../surfaces', async (original) => {
  const React = await import('react');
  return {
    ...(await original<typeof import('../surfaces')>()),
    DialogContent: React.forwardRef(function NativeContent(
      { children, onOpenAutoFocus }: { children?: React.ReactNode; onOpenAutoFocus?: (event: Event) => void },
      ref,
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
    }),
  };
});

import { ConfirmDialog } from './ConfirmDialog';

describe('ConfirmDialog native focus ownership', () => {
  it('leaves native host refs and open focus to the platform', () => {
    renderWithProviders(<ConfirmDialog open title="Delete project?" body="This cannot be undone." />);
    expect(nativeHost.query).not.toHaveBeenCalled();
    expect(nativeHost.focus).not.toHaveBeenCalled();
    expect(nativeHost.preventDefault).not.toHaveBeenCalled();
  });
});
