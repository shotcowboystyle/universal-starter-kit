import { renderWithProviders } from '@repo/test-utils';
import type { FlashListProps, FlashListRef } from '@shopify/flash-list';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TreeView, type TreeNode, type TreeViewProps } from './TreeView';

const observed = vi.hoisted(() => ({
  list: null as FlashListRef<unknown> | null,
  props: null as FlashListProps<unknown> | null,
}));

// Keep the real list and rows. Happy DOM cannot measure them; only the public
// geometry/scroll/load boundary is modeled here. The Storybook fixture needs browser proof.
vi.mock('@shopify/flash-list', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@shopify/flash-list')>();
  const React = await import('react');
  return {
    ...actual,
    FlashList: React.forwardRef<FlashListRef<unknown>, FlashListProps<unknown>>((props, ref) => {
      observed.props = props;
      const captureRef = React.useCallback(
        (list: FlashListRef<unknown> | null) => {
          observed.list = list;
          if (typeof ref === 'function') {
            ref(list);
          } else if (ref) {
            ref.current = list;
          }
        },
        [ref],
      );
      return React.createElement(actual.FlashList, {
        ...props,
        onLoad: undefined,
        ref: captureRef,
      });
    }),
  };
});

const nodes: TreeNode[] = [
  {
    id: 'folders',
    label: 'Folders',
    children: [{ id: 'archive', label: 'Archive', children: [{ id: 'item', label: 'Item' }] }],
  },
  { id: 'other', label: 'Other', children: [{ id: 'other-item', label: 'Other item' }] },
];

