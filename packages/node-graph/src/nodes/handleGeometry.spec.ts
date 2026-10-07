/**
 * Task 1.9, the pure half: H1, H3 and H4 from design §7.1.
 *
 * The point of separating these from `GraphPort.spec.tsx` is that the painted
 * dot and the hit region are two numbers with two different laws, and a sweep
 * that measures one against the other's row produces the false FAIL
 * `knob-laws.md` names as the commonest.
 */

import { MIN_PRESS_TARGET } from '@repo/theme';
import { describe, expect, it } from 'vitest';

import {
  FINE_PORT_HIT_MIN,
  paintedPortSize,
  paintedPortSizePx,
  portConnectionRadius,
  portHitSize,
  portRegionInset,
} from './handleGeometry';
import { FINE_PORT_PITCH, portSpacing } from './nodeMeasure';
import type { GraphNodeSizeKnob } from './nodeMeasure';

const sizes = ['small', 'medium', 'large'] as const satisfies readonly GraphNodeSizeKnob[];

describe('H1: the painted dot follows the size knob and is never 44', () => {
  it('is 8 / 10 / 12', () => {
    expect(paintedPortSize('small')).toBe(8);
    expect(paintedPortSize('medium')).toBe(10);
    expect(paintedPortSize('large')).toBe(12);
  });

  it('is never the press floor at any stop — a 44 px dot is a different component', () => {
    for (const size of sizes) {
      expect(paintedPortSize(size)).not.toBe(MIN_PRESS_TARGET);
      expect(paintedPortSize(size)).toBeLessThan(MIN_PRESS_TARGET);
    }
  });

  it('steps with the knob rather than sitting still', () => {
    expect(new Set(Object.values(paintedPortSizePx)).size).toBe(sizes.length);
  });
});

describe('H3: 44 on coarse pointers, max(painted, 24) on fine', () => {
  it('is exactly the press floor on a coarse pointer at every size', () => {
    for (const size of sizes) {
      expect(portHitSize({ size, coarsePointer: true })).toBe(MIN_PRESS_TARGET);
    }
  });

  it('is max(painted, 24) on a fine pointer at every size', () => {
    for (const size of sizes) {
      expect(portHitSize({ size, coarsePointer: false })).toBe(Math.max(paintedPortSize(size), FINE_PORT_HIT_MIN));
    }
  });

  it('is smaller on fine than on coarse — that split is the whole law', () => {
    for (const size of sizes) {
      expect(portHitSize({ size, coarsePointer: false })).toBeLessThan(portHitSize({ size, coarsePointer: true }));
    }
  });

  it('always exceeds the painted dot, so the region grows outward', () => {
    for (const size of sizes) {
      for (const coarsePointer of [true, false]) {
        expect(portHitSize({ size, coarsePointer })).toBeGreaterThan(paintedPortSize(size));
      }
    }
  });
});

describe('H4: the crowding cap is min(44, portSpacing)', () => {
  it('caps a coarse hit at the port pitch when the pitch is the tighter number', () => {
    for (const portSpacingPx of [30, 36, 44, 60]) {
      expect(portHitSize({ size: 'medium', coarsePointer: true, portSpacingPx })).toBe(
        Math.min(MIN_PRESS_TARGET, portSpacingPx),
      );
    }
  });

  it('does not cap when the ports are far enough apart', () => {
    expect(portHitSize({ size: 'medium', coarsePointer: true, portSpacingPx: 80 })).toBe(MIN_PRESS_TARGET);
  });

  it('never lets a crowded hit shrink below the dot the user can see', () => {
    // A pitch of 4 is narrower than every painted stop. The cap must floor at
    // the painted size, or the ::after would inset INWARD and the target would
    // be smaller than the affordance.
    for (const size of sizes) {
      expect(portHitSize({ size, coarsePointer: true, portSpacingPx: 4 })).toBe(paintedPortSize(size));
    }
  });

  it('leaves the default pitch uncapped, so the cap is a guard and not the norm', () => {
    for (const coarsePointer of [true, false]) {
      const withDefault = portHitSize({ size: 'medium', coarsePointer });
      const explicit = portHitSize({
        size: 'medium',
        coarsePointer,
        portSpacingPx: portSpacing({ coarsePointer }),
      });
      expect(withDefault).toBe(explicit);
    }
    expect(portSpacing({ coarsePointer: true })).toBe(MIN_PRESS_TARGET);
    expect(portSpacing({ coarsePointer: false })).toBe(FINE_PORT_PITCH);
  });
});

describe('H2: the region is an outward inset, so the handle box never moves', () => {
  it('is negative wherever the hit exceeds the dot', () => {
    for (const size of sizes) {
      for (const coarsePointer of [true, false]) {
        expect(portRegionInset({ size, coarsePointer })).toBeLessThan(0);
      }
    }
  });

  it('is exactly half the difference, so the region stays concentric', () => {
    for (const size of sizes) {
      const inset = portRegionInset({ size, coarsePointer: true });
      expect(paintedPortSize(size) - 2 * inset).toBe(portHitSize({ size, coarsePointer: true }));
    }
  });

  it('adds the ring back, because the pseudo-element insets from the PADDING box', () => {
    // The dot is border-box with a knob-driven ring, so its padding box is
    // `size - 2 × border`. Without this term Chrome renders a 44 as a 42 —
    // measured, and the reason the parameter exists at all.
    for (const size of sizes) {
      for (const borderWidthPx of [1, 2, 3]) {
        const inset = portRegionInset({ size, coarsePointer: true, borderWidthPx });
        const paddingBox = paintedPortSize(size) - 2 * borderWidthPx;
        expect(paddingBox - 2 * inset).toBe(portHitSize({ size, coarsePointer: true }));
      }
    }
  });

  it('collapses to zero when crowding pins the hit to the dot and there is no ring', () => {
    expect(portRegionInset({ size: 'medium', coarsePointer: true, portSpacingPx: 4 })).toBe(0);
  });
});

describe('H5: the magnetic drop radius matches the visible affordance', () => {
  it("is the hit diameter, not React Flow's 20 px default", () => {
    for (const size of sizes) {
      for (const coarsePointer of [true, false]) {
        expect(portConnectionRadius({ size, coarsePointer })).toBe(portHitSize({ size, coarsePointer }));
        expect(portConnectionRadius({ size, coarsePointer })).not.toBe(20);
      }
    }
  });
});
