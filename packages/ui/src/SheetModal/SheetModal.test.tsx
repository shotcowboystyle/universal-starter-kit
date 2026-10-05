import { describe, expect, it } from 'vitest';

import { mediumDetent, minSheetHeight, resolveSheetDetents } from './detents';

/*
 * Acceptance: "SheetModal's snapPoint prop either drives a detent or is
 * removed". It drives one. These lock that in, because it has already been
 * lost once: an earlier rewrite rebuilt the detents block from a stale
 * copy and dropped the snapPoint push, leaving the prop declared, documented
 * and passed by four callers while doing nothing on device.
 *
 * Geometry under test is a pure height list, largest first. The component's
 * PanResponder turns each height h into a resting translate of `travel - h`.
 */

const travel = 600;

describe('resolveSheetDetents', () => {
  it('a plain sheet has exactly one rest: fully expanded', () => {
    expect(resolveSheetDetents({ travel })).toEqual([600]);
  });

  it('REGRESSION: snapPoint creates a detent instead of being ignored', () => {
    // The bug this spec exists for: main returned [600] here.
    expect(resolveSheetDetents({ travel, snapPoint: 85 })).toEqual([600, 510]);
  });

  it('reads snapPoint as a percent of the full height, matching the web Sheet', () => {
    expect(resolveSheetDetents({ travel, snapPoint: 50 })).toEqual([600, 300]);
    expect(resolveSheetDetents({ travel, snapPoint: 60 })).toEqual([600, 360]);
    expect(resolveSheetDetents({ travel, snapPoint: 92 })).toEqual([600, 552]);
  });

  it('honours the four heights real callers pass', () => {
    // CommandPalette 92, list-tools-sheet 85, ListThemePlayground 85,
    // Toast.stories 70 — every one of these was a no-op on device.
    for (const snapPoint of [92, 85, 70]) {
      const detents = resolveSheetDetents({ travel, snapPoint });
      expect(detents).toContain(Math.round(travel * (snapPoint / 100)));
      expect(detents.length).toBeGreaterThan(1);
    }
  });

  it('a scrollable sheet keeps its half-open detent', () => {
    expect(resolveSheetDetents({ travel, scrollable: true })).toEqual([600, Math.round(travel * mediumDetent)]);
  });

  it('scrollable and snapPoint stack, largest first, no duplicates', () => {
    // 600 expanded, 330 medium, 510 from snapPoint.
    expect(resolveSheetDetents({ travel, scrollable: true, snapPoint: 85 })).toEqual([600, 510, 330]);
  });

  it('dedupes a snapPoint that lands on a detent already present', () => {
    expect(resolveSheetDetents({ travel, snapPoint: 100 })).toEqual([600]);
    expect(resolveSheetDetents({ travel, scrollable: true, snapPoint: 55 })).toEqual([600, 330]);
  });

  it('clamps a snapPoint above 100 to fully expanded', () => {
    expect(resolveSheetDetents({ travel, snapPoint: 140 })).toEqual([600]);
  });

  it('drops a detent shorter than the floor rather than resting near-dismissed', () => {
    // 600 * 0.10 = 60, well under minSheetHeight.
    expect(resolveSheetDetents({ travel, snapPoint: 10 })).toEqual([600]);
    expect(minSheetHeight).toBe(180);
  });

  it('a sheet shorter than the floor still keeps its own full height', () => {
    expect(resolveSheetDetents({ travel: 120, scrollable: true, snapPoint: 85 })).toEqual([120]);
  });

  it('ignores a snapPoint that is not a usable number', () => {
    for (const snapPoint of [0, -20, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(resolveSheetDetents({ travel, snapPoint })).toEqual([600]);
    }
    expect(resolveSheetDetents({ travel, snapPoint: undefined })).toEqual([600]);
  });

  it('always returns descending heights, so the pan release can scan in order', () => {
    const detents = resolveSheetDetents({ travel, scrollable: true, snapPoint: 40 });
    expect(detents).toEqual([...detents].sort((a, b) => b - a));
    expect(new Set(detents).size).toBe(detents.length);
  });
});
