import { OVERLAY_ANCHOR_GAP } from '@repo/theme';
import { describe, expect, it } from 'vitest';

import { contextMenuPoint, placeAtPoint, pointOpensUp, pointPanelLeft, type PanelBounds } from './pointAnchor';

const bounds: PanelBounds = { top: 10, left: 10, right: 1014, bottom: 758 };
const gap = OVERLAY_ANCHOR_GAP;

describe('pointPanelLeft', () => {
  it("puts the panel's start edge on the point when it fits", () => {
    expect(pointPanelLeft({ x: 300, y: 0 }, 200, bounds)).toEqual({ left: 300, alignEnd: false });
  });

  it('flips to open toward the start when the end side would overflow', () => {
    expect(pointPanelLeft({ x: 900, y: 0 }, 200, bounds)).toEqual({ left: 700, alignEnd: true });
  });

  it('clamps into the bounds when neither side fits', () => {
    const narrow: PanelBounds = { top: 10, left: 10, right: 310, bottom: 758 };
    expect(pointPanelLeft({ x: 200, y: 0 }, 250, narrow)).toEqual({ left: 60, alignEnd: false });
  });

  it('pins to the start bound when the panel is wider than the bounds', () => {
    const narrow: PanelBounds = { top: 10, left: 10, right: 110, bottom: 758 };
    expect(pointPanelLeft({ x: 50, y: 0 }, 400, narrow).left).toBe(10);
  });

  it('opens toward the left from the point in RTL and flips right at the left edge', () => {
    expect(pointPanelLeft({ x: 600, y: 0 }, 200, bounds, true)).toEqual({
      left: 400,
      alignEnd: false,
    });
    expect(pointPanelLeft({ x: 100, y: 0 }, 200, bounds, true)).toEqual({
      left: 100,
      alignEnd: true,
    });
  });
});

describe('pointOpensUp', () => {
  it('opens down whenever the panel fits below the point', () => {
    expect(pointOpensUp({ x: 0, y: 600 }, 150, bounds, gap)).toBe(false);
  });

  it('flips up when only the space above fits', () => {
    expect(pointOpensUp({ x: 0, y: 700 }, 150, bounds, gap)).toBe(true);
  });

  it('takes the roomier side when neither fits', () => {
    expect(pointOpensUp({ x: 0, y: 300 }, 700, bounds, gap)).toBe(false);
    expect(pointOpensUp({ x: 0, y: 500 }, 700, bounds, gap)).toBe(true);
  });
});

describe('placeAtPoint', () => {
  it('sits OVERLAY_ANCHOR_GAP below the point, start edge on the point', () => {
    expect(placeAtPoint({ point: { x: 300, y: 200 }, width: 180, height: 120, bounds, gap })).toEqual({
      left: 300,
      top: 200 + gap,
      maxHeight: 758 - (200 + gap),
      dropup: false,
      alignEnd: false,
    });
  });

  it('flips both ways in the bottom-right corner, bottom edge gap above the point', () => {
    const placement = placeAtPoint({
      point: { x: 1000, y: 740 },
      width: 180,
      height: 120,
      bounds,
      gap,
    });
    expect(placement.left).toBe(1000 - 180);
    expect(placement.top).toBe(740 - gap - 120);
    expect(placement.dropup).toBe(true);
    expect(placement.alignEnd).toBe(true);
  });

  it("caps the height at the chosen side's room, so a tall menu scrolls inside the bounds", () => {
    const placement = placeAtPoint({
      point: { x: 300, y: 500 },
      width: 180,
      height: 900,
      bounds,
      gap,
    });
    expect(placement.dropup).toBe(true);
    expect(placement.maxHeight).toBe(500 - gap - 10);
    expect(placement.top).toBe(10);
  });
});

describe('contextMenuPoint', () => {
  const reference = {
    getBoundingClientRect: () => ({ left: 40, right: 240, top: 100, bottom: 144 }),
  };

  it("takes the pointer's viewport coordinates from a mouse right-click", () => {
    expect(contextMenuPoint({ clientX: 120, clientY: 130, button: 2, pointerType: 'mouse' }, reference)).toEqual({
      x: 120,
      y: 130,
    });
  });

  it('takes the press point from a touch long-press', () => {
    expect(contextMenuPoint({ clientX: 90, clientY: 110, button: 0, pointerType: 'touch' }, reference)).toEqual({
      x: 90,
      y: 110,
    });
  });

  it("takes a right-click's coordinates when the event is a plain MouseEvent", () => {
    expect(contextMenuPoint({ clientX: 150, clientY: 120, button: 2 }, reference)).toEqual({
      x: 150,
      y: 120,
    });
  });

  it("anchors a keyboard open (Shift+F10, the Menu key) to the target's bottom start corner", () => {
    expect(contextMenuPoint({ clientX: 0, clientY: 0, button: 0, pointerType: '' }, reference)).toEqual({
      x: 40,
      y: 144,
    });
    expect(contextMenuPoint({ clientX: 0, clientY: 0, button: 0 }, reference)).toEqual({
      x: 40,
      y: 144,
    });
    expect(contextMenuPoint({ clientX: 0, clientY: 0, button: 0, pointerType: '' }, reference, true)).toEqual({
      x: 240,
      y: 144,
    });
  });

  it('has no point without a pointer or a reference', () => {
    expect(contextMenuPoint({ clientX: 0, clientY: 0, button: 0 }, null)).toBeNull();
  });
});