beforeEach(() => {
  observed.list = null;
  observed.props = null;
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

function measuredTree(initial: Partial<TreeViewProps> = {}, synchronousScroll = true, strict = false) {
  const props = { nodes, expandByDefault: true, height: 240, ...initial };
  const view = (next: Partial<TreeViewProps> = {}) =>
    strict ? (
      <StrictMode>
        <TreeView {...props} {...next} />
      </StrictMode>
    ) : (
      <TreeView {...props} {...next} />
    );
  const rendered = renderWithProviders(view());
  const geometry = {
    offset: 0,
    height: 240,
    width: 320,
    contentHeight: 2000,
    firstItemOffset: 0,
    measured: true,
    hostVisible: true,
  };
  const emitScroll = (offset: number) => {
    act(() => {
      geometry.offset = offset;
      observed.props?.onScroll?.({
        nativeEvent: {
          contentOffset: { x: 0, y: offset },
          contentSize: { width: geometry.width, height: geometry.contentHeight },
          layoutMeasurement: { width: geometry.width, height: geometry.height },
        },
      } as never);
    });
  };
  const scroll = vi.fn(({ offset }: { offset: number; animated?: boolean }) => {
    if (synchronousScroll) {
      emitScroll(offset);
    }
  });
  const oldScroll = vi.fn(async () => {});
  let attached: FlashListRef<unknown> | null = null;
  const attach = () => {
    const list = observed.list;
    if (!list || list === attached) {
      return;
    }
    attached = list;
    vi.spyOn(screen.getByRole('tree'), 'getBoundingClientRect').mockImplementation(() => ({
      width: geometry.hostVisible ? geometry.width : 0,
      height: geometry.hostVisible ? geometry.height : 0,
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      bottom: geometry.height,
      right: geometry.width,
      toJSON: () => ({}),
    }));
    vi.spyOn(list, 'getWindowSize').mockImplementation(() => geometry);
    vi.spyOn(list, 'getFirstItemOffset').mockImplementation(() => geometry.firstItemOffset);
    vi.spyOn(list, 'getChildContainerDimensions').mockImplementation(() => ({
      width: geometry.width,
      height: geometry.contentHeight - geometry.firstItemOffset,
    }));
    vi.spyOn(list, 'getAbsoluteLastScrollOffset').mockImplementation(() => geometry.offset);
    vi.spyOn(list, 'getLayout').mockImplementation((index) => ({
      x: 0,
      y: index * 400,
      width: geometry.width,
      height: index % 2 ? 32 : 80,
      isHeightMeasured: geometry.measured,
      isWidthMeasured: true,
    }));
    vi.spyOn(list, 'computeVisibleIndices').mockImplementation(() => ({
      startIndex: Math.floor(geometry.offset / 400),
      endIndex: Math.floor((geometry.offset + geometry.height) / 400),
    }));
    vi.spyOn(list, 'scrollToOffset').mockImplementation(scroll);
    vi.spyOn(list, 'scrollToIndex').mockImplementation(oldScroll);
  };
  attach();
  const commitLayout = () => {
    act(() => observed.props?.onCommitLayoutEffect?.());
  };
  const load = () => {
    act(() => observed.props?.onLoad?.({ elapsedTimeInMs: 1 }));
  };
  const contentSize = () => {
    act(() => observed.props?.onContentSizeChange?.(geometry.width, geometry.contentHeight));
  };
  const rerender = (next: Partial<TreeViewProps>) => {
    rendered.rerender(view(next));
    attach();
  };
  return {
    ...rendered,
    rerender,
    geometry,
    scroll,
    oldScroll,
    commitLayout,
    load,
    contentSize,
    emitScroll,
  };
}

describe('TreeView measured reveal scheduling (modeled geometry)', () => {
  it('scrolls the real mounted target and consumes the request only after measurement', async () => {
    const complete = vi.fn();
    const tree = measuredTree({ onRevealComplete: complete });
    tree.geometry.measured = false;
    tree.rerender({ revealRequest: { id: 'item', requestId: 1 }, selectedId: 'item' });
    await waitFor(() => {
      expect(tree.scroll).toHaveBeenCalledWith({ offset: 640, animated: false });
    });
    await settle();
    expect(complete).not.toHaveBeenCalled();
    expect(screen.getByText('Item').closest('[role="treeitem"]')).toHaveAttribute('aria-selected', 'true');
    tree.geometry.offset = 0;
    tree.geometry.measured = true;
    tree.commitLayout();
    await waitFor(() => {
      expect(tree.scroll).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(complete).toHaveBeenCalledExactlyOnceWith({ id: 'item', requestId: 1 });
    });
    tree.geometry.offset = 0;
    tree.commitLayout();
    await settle();
    expect(tree.scroll).toHaveBeenCalledTimes(2);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(tree.oldScroll).not.toHaveBeenCalled();
  });

  it('repeats the same target only when requestId changes, without stealing focus', async () => {
    const complete = vi.fn();
    const tree = measuredTree({ onRevealComplete: complete });
    tree.rerender({ revealRequest: { id: 'item', requestId: 1 } });
    await waitFor(() => {
      expect(tree.scroll).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(complete).toHaveBeenCalledExactlyOnceWith({ id: 'item', requestId: 1 });
    });
    tree.geometry.offset = 0;
    tree.rerender({ revealRequest: { id: 'item', requestId: 1 } });
    tree.commitLayout();
    await settle();
    expect(tree.scroll).toHaveBeenCalledTimes(1);
    expect(complete).toHaveBeenCalledTimes(1);
    tree.rerender({ revealRequest: { id: 'item', requestId: 2 } });
    await waitFor(() => {
      expect(tree.scroll).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(complete).toHaveBeenNthCalledWith(2, { id: 'item', requestId: 2 });
    });
    expect(complete).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('tree')).not.toHaveFocus();
  });

  it('waits for both usable list dimensions and a visible host', async () => {
    const complete = vi.fn();
    const tree = measuredTree({ onRevealComplete: complete });
    tree.geometry.height = 0;
    tree.rerender({ revealRequest: { id: 'item', requestId: 1 } });
    await settle();
    expect(tree.scroll).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
    tree.geometry.height = 240;
    tree.geometry.hostVisible = false;
    tree.commitLayout();
    await settle();
    expect(tree.scroll).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
    tree.geometry.hostVisible = true;
    tree.commitLayout();
    await waitFor(() => {
      expect(tree.scroll).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(complete).toHaveBeenCalledExactlyOnceWith({ id: 'item', requestId: 1 });
    });
  });

  it('cancels queued A when B supersedes it and never starts an uncancellable index scroll', async () => {
    const complete = vi.fn();
    const tree = measuredTree({ onRevealComplete: complete });
    act(() => {
      tree.rerender({ revealRequest: { id: 'item', requestId: 10 } });
      tree.commitLayout();
      tree.rerender({ revealRequest: { id: 'other-item', requestId: 11 } });
    });
    await waitFor(() => {
      expect(tree.scroll).toHaveBeenCalledExactlyOnceWith({ offset: 1440, animated: false });
    });
    await settle();
    tree.commitLayout();
    await settle();
    expect(tree.scroll).toHaveBeenCalledTimes(1);
    expect(tree.oldScroll).not.toHaveBeenCalled();
    expect(complete).toHaveBeenCalledExactlyOnceWith({ id: 'other-item', requestId: 11 });
  });

  it('removing a request cancels its pending scroll', async () => {
    const complete = vi.fn();
    const tree = measuredTree({ onRevealComplete: complete });
    tree.geometry.height = 0;
    tree.rerender({ revealRequest: { id: 'item', requestId: 1 } });
    await settle();
    tree.rerender({ revealRequest: undefined });
    tree.geometry.height = 240;
    tree.commitLayout();
    await settle();
    expect(tree.scroll).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
    tree.rerender({ revealRequest: { id: 'item', requestId: 2 } });
    await waitFor(() => {
      expect(tree.scroll).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(complete).toHaveBeenCalledExactlyOnceWith({ id: 'item', requestId: 2 });
    });
  });

  it('does not schedule more reveal work while its row refs detach on unmount', async () => {
    const complete = vi.fn();
    const tree = measuredTree({ onRevealComplete: complete });
    tree.geometry.height = 0;
    tree.rerender({ revealRequest: { id: 'item', requestId: 1 } });
    await settle();
    const frame = vi.spyOn(globalThis, 'requestAnimationFrame');
    tree.unmount();
    expect(frame).not.toHaveBeenCalled();
    await settle();
    expect(tree.scroll).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
  });

  it('waits for controlled expansion before acknowledging a measured target', async () => {
    const complete = vi.fn();
    const change = vi.fn();
    const tree = measuredTree({
      expandedIds: [],
      onExpandedIdsChange: change,
      onRevealComplete: complete,
    });
    const revealRequest = { id: 'item', requestId: 1 };
    tree.rerender({ revealRequest });
    await waitFor(() => {
      expect(change).toHaveBeenCalledExactlyOnceWith(['folders', 'archive']);
    });
    expect(complete).not.toHaveBeenCalled();
    expect(tree.scroll).not.toHaveBeenCalled();
    tree.rerender({ revealRequest, expandedIds: ['folders', 'archive'] });
    await waitFor(() => {
      expect(complete).toHaveBeenCalledExactlyOnceWith(revealRequest);
    });
  });

  it('waits for the measured row to enter the visible index range', async () => {
    const complete = vi.fn();
    const tree = measuredTree({ onRevealComplete: complete });
    const visible = vi.spyOn(observed.list!, 'computeVisibleIndices').mockReturnValue({ startIndex: 0, endIndex: 0 });
    const revealRequest = { id: 'item', requestId: 1 };
    tree.rerender({ revealRequest });
    await waitFor(() => {
      expect(tree.scroll).toHaveBeenCalledTimes(1);
    });
    await settle();
    expect(complete).not.toHaveBeenCalled();
    visible.mockReturnValue({ startIndex: 1, endIndex: 2 });
    tree.commitLayout();
    await waitFor(() => {
      expect(complete).toHaveBeenCalledExactlyOnceWith(revealRequest);
    });
  });

  it('does not acknowledge a missing target when an already visible request supersedes it', async () => {
    const complete = vi.fn();
    const tree = measuredTree({ onRevealComplete: complete });
    tree.rerender({ revealRequest: { id: 'missing', requestId: 1 } });
    await settle();
    expect(complete).not.toHaveBeenCalled();
    tree.rerender({ revealRequest: { id: 'folders', requestId: 2 } });
    await waitFor(() => {
      expect(complete).toHaveBeenCalledExactlyOnceWith({ id: 'folders', requestId: 2 });
    });
    expect(tree.scroll).not.toHaveBeenCalled();
  });

  it('uses the current callback and marks completion before the callback schedules more layout', async () => {
    const oldComplete = vi.fn();
    const tree = measuredTree({ onRevealComplete: oldComplete });
    tree.geometry.measured = false;
    const revealRequest = { id: 'item', requestId: 1 };
    tree.rerender({ revealRequest });
    await waitFor(() => {
      expect(tree.scroll).toHaveBeenCalledTimes(1);
    });
    const complete = vi.fn(() => {
      tree.commitLayout();
    });
    tree.rerender({ revealRequest, onRevealComplete: complete });
    tree.geometry.measured = true;
    tree.commitLayout();
    await waitFor(() => {
      expect(complete).toHaveBeenCalledExactlyOnceWith(revealRequest);
    });
    const laterComplete = vi.fn();
    tree.rerender({ revealRequest, onRevealComplete: laterComplete });
    tree.commitLayout();
    await settle();
    expect(oldComplete).not.toHaveBeenCalled();
    expect(laterComplete).not.toHaveBeenCalled();
    expect(complete).toHaveBeenCalledTimes(1);
  });
});

describe('TreeView retained scroll (actual list, modeled geometry)', () => {
  it('observes ordinary scrolling without reorder/reveal, deduplicates, and uses the current callback', async () => {
    const change = vi.fn();
    const tree = measuredTree({ onScrollOffsetChange: change });
    tree.load();
    await settle();
    change.mockClear();
    tree.emitScroll(128.5);
    tree.emitScroll(128.5);
    tree.emitScroll(256.25);
    expect(change.mock.calls).toEqual([[128.5], [256.25]]);
    const later = vi.fn();
    tree.rerender({ onScrollOffsetChange: later });
    tree.commitLayout();
    await settle();
    expect(later).not.toHaveBeenCalled();
    tree.emitScroll(300.25);
    expect(later).toHaveBeenCalledExactlyOnceWith(300.25);
    expect(tree.scroll).not.toHaveBeenCalled();
    expect(screen.getByRole('tree').parentElement).not.toHaveAttribute('initialScrollOffset');
  });

  it('restores a saved manual offset after a real remount and never replays callback echoes', async () => {
    let saved = 0;
    const remember = vi.fn((offset: number) => {
      saved = offset;
    });
    const first = measuredTree({ onScrollOffsetChange: remember });
    first.load();
    await settle();
    first.emitScroll(640.5);
    expect(saved).toBe(640.5);
    first.unmount();
    remember.mockClear();
    const tree = measuredTree({ initialScrollOffset: saved, onScrollOffsetChange: remember }, false);
    tree.load();
    await waitFor(() => {
      expect(tree.scroll).toHaveBeenCalledExactlyOnceWith({ offset: 640.5, animated: false });
    });
    expect(remember).not.toHaveBeenCalled();
    tree.commitLayout();
    await settle();
    expect(tree.scroll).toHaveBeenCalledTimes(1);
    tree.emitScroll(640.5);
    await settle();
    expect(remember).toHaveBeenCalledExactlyOnceWith(640.5);
    tree.emitScroll(812.25);
    tree.rerender({ initialScrollOffset: saved });
    tree.commitLayout();
    tree.contentSize();
    await settle();
    expect(saved).toBe(812.25);
    expect(tree.scroll).toHaveBeenCalledTimes(1);
  });

  it('waits through empty data, load, zero viewport and hidden host without overwriting memory', async () => {
    const change = vi.fn();
    const tree = measuredTree({
      nodes: [],
      initialScrollOffset: 640.5,
      onScrollOffsetChange: change,
    });
    await settle();
    expect(change).not.toHaveBeenCalled();
    tree.rerender({ nodes });
    tree.geometry.height = 0;
    tree.load();
    tree.emitScroll(0);
    await settle();
    expect(tree.scroll).not.toHaveBeenCalled();
    tree.geometry.height = 240;
    tree.geometry.hostVisible = false;
    tree.commitLayout();
    await settle();
    expect(tree.scroll).not.toHaveBeenCalled();
    expect(change).not.toHaveBeenCalled();
    tree.geometry.hostVisible = true;
    tree.commitLayout();
    await waitFor(() => {
      expect(tree.scroll).toHaveBeenCalledExactlyOnceWith({ offset: 640.5, animated: false });
    });
    await waitFor(() => {
      expect(change).toHaveBeenCalledExactlyOnceWith(640.5);
    });
  });

  it.each([
    [9999, 1000, 760],
    [-3, 1000, 0],
    [Number.NaN, 1000, 0],
    [Number.POSITIVE_INFINITY, 1000, 0],
    [125.75, 1000, 125.75],
    [0.5, 1000, 0.5],
    [900, 120, 0],
  ])('clamps seed %s using content %s to observed %s', async (seed, contentHeight, expected) => {
    const change = vi.fn();
    const tree = measuredTree({ initialScrollOffset: seed, onScrollOffsetChange: change });
    tree.geometry.contentHeight = contentHeight;
    tree.load();
    await waitFor(() => {
      expect(change).toHaveBeenCalledExactlyOnceWith(expected);
    });
    if (expected === 0) {
      expect(tree.scroll).not.toHaveBeenCalled();
    } else {
      expect(tree.scroll).toHaveBeenCalledExactlyOnceWith({ offset: expected, animated: false });
    }
  });

  it('does not clamp a seed against provisional empty content before load', async () => {
    const change = vi.fn();
    const tree = measuredTree({ initialScrollOffset: 900, onScrollOffsetChange: change });
    tree.geometry.contentHeight = 0;
    tree.contentSize();
    tree.commitLayout();
    await settle();
    expect(tree.scroll).not.toHaveBeenCalled();
    expect(change).not.toHaveBeenCalled();
    tree.geometry.contentHeight = 1040;
    tree.geometry.firstItemOffset = 40;
    tree.contentSize();
    await settle();
    expect(tree.scroll).not.toHaveBeenCalled();
    tree.load();
    await waitFor(() => {
      expect(change).toHaveBeenCalledExactlyOnceWith(800);
    });
    expect(tree.scroll).toHaveBeenCalledExactlyOnceWith({ offset: 800, animated: false });
  });

  it('freezes the initial seed while pending and ignores subsequent additions or replacements', async () => {
    const tree = measuredTree({ initialScrollOffset: 640.5 });
    tree.rerender({ initialScrollOffset: 900 });
    tree.load();
    await waitFor(() => {
      expect(tree.scroll).toHaveBeenCalledExactlyOnceWith({ offset: 640.5, animated: false });
    });
    tree.emitScroll(700);
    tree.rerender({ initialScrollOffset: 20, nodes: [...nodes], height: 320 });
    tree.geometry.height = 320;
    tree.commitLayout();
    await settle();
    expect(tree.scroll).toHaveBeenCalledTimes(1);
    tree.unmount();
    const absent = measuredTree();
    absent.rerender({ initialScrollOffset: 900 });
    absent.load();
    await settle();
    expect(absent.scroll).not.toHaveBeenCalled();
  });

  it('gives a pending reveal precedence and never resurrects the seed after cancellation', async () => {
    const complete = vi.fn();
    const change = vi.fn();
    const tree = measuredTree({
      initialScrollOffset: 640.5,
      revealRequest: { id: 'missing', requestId: 1 },
      onRevealComplete: complete,
      onScrollOffsetChange: change,
    });
    tree.load();
    await settle();
    expect(tree.scroll).not.toHaveBeenCalled();
    tree.rerender({ revealRequest: undefined });
    tree.commitLayout();
    await settle();
    expect(tree.scroll).not.toHaveBeenCalled();
    tree.rerender({ revealRequest: { id: 'other-item', requestId: 2 } });
    await waitFor(() => {
      expect(complete).toHaveBeenCalledExactlyOnceWith({ id: 'other-item', requestId: 2 });
    });
    expect(tree.scroll).toHaveBeenCalledExactlyOnceWith({ offset: 1440, animated: false });
    expect(change).toHaveBeenLastCalledWith(1440);
    tree.emitScroll(300);
    tree.rerender({ revealRequest: undefined });
    tree.commitLayout();
    await settle();
    expect(tree.scroll).toHaveBeenCalledTimes(1);
  });

  it('cancels queued restoration when a new reveal arrives', async () => {
    const tree = measuredTree({ initialScrollOffset: 640.5 });
    act(() => {
      tree.load();
      tree.rerender({ revealRequest: { id: 'other-item', requestId: 3 } });
    });
    await waitFor(() => {
      expect(tree.scroll).toHaveBeenCalledExactlyOnceWith({ offset: 1440, animated: false });
    });
  });

  it.each(['drag', 'movement', 'keyboard'])('yields pending restoration to newer %s interaction', async (kind) => {
    const tree = measuredTree({ initialScrollOffset: 640.5 });
    act(() => {
      tree.load();
      if (kind === 'drag') {
        observed.props?.onScrollBeginDrag?.({
          nativeEvent: { contentOffset: { y: 0 } },
        } as never);
      } else if (kind === 'movement') {
        tree.emitScroll(80);
      } else {
        fireEvent.keyDown(screen.getByRole('tree'), { key: 'End' });
      }
    });
    await settle();
    expect(tree.scroll).not.toHaveBeenCalled();
    if (kind === 'keyboard') {
      expect(tree.oldScroll).toHaveBeenCalled();
    }
  });

  it('recomputes bounds while pending but does not replay after later shrink and growth', async () => {
    const change = vi.fn();
    const tree = measuredTree({ initialScrollOffset: 9999, onScrollOffsetChange: change }, false);
    tree.geometry.contentHeight = 1000;
    tree.load();
    await waitFor(() => {
      expect(tree.scroll).toHaveBeenLastCalledWith({ offset: 760, animated: false });
    });
    tree.geometry.contentHeight = 500;
    tree.contentSize();
    await waitFor(() => {
      expect(tree.scroll).toHaveBeenLastCalledWith({ offset: 260, animated: false });
    });
    tree.emitScroll(260);
    await settle();
    expect(change).toHaveBeenCalledExactlyOnceWith(260);
    tree.geometry.contentHeight = 1000;
    tree.contentSize();
    tree.commitLayout();
    await settle();
    expect(tree.scroll).toHaveBeenCalledTimes(2);
    tree.emitScroll(Number.NaN);
    tree.emitScroll(-25);
    tree.emitScroll(10000);
    expect(change.mock.calls).toEqual([[260], [0], [760]]);
  });

  it('does not emit or schedule restoration during teardown or a callback-triggered unmount', async () => {
    const change = vi.fn();
    const pending = measuredTree({ initialScrollOffset: 640.5, onScrollOffsetChange: change });
    pending.load();
    pending.unmount();
    await settle();
    expect(pending.scroll).not.toHaveBeenCalled();
    expect(change).not.toHaveBeenCalled();
    const tree = measuredTree({
      initialScrollOffset: 640.5,
      onScrollOffsetChange: () => {
        tree.unmount();
      },
    });
    tree.load();
    await waitFor(() => {
      expect(tree.scroll).toHaveBeenCalledTimes(1);
    });
    await settle();
    expect(screen.queryByRole('tree')).toBeNull();
  });
});

describe('TreeView retained scroll arbitration', () => {
  it('confirms a command by fresh layout readback without a synthetic scroll event', async () => {
    const change = vi.fn();
    const tree = measuredTree({ initialScrollOffset: 640.5, onScrollOffsetChange: change }, false);
    tree.load();
    await waitFor(() => {
      expect(tree.scroll).toHaveBeenCalledTimes(1);
    });
    expect(change).not.toHaveBeenCalled();
    tree.geometry.offset = 640.5;
    tree.commitLayout();
    await waitFor(() => {
      expect(change).toHaveBeenCalledExactlyOnceWith(640.5);
    });
    tree.geometry.offset = 500;
    tree.geometry.contentHeight = 600;
    tree.contentSize();
    await waitFor(() => {
      expect(change).toHaveBeenLastCalledWith(360);
    });
    tree.geometry.contentHeight = 2000;
    tree.contentSize();
    await settle();
    expect(tree.scroll).toHaveBeenCalledTimes(1);
  });

  it.each(['wheel', 'pointer', 'drag'])(
    'yields an unacknowledged command to %s without retrying on resize',
    async (kind) => {
      const change = vi.fn();
      const tree = measuredTree({ initialScrollOffset: 9999, onScrollOffsetChange: change }, false);
      tree.load();
      await waitFor(() => {
        expect(tree.scroll).toHaveBeenCalledTimes(1);
      });
      if (kind === 'wheel') {
        fireEvent.wheel(screen.getByRole('tree'), { deltaY: 20 });
      } else if (kind === 'pointer') {
        fireEvent.pointerDown(screen.getByRole('tree'));
      } else {
        act(() => observed.props?.onScrollBeginDrag?.({} as never));
      }
      tree.emitScroll(300.5);
      tree.geometry.contentHeight = 1000;
      tree.contentSize();
      await settle();
      expect(change).toHaveBeenCalledExactlyOnceWith(300.5);
      expect(tree.scroll).toHaveBeenCalledTimes(1);
    },
  );

  it('does not rearm consumed restoration when the mounted tree loses and regains its data', async () => {
    const change = vi.fn();
    const tree = measuredTree({ initialScrollOffset: 640.5, onScrollOffsetChange: change });
    tree.load();
    await waitFor(() => {
      expect(change).toHaveBeenCalledExactlyOnceWith(640.5);
    });
    tree.rerender({ nodes: [] });
    tree.geometry.offset = 0;
    tree.rerender({ nodes });
    tree.load();
    tree.commitLayout();
    await settle();
    expect(tree.scroll).toHaveBeenCalledTimes(1);
    expect(change).toHaveBeenLastCalledWith(0);
  });

  it('retains one restoration through Strict Mode effect replay and ignores detached events', async () => {
    const change = vi.fn();
    const tree = measuredTree({ initialScrollOffset: 640.5, onScrollOffsetChange: change }, true, true);
    tree.load();
    await waitFor(() => {
      expect(change).toHaveBeenCalledExactlyOnceWith(640.5);
    });
    const detached = observed.props;
    tree.unmount();
    act(() => {
      detached?.onLoad?.({ elapsedTimeInMs: 1 });
      detached?.onCommitLayoutEffect?.();
      detached?.onScroll?.({ nativeEvent: { contentOffset: { y: 900 } } } as never);
    });
    await settle();
    expect(tree.scroll).toHaveBeenCalledTimes(1);
    expect(change).toHaveBeenCalledTimes(1);
  });

  it('reports actual keyboard and drag-list movements without publishing index requests', async () => {
    const change = vi.fn();
    const tree = measuredTree({ onNodeMove: vi.fn(), onScrollOffsetChange: change });
    tree.load();
    await settle();
    change.mockClear();
    fireEvent.keyDown(screen.getByRole('tree'), { key: 'End' });
    expect(tree.oldScroll).toHaveBeenCalled();
    expect(change).not.toHaveBeenCalled();
    tree.emitScroll(300.25);
    act(() => observed.props?.onScrollBeginDrag?.({} as never));
    tree.emitScroll(400.5);
    expect(change.mock.calls).toEqual([[300.25], [400.5]]);
  });
});

it('retries an unacknowledged target only when real bounds change', async () => {
  const change = vi.fn();
  const tree = measuredTree({ initialScrollOffset: 640.5, onScrollOffsetChange: change }, false);
  tree.load();
  await waitFor(() => {
    expect(tree.scroll).toHaveBeenCalledTimes(1);
  });
  tree.geometry.width = 400;
  tree.commitLayout();
  await waitFor(() => {
    expect(tree.scroll).toHaveBeenCalledTimes(2);
  });
  tree.commitLayout();
  tree.contentSize();
  await settle();
  expect(tree.scroll).toHaveBeenCalledTimes(2);
  expect(change).not.toHaveBeenCalled();
  tree.emitScroll(641);
  expect(change).toHaveBeenCalledExactlyOnceWith(641);
  tree.geometry.width = 420;
  tree.commitLayout();
  await settle();
  expect(tree.scroll).toHaveBeenCalledTimes(2);
});

it('keeps observing a frozen pending seed when the initial prop is removed', async () => {
  const tree = measuredTree({ initialScrollOffset: 640.5 }, false);
  tree.rerender({ initialScrollOffset: undefined });
  expect(observed.props?.onScroll).toBeTypeOf('function');
  tree.load();
  await waitFor(() => {
    expect(tree.scroll).toHaveBeenCalledTimes(1);
  });
  tree.emitScroll(640.5);
  tree.geometry.width = 400;
  tree.commitLayout();
  await settle();
  expect(tree.scroll).toHaveBeenCalledTimes(1);
});

it('retries a pending seed for a newly attached list after temporary empty data', async () => {
  const change = vi.fn();
  const tree = measuredTree({ initialScrollOffset: 640.5, onScrollOffsetChange: change }, false);
  tree.load();
  await waitFor(() => {
    expect(tree.scroll).toHaveBeenCalledTimes(1);
  });
  tree.rerender({ nodes: [] });
  tree.rerender({ nodes });
  tree.load();
  await waitFor(() => {
    expect(tree.scroll).toHaveBeenCalledTimes(2);
  });
  expect(change).not.toHaveBeenCalled();
  tree.emitScroll(640.5);
  expect(change).toHaveBeenCalledExactlyOnceWith(640.5);
});

describe('TreeView retained scroll lifecycle', () => {
  it('ignores detached layout, drag and scroll callbacks while a replacement restore is pending', async () => {
    const change = vi.fn();
    const tree = measuredTree({ initialScrollOffset: 640.5, onScrollOffsetChange: change }, false);
    const detached = observed.props;
    tree.rerender({ nodes: [] });
    tree.rerender({ nodes });
    act(() => detached?.onScrollBeginDrag?.({} as never));
    tree.load();
    await waitFor(() => {
      expect(tree.scroll).toHaveBeenCalledExactlyOnceWith({ offset: 640.5, animated: false });
    });
    const frame = vi.spyOn(globalThis, 'requestAnimationFrame');
    act(() => {
      detached?.onLoad?.({ elapsedTimeInMs: 1 });
      detached?.onCommitLayoutEffect?.();
      detached?.onContentSizeChange?.(320, 120);
      detached?.onScroll?.({ nativeEvent: { contentOffset: { y: 640.5 } } } as never);
    });
    expect(frame).not.toHaveBeenCalled();
    await settle();
    expect(change).not.toHaveBeenCalled();
    expect(tree.scroll).toHaveBeenCalledTimes(1);
    tree.emitScroll(640.5);
    expect(change).toHaveBeenCalledExactlyOnceWith(640.5);
  });

  it("accepts this list's delayed load across an ordinary callback and data rerender", async () => {
    const previous = vi.fn();
    const current = vi.fn();
    const tree = measuredTree({ initialScrollOffset: 640.5, onScrollOffsetChange: previous });
    const initialProps = observed.props;
    tree.rerender({ nodes: [...nodes], onScrollOffsetChange: current });
    act(() => initialProps?.onLoad?.({ elapsedTimeInMs: 1 }));
    await waitFor(() => {
      expect(current).toHaveBeenCalledExactlyOnceWith(640.5);
    });
    expect(previous).not.toHaveBeenCalled();
    expect(tree.scroll).toHaveBeenCalledExactlyOnceWith({ offset: 640.5, animated: false });
  });

  it('uses the new tree geometry when an observed-offset callback replaces data and reveal', async () => {
    let replaced = false;
    const change = vi.fn(() => {
      if (replaced) {
        return;
      }
      replaced = true;
      tree.rerender({
        nodes: [nodes[1], nodes[0]],
        revealRequest: { id: 'other-item', requestId: 91 },
      });
    });
    const tree = measuredTree({ onScrollOffsetChange: change });
    tree.load();
    await waitFor(() => {
      expect(tree.scroll).toHaveBeenCalled();
    });
    await settle();
    expect(tree.scroll.mock.calls.map(([args]) => args.offset)).toEqual([192]);
  });

  it("does not let a detached list's delayed load ready the replacement list", async () => {
    const change = vi.fn();
    const tree = measuredTree({ initialScrollOffset: 640.5, onScrollOffsetChange: change }, false);
    const detached = observed.props;
    tree.rerender({ nodes: [] });
    tree.rerender({ nodes });
    act(() => detached?.onLoad?.({ elapsedTimeInMs: 1 }));
    await settle();
    expect(tree.scroll).not.toHaveBeenCalled();
    expect(change).not.toHaveBeenCalled();
    tree.load();
    await waitFor(() => {
      expect(tree.scroll).toHaveBeenCalledExactlyOnceWith({ offset: 640.5, animated: false });
    });
  });
});

it('positive control: a committed replacement tree reveals using the new index', async () => {
  const tree = measuredTree({ onScrollOffsetChange: vi.fn() });
  tree.load();
  await settle();
  tree.rerender({
    nodes: [nodes[1], nodes[0]],
    revealRequest: { id: 'other-item', requestId: 91 },
  });
  await waitFor(() => {
    expect(tree.scroll).toHaveBeenCalledExactlyOnceWith({ offset: 192, animated: false });
  });
});

it('retains a seed across a stale load with provisional content, then restores after the current load', async () => {
  const change = vi.fn();
  const tree = measuredTree({ initialScrollOffset: 640.5, onScrollOffsetChange: change });
  const detached = observed.props;
  tree.rerender({ nodes: [] });
  tree.rerender({ nodes });
  tree.geometry.contentHeight = 120;
  act(() => detached?.onLoad?.({ elapsedTimeInMs: 1 }));
  await settle();
  tree.geometry.contentHeight = 2000;
  tree.load();
  tree.contentSize();
  await settle();
  expect(change.mock.calls).toEqual([[640.5]]);
  expect(tree.scroll).toHaveBeenCalledExactlyOnceWith({ offset: 640.5, animated: false });
});

it('positive control: a replacement list waits for its own load with provisional content', async () => {
  const change = vi.fn();
  const tree = measuredTree({ initialScrollOffset: 640.5, onScrollOffsetChange: change });
  tree.rerender({ nodes: [] });
  tree.rerender({ nodes });
  tree.geometry.contentHeight = 120;
  tree.contentSize();
  await settle();
  expect(change).not.toHaveBeenCalled();
  tree.geometry.contentHeight = 2000;
  tree.load();
  await waitFor(() => {
    expect(change).toHaveBeenCalledExactlyOnceWith(640.5);
  });
});
