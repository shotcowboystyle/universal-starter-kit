import { setTimeout as delay } from 'node:timers/promises';

import { renderWithProviders } from '@repo/test-utils';
// oxlint-disable-next-line sonarjs/no-wildcard-import -- type-only namespace: names the module's shape for importOriginal without a runtime import
import type * as FlashListModule from '@shopify/flash-list';
import type { FlashListProps, FlashListRef } from '@shopify/flash-list';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { ComponentProps, ForwardedRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TreeView } from './TreeView';

const observed = vi.hoisted(() => ({ list: null as FlashListRef<unknown> | null }));
const isRefCallback = <T,>(ref: ForwardedRef<T>): ref is (instance: T | null) => void => typeof ref === 'function';

// oxlint-disable-next-line vitest/prefer-import-in-mock -- the factory swaps FlashList for a ref-capturing wrapper whose type differs from the module's
vi.mock('@shopify/flash-list', async (importOriginal) => {
  const actual = await importOriginal<typeof FlashListModule>();
  const React = await import('react');
  return {
    ...actual,
    FlashList: React.forwardRef<FlashListRef<unknown>, FlashListProps<unknown>>(
      function CapturingFlashList(props, ref) {
        const captureRef = React.useCallback(
          (list: FlashListRef<unknown> | null) => {
            observed.list = list;
            if (isRefCallback(ref)) {
              ref(list);
            } else if (ref) {
              ref.current = list;
            }
          },
          [ref],
        );
        // oxlint-disable-next-line react/refs -- the stub forwards the list ref it captured; it is only read in handlers
        return React.createElement(actual.FlashList, { ...props, ref: captureRef });
      },
    ),
  };
});
const dimensions = () => {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(320);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(240);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function measuredRect(this: HTMLElement) {
    let y = 0;
    for (let ancestor = this.parentElement; ancestor; ancestor = ancestor.parentElement) {
      y -= ancestor.scrollTop;
    }
    return {
      x: 0,
      y,
      top: y,
      left: 0,
      right: 320,
      bottom: y + 240,
      width: 320,
      height: 240,
      toJSON: () => ({}),
    };
  });
};

