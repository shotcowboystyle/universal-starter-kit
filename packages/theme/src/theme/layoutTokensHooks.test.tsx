import { TestProviders } from '@repo/test-utils';
/**
 * Layout hook specs — the live half of layoutTokens: the
 * viewport-driven `useLayoutSizeClass`, the pane budget `useMultiPane`, and
 * the semantic gap roles `useSemanticGaps`. Locks down: widths resolve to the
 * canonical size classes at mount, one matchMedia listener per breakpoint is
 * registered and removed, and gap roles ride the space-knob recipes.
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Controllable native-dimensions stub: the web path under test ignores it, but
// tests may mutate `width` to exercise the native fallback deterministically.
const nativeWindowDimensions = vi.hoisted(() => ({
  width: 1024,
  height: 768,
  scale: 2,
  fontScale: 1,
}));

// Partial mock: real tamagui exports pass through so future imports in
// layoutTokens don't break the suite; only the members the spec must control
// are stubbed.
vi.mock(import('tamagui'), async (importOriginal) => ({
  ...(await importOriginal()),
  // Pin the web path — these specs drive size class via matchMedia listeners.
  isWeb: true,
  useThemeName: () => 'light',
  useWindowDimensions: () => nativeWindowDimensions,
}));

import { layoutBreakpoints, useLayoutSizeClass, useMultiPane, useSemanticGaps } from './layoutTokens';
import { useResolvedKnobs } from './useResolvedKnobs';

interface FakeMq {
  media: string;
  matches: boolean;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
}

let createdQueries: FakeMq[];
let originalMatchMedia: typeof window.matchMedia;
let originalInnerWidth: number;

function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', {
    value: width,
    writable: true,
    configurable: true,
  });
}

beforeEach(() => {
  createdQueries = [];
  originalMatchMedia = window.matchMedia;
  originalInnerWidth = window.innerWidth;
  window.matchMedia = vi.fn((media: string): MediaQueryList => {
    const mq: FakeMq = {
      media,
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    createdQueries.push(mq);
    return mq as unknown as MediaQueryList;
  }) as typeof window.matchMedia;
});

afterEach(() => {
  window.matchMedia = originalMatchMedia;
  setViewportWidth(originalInnerWidth);
});

describe('useLayoutSizeClass', () => {
  it.each([
    [500, 'compact'],
    [layoutBreakpoints.medium, 'medium'],
    [layoutBreakpoints.expanded, 'expanded'],
    [layoutBreakpoints.large, 'large'],
    [layoutBreakpoints.xl, 'xl'],
  ] as const)('resolves width %dpx to %s at mount', (width, expected) => {
    setViewportWidth(width);
    const { result } = renderHook(() => useLayoutSizeClass());
    expect(result.current).toBe(expected);
  });

  it('registers a matchMedia listener per breakpoint and removes them on unmount', () => {
    setViewportWidth(900);
    const { unmount } = renderHook(() => useLayoutSizeClass());
    expect(createdQueries).toHaveLength(4);
    const medias = createdQueries.map((mq) => mq.media);
    expect(medias).toEqual(
      expect.arrayContaining([
        `(min-width: ${layoutBreakpoints.medium}px)`,
        `(min-width: ${layoutBreakpoints.expanded}px)`,
        `(min-width: ${layoutBreakpoints.large}px)`,
        `(min-width: ${layoutBreakpoints.xl}px)`,
      ]),
    );
    for (const mq of createdQueries) {
      expect(mq.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    }
    unmount();
    for (const mq of createdQueries) {
      expect(mq.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    }
  });

  it('re-syncs from the viewport when a breakpoint query fires', () => {
    setViewportWidth(500);
    const { result } = renderHook(() => useLayoutSizeClass());
    expect(result.current).toBe('compact');
    // Simulate crossing into expanded: update the viewport and fire any
    // registered breakpoint listener.
    setViewportWidth(1000);
    const handler = createdQueries[0].addEventListener.mock.calls[0][1] as () => void;
    act(() => {
      handler();
    });
    expect(result.current).toBe('expanded');
  });
});

describe('useMultiPane', () => {
  it('allows two panes at expanded and wider', () => {
    setViewportWidth(layoutBreakpoints.expanded);
    const { result } = renderHook(() => useMultiPane());
    expect(result.current).toBe(true);
  });

  it('forces a single pane below expanded', () => {
    setViewportWidth(700);
    const { result } = renderHook(() => useMultiPane());
    expect(result.current).toBe(false);
  });

  it('honors an explicit single-pane budget even on wide viewports', () => {
    setViewportWidth(1400);
    const { result } = renderHook(() => useMultiPane(1));
    expect(result.current).toBe(false);
  });
});

describe('useSemanticGaps', () => {
  it('maps within-group to knob gap and between-groups to the large gap', () => {
    setViewportWidth(1000);
    const { result: knobs } = renderHook(() => useResolvedKnobs(), { wrapper: TestProviders });
    const { result } = renderHook(() => useSemanticGaps(), { wrapper: TestProviders });
    expect(result.current.withinGroup).toEqual(knobs.current.knobProps.gap);
    expect(result.current.betweenGroups).toEqual(knobs.current.knobProps.gapLg);
    // The roles must differ, or grouping hierarchy is invisible.
    expect(result.current.withinGroup.gap).not.toBe(result.current.betweenGroups.gap);
  });
});
