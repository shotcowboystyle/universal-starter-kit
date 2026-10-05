import { describe, expect, it } from 'vitest';

import {
  MIN_PRESS_TARGET,
  NARROW_BREAKPOINT,
  OVERLAY_ANCHOR_GAP,
  OVERLAY_ATTACH_GAP,
  OVERLAY_BREAKPOINT,
  READING_WIDTH_CH,
  READING_WIDTH_MAX_CH,
  READING_WIDTH_MIN_CH,
  defaultMaxPanes,
  getLayoutSizeClass,
  isTouchSurface,
  layoutBreakpoints,
  layoutSizeClassAtLeast,
  pressTargetHitSlop,
  pressTargetStyle,
  readingWidthStyle,
} from './layoutTokens';

describe('layoutBreakpoints', () => {
  it('pivots overlays at medium 640 (Tamagui $sm); expanded 860 stays the pane class', () => {
    expect(layoutBreakpoints.expanded).toBe(860);
    expect(OVERLAY_BREAKPOINT).toBe(640);
    expect(OVERLAY_BREAKPOINT).toBe(layoutBreakpoints.medium);
  });

  it('documents DeskShell narrow as medium 640', () => {
    expect(layoutBreakpoints.medium).toBe(640);
    expect(NARROW_BREAKPOINT).toBe(640);
  });

  it('maps widths to size classes', () => {
    expect(getLayoutSizeClass(360)).toBe('compact');
    expect(getLayoutSizeClass(640)).toBe('medium');
    expect(getLayoutSizeClass(859)).toBe('medium');
    expect(getLayoutSizeClass(860)).toBe('expanded');
    expect(getLayoutSizeClass(1024)).toBe('large');
    expect(getLayoutSizeClass(1280)).toBe('xl');
  });

  it('defaults to 1 pane below expanded, 2 at expanded+', () => {
    expect(defaultMaxPanes('compact')).toBe(1);
    expect(defaultMaxPanes('medium')).toBe(1);
    expect(defaultMaxPanes('expanded')).toBe(2);
    expect(defaultMaxPanes('large')).toBe(2);
    expect(defaultMaxPanes('xl')).toBe(2);
  });

  it('compares size classes ordinally', () => {
    expect(layoutSizeClassAtLeast('expanded', 'expanded')).toBe(true);
    expect(layoutSizeClassAtLeast('medium', 'expanded')).toBe(false);
    expect(layoutSizeClassAtLeast('xl', 'large')).toBe(true);
  });
});

describe('readingWidthStyle', () => {
  it('defaults to ~70ch within 65–75', () => {
    expect(READING_WIDTH_CH).toBeGreaterThanOrEqual(READING_WIDTH_MIN_CH);
    expect(READING_WIDTH_CH).toBeLessThanOrEqual(READING_WIDTH_MAX_CH);
    expect(readingWidthStyle()).toEqual({ maxWidth: '70ch', width: '100%' });
  });

  it('clamps and supports eject', () => {
    expect(readingWidthStyle(40)).toEqual({ maxWidth: '65ch', width: '100%' });
    expect(readingWidthStyle(90)).toEqual({ maxWidth: '75ch', width: '100%' });
    expect(readingWidthStyle('none')).toEqual({});
    expect(readingWidthStyle(null)).toEqual({});
  });
});

describe('overlay anchoring', () => {
  it('pins the free-overlay gap at 4px and the attach gap at 0', () => {
    expect(OVERLAY_ANCHOR_GAP).toBe(4);
    expect(OVERLAY_ATTACH_GAP).toBe(0);
  });
});

describe('press target', () => {
  it('exports 44px floor + hitSlop expansion', () => {
    expect(MIN_PRESS_TARGET).toBe(44);
    expect(pressTargetStyle()).toEqual({ minWidth: 44, minHeight: 44 });
    expect(pressTargetHitSlop(24)).toEqual({ top: 10, bottom: 10, left: 10, right: 10 });
    expect(pressTargetHitSlop(44)).toEqual({ top: 0, bottom: 0, left: 0, right: 0 });
  });
});

describe('isTouchSurface', () => {
  it('is false in the default test environment', () => {
    expect(isTouchSurface()).toBe(false);
  });
});