describe('TreeView.scrollIndex suite', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('reports no preparatory index offset while the actual scroll transport is deferred', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(320);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(240);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 320,
      bottom: 240,
      width: 320,
      height: 240,
      toJSON: () => ({}),
    });
    const change = vi.fn<NonNullable<ComponentProps<typeof TreeView>['onScrollOffsetChange']>>();
    renderWithProviders(
      <TreeView
        nodes={Array.from({ length: 100 }, (_, i) => ({ id: `row-${i}`, label: `Row ${i}` }))}
        height={240}
        onScrollOffsetChange={change}
      />,
    );
    await waitFor(() => {
      expect(observed.list?.getChildContainerDimensions().height).toBe(24_000);
    });
    await waitFor(() => {
      expect(change).toHaveBeenCalledWith(0);
    });
    expect(observed.list?.getWindowSize().height).toBe(240);
    expect(observed.list?.getLayout(99)?.y).toBe(23_760);
    const native = observed.list!.getNativeScrollRef()!;
    const transport = vi.spyOn(native, 'scrollTo').mockImplementation(() => {});
    const scroller = native.getScrollableNode();
    const index = vi.spyOn(observed.list!, 'scrollToIndex');
    change.mockClear();
    fireEvent.keyDown(screen.getByRole('tree'), { key: 'End' });
    expect(index).toHaveBeenCalledExactlyOnceWith({ index: 99, animated: true });
    await act(async () => {
      await delay(40);
    });
    expect(transport).toHaveBeenCalledWith(expect.anything());
    expect(observed.list!.getAbsoluteLastScrollOffset()).toBeGreaterThan(0);
    expect(scroller.scrollTop).toBe(0);
    expect(change).not.toHaveBeenCalled();
    await act(async () => {
      await index.mock.results[0].value;
    });
    expect(change).not.toHaveBeenCalled();
    fireEvent.scroll(scroller, { target: { scrollTop: 96.5 } });
    await waitFor(() => {
      expect(change).toHaveBeenCalledExactlyOnceWith(96.5);
    });
    change.mockClear();
    fireEvent.keyDown(screen.getByRole('tree'), { key: 'Home' });
    expect(index).toHaveBeenLastCalledWith({ index: 0, animated: true });
    await act(async () => {
      await index.mock.results[1].value;
    });
    expect(change).not.toHaveBeenCalled();
    fireEvent.scroll(scroller, { target: { scrollTop: 0 } });
    await waitFor(() => {
      expect(change).toHaveBeenCalledExactlyOnceWith(0);
    });
  });

  it('positive control: actual scroll delivery reports the transported offset', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(320);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(240);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 320,
      bottom: 240,
      width: 320,
      height: 240,
      toJSON: () => ({}),
    });
    const change = vi.fn<NonNullable<ComponentProps<typeof TreeView>['onScrollOffsetChange']>>();
    renderWithProviders(
      <TreeView
        nodes={Array.from({ length: 100 }, (_, i) => ({ id: `row-${i}`, label: `Row ${i}` }))}
        height={240}
        onScrollOffsetChange={change}
      />,
    );
    await waitFor(() => {
      expect(observed.list?.getChildContainerDimensions().height).toBe(24_000);
    });
    await waitFor(() => {
      expect(change).toHaveBeenCalledWith(0);
    });
    change.mockClear();
    const native = observed.list!.getNativeScrollRef()!;
    const scroller = native.getScrollableNode();
    fireEvent.scroll(scroller, { target: { scrollTop: 96.5 } });
    await waitFor(() => {
      expect(change).toHaveBeenCalledWith(96.5);
    });
  });

  it.each([false, true])(
    'acknowledges index-prepared reveal only after physical delivery (delivered: %s)',
    async (delivered) => {
      dimensions();
      const nodes = Array.from({ length: 100 }, (_, i) => ({ id: `row-${i}`, label: `Row ${i}` }));
      const change = vi.fn<NonNullable<ComponentProps<typeof TreeView>['onScrollOffsetChange']>>();
      const complete = vi.fn<NonNullable<ComponentProps<typeof TreeView>['onRevealComplete']>>();
      const tree = renderWithProviders(
        <TreeView
          nodes={nodes}
          height={240}
          onScrollOffsetChange={change}
          onRevealComplete={complete}
        />,
      );
      await waitFor(() => {
        expect(observed.list?.getChildContainerDimensions().height).toBe(24_000);
      });
      await waitFor(() => {
        expect(change).toHaveBeenCalledWith(0);
      });
      const native = observed.list!.getNativeScrollRef()!;
      const transport = vi.spyOn(native, 'scrollTo').mockImplementation(() => {});
      const scroller = native.getScrollableNode();
      const index = vi.spyOn(observed.list!, 'scrollToIndex');
      fireEvent.keyDown(screen.getByRole('tree'), { key: 'End' });
      await act(async () => {
        await index.mock.results[0].value;
      });
      expect(transport).toHaveBeenCalledWith(expect.anything());
      expect(scroller.scrollTop).toBe(0);
      const offset = observed.list!.getAbsoluteLastScrollOffset();
      const visible = observed.list!.computeVisibleIndices();
      const id = `row-${visible.startIndex}`;
      const layout = observed.list!.getLayout(visible.startIndex)!;
      expect(offset).toBeGreaterThan(0);
      expect(layout.isHeightMeasured).toBe(true);
      expect(screen.getByText(`Row ${visible.startIndex}`)).not.toBeNull();
      // oxlint-disable vitest/no-conditional-expect -- the delivered and deferred transports assert different outcomes of the same scenario
      if (delivered) {
        fireEvent.scroll(scroller, { target: { scrollTop: offset } });
        expect(scroller.scrollTop).toBe(offset);
        await waitFor(() => {
          expect(change).toHaveBeenCalledWith(offset);
        });
      }
      // oxlint-enable vitest/no-conditional-expect
      transport.mockClear();
      tree.rerender(
        <TreeView
          nodes={nodes}
          height={240}
          onScrollOffsetChange={change}
          onRevealComplete={complete}
          revealRequest={{ id, requestId: 71 }}
        />,
      );
      await act(async () => {
        await delay(60);
      });
      // oxlint-disable vitest/no-conditional-expect -- the delivered and deferred transports assert different outcomes of the same scenario
      if (delivered) {
        expect(complete).toHaveBeenCalledExactlyOnceWith({ id, requestId: 71 });
      } else {
        expect(complete).not.toHaveBeenCalled();
        expect(scroller.scrollTop).toBe(0);
        expect(transport).toHaveBeenCalledWith({ x: 0, y: offset, animated: false });
      }
      // oxlint-enable vitest/no-conditional-expect
      fireEvent.scroll(scroller, { target: { scrollTop: offset } });
      await waitFor(() => {
        expect(complete).toHaveBeenCalledExactlyOnceWith({ id, requestId: 71 });
      });
    },
  );

  it('reveals an observed keyboard destination without a retention callback', async () => {
    dimensions();
    const nodes = Array.from({ length: 100 }, (_, i) => ({ id: `row-${i}`, label: `Row ${i}` }));
    const complete = vi.fn<NonNullable<ComponentProps<typeof TreeView>['onRevealComplete']>>();
    const tree = renderWithProviders(
      <TreeView
        nodes={nodes}
        height={240}
        onRevealComplete={complete}
      />,
    );
    await waitFor(() => {
      expect(observed.list?.getChildContainerDimensions().height).toBe(24_000);
    });
    const list = observed.list!;
    const native = list.getNativeScrollRef()!;
    const transport = vi.spyOn(native, 'scrollTo').mockImplementation(() => {});
    const scroller = native.getScrollableNode();
    const index = vi.spyOn(list, 'scrollToIndex');
    fireEvent.keyDown(screen.getByRole('tree'), { key: 'End' });
    await act(async () => {
      await index.mock.results[0].value;
    });
    const target = list.computeVisibleIndices().endIndex;
    const layout = list.getLayout(target)!;
    const offset = layout.y + list.getFirstItemOffset();
    expect(offset).toBeGreaterThan(list.getAbsoluteLastScrollOffset());
    expect(layout.isHeightMeasured).toBe(true);
    expect(screen.getByText(`Row ${target}`)).toBeTruthy();
    fireEvent.scroll(scroller, { target: { scrollTop: offset } });
    await waitFor(() => {
      expect(list.getAbsoluteLastScrollOffset()).toBe(offset);
    });
    transport.mockClear();
    const revealScroll = vi.spyOn(list, 'scrollToOffset');
    tree.rerender(
      <TreeView
        nodes={nodes}
        height={240}
        onRevealComplete={complete}
        revealRequest={{ id: `row-${target}`, requestId: 72 }}
      />,
    );
    await waitFor(() => {
      expect(complete).toHaveBeenCalledExactlyOnceWith({ id: `row-${target}`, requestId: 72 });
    });
    expect(revealScroll).not.toHaveBeenCalled();
  });
});
