/**
 * ScrollArrow direction math (rtl-audit U1-class residual): CSSOM flips the
 * scrollLeft range under RTL (0 → −(scrollWidth − clientWidth)), so the raw
 * LTR reading inverted both arrow visibility and the remaining-distance
 * clamp. `horizontalScrollEdges` is the direction-normalized primitive both
 * the visibility hook and the hover-scroll loop consume.
 */
import { describe, expect, it, vi } from 'vitest';

// The module under test imports useDirection (house RTL pattern); the pure
// edge math is exercised with explicit directions (same wholesale-mock
// precedent as toolbarPrimitives.spec).
vi.mock(import('@repo/ui'), () => ({
  useDirection: () => 'ltr',
}));

const { horizontalScrollEdges } = await import('./use-horizontal-scroll');

const scroller = (scrollLeft: number) => ({ scrollLeft, scrollWidth: 500, clientWidth: 300 });

describe('horizontalScrollEdges', () => {
  it('LTR: scrollLeft is the distance from the left edge', () => {
    expect(horizontalScrollEdges(scroller(0), 'ltr')).toStrictEqual({
      fromLeftEdge: 0,
      fromRightEdge: 200,
    });
    expect(horizontalScrollEdges(scroller(120), 'ltr')).toStrictEqual({
      fromLeftEdge: 120,
      fromRightEdge: 80,
    });
    expect(horizontalScrollEdges(scroller(200), 'ltr')).toStrictEqual({
      fromLeftEdge: 200,
      fromRightEdge: 0,
    });
  });

  it('RTL: scrollLeft runs 0 → −range, distances normalize per edge', () => {
    // Start position (flush right): everything overflows to the LEFT.
    expect(horizontalScrollEdges(scroller(0), 'rtl')).toStrictEqual({
      fromLeftEdge: 200,
      fromRightEdge: 0,
    });
    expect(horizontalScrollEdges(scroller(-120), 'rtl')).toStrictEqual({
      fromLeftEdge: 80,
      fromRightEdge: 120,
    });
    // Fully scrolled (flush left): nothing further left, all content right.
    expect(horizontalScrollEdges(scroller(-200), 'rtl')).toStrictEqual({
      fromLeftEdge: 0,
      fromRightEdge: 200,
    });
  });

  it('no overflow: both distances collapse to zero in both directions', () => {
    const flat = { scrollLeft: 0, scrollWidth: 300, clientWidth: 300 };
    expect(horizontalScrollEdges(flat, 'ltr')).toStrictEqual({ fromLeftEdge: 0, fromRightEdge: 0 });
    expect(horizontalScrollEdges(flat, 'rtl')).toStrictEqual({ fromLeftEdge: 0, fromRightEdge: 0 });
  });

  it('pre-fix regression: raw scrollLeft sign misreads RTL edges', () => {
    // The old visibility math (scrollLeft > threshold) at the RTL start
    // position read 0 → no left arrow, while 200px actually overflowed left.
    const atRtlStart = horizontalScrollEdges(scroller(0), 'rtl');
    expect(atRtlStart.fromLeftEdge).toBeGreaterThan(8);
    expect(atRtlStart.fromRightEdge).toBeLessThanOrEqual(8);
  });
});
