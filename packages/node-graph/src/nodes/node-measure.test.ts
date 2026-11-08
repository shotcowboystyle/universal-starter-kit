/**
 * Task 1.8, the pure half. Runs in Node with no renderer.
 *
 * Three laws, each from design §11 / §7.1:
 *  - the width ladder remaps to `NodeKindSpec.measure.width` and never touches
 *    the control-height recipe;
 *  - `capContainerRadius` behaviour at all five radius stops;
 *  - `portSpacing` floors `minHeight` at ports × portSpacing.
 */

import { capContainerRadius, defaultKnobs, MIN_PRESS_TARGET, resolveKnobs, resolveRadiusForPart } from '@repo/theme';
import type { Knobs } from '@repo/theme';
import { describe, expect, it } from 'vitest';

import {
  defaultNodeMeasure,
  FINE_PORT_PITCH,
  graphNodeMeasure,
  graphNodeMinHeight,
  graphNodeRadius,
  graphNodeRadiusPx,
  graphNodeWidth,
  nodePanelPaddingPx,
  portSpacing,
  verticalPortCrowd,
} from './node-measure';
import type { GraphNodePort } from './node-measure';

const sizes = ['small', 'medium', 'large'] as const satisfies readonly Knobs['size'][];
const spaces = ['small', 'medium', 'large'] as const satisfies readonly Knobs['space'][];
const radiusStops = ['none', 'small', 'medium', 'large', 'full'] as const satisfies readonly Knobs['borderRadius'][];

const port = (id: string, side: GraphNodePort['side']): GraphNodePort => ({
  id,
  side,
  direction: side === 'left' ? 'in' : 'out',
});

describe('width: remapped to the per-kind table, never the control ladder', () => {
  it('returns the declared measure width unchanged at every size stop', () => {
    for (const size of sizes) {
      expect(graphNodeWidth({ size, measure: { width: 240 } })).toBe(240);
    }
  });

  it('falls back to the 172 / 190 / 216 table when a kind declares no width', () => {
    expect(graphNodeWidth({ size: 'small' })).toBe(172);
    expect(graphNodeWidth({ size: 'medium' })).toBe(190);
    expect(graphNodeWidth({ size: 'large' })).toBe(216);
  });

  it('never lands on a control height — the ladder a container must not ride', () => {
    const controlHeights = new Set(
      sizes.map((size) => resolveKnobs({ ...defaultKnobs, size }).knobProps.control.height),
    );
    expect(controlHeights.size).toBeGreaterThan(0);
    for (const size of sizes) {
      expect(controlHeights.has(graphNodeWidth({ size }))).toBe(false);
    }
  });

  it('steps monotonically, so the size knob still means something', () => {
    expect(graphNodeWidth({ size: 'small' })).toBeLessThan(graphNodeWidth({ size: 'medium' }));
    expect(graphNodeWidth({ size: 'medium' })).toBeLessThan(graphNodeWidth({ size: 'large' }));
  });
});

describe('radius: CONTAINER-CAP at all five stops', () => {
  it("mirrors the resolver's panel padding — the drift guard on this module's copy", () => {
    // `capContainerRadius` at `full` returns the container's own padding px,
    // so this equality pins our mirror to `panelPaddingPxMap` in resolveKnobs.
    for (const space of spaces) {
      expect(capContainerRadius('full', space)).toBe(nodePanelPaddingPx[space]);
    }
  });

  it('paints exactly what capContainerRadius resolves, at every stop and space', () => {
    for (const borderRadius of radiusStops) {
      for (const space of spaces) {
        expect(graphNodeRadius({ borderRadius, space })).toBe(capContainerRadius(borderRadius, space));
      }
    }
  });

  it('agrees with the DG-RAD doctrine table at every stop and space', () => {
    for (const borderRadius of radiusStops) {
      for (const space of spaces) {
        expect(graphNodeRadiusPx({ borderRadius, space })).toBe(
          resolveRadiusForPart({
            radiusClass: 'CONTAINER-CAP',
            stop: borderRadius,
            paddingPx: nodePanelPaddingPx[space],
          }).px,
        );
      }
    }
  });

  it("never exceeds the node's own padding — the cap is what stops a child clip", () => {
    for (const borderRadius of radiusStops) {
      for (const space of spaces) {
        expect(graphNodeRadiusPx({ borderRadius, space })).toBeLessThanOrEqual(nodePanelPaddingPx[space]);
      }
    }
  });

  it('caps rather than passes through where the token would overflow the padding', () => {
    // `full` (50px) exceeds every padding stop, so every space caps.
    for (const space of spaces) {
      expect(graphNodeRadius({ borderRadius: 'full', space })).toBe(nodePanelPaddingPx[space]);
    }
    // `large` (16px) fits inside `large` padding (32px) and keeps its token.
    expect(graphNodeRadius({ borderRadius: 'large', space: 'large' })).toBeTypeOf('string');
    // ...and does not fit inside `small` padding (13px), so it caps.
    expect(graphNodeRadius({ borderRadius: 'large', space: 'small' })).toBe(13);
  });

  it('is 0 at `none` in every space', () => {
    for (const space of spaces) {
      expect(graphNodeRadiusPx({ borderRadius: 'none', space })).toBe(0);
    }
  });
});

describe('portSpacing floors minHeight at ports × portSpacing', () => {
  it('is the press floor on coarse pointers and the fine hit diameter otherwise', () => {
    expect(portSpacing({ coarsePointer: true })).toBe(MIN_PRESS_TARGET);
    expect(portSpacing({ coarsePointer: false })).toBe(FINE_PORT_PITCH);
    expect(FINE_PORT_PITCH).toBeLessThan(MIN_PRESS_TARGET);
  });

  it('floors a single-edge node at ports × portSpacing', () => {
    const ports = [
      port('a', 'left'),
      port('b', 'left'),
      port('c', 'left'),
      port('d', 'left'),
    ] satisfies GraphNodePort[];
    const portSpacingPx = portSpacing({ coarsePointer: true });
    expect(graphNodeMinHeight({ size: 'medium', ports, portSpacingPx })).toBe(ports.length * portSpacingPx);
  });

  it('counts the busiest EDGE, not the node — opposite sides never collide', () => {
    const split = [
      port('in1', 'left'),
      port('in2', 'left'),
      port('out1', 'right'),
      port('out2', 'right'),
    ] satisfies GraphNodePort[];
    expect(verticalPortCrowd(split)).toBe(2);
    const portSpacingPx = portSpacing({ coarsePointer: true });
    expect(graphNodeMinHeight({ size: 'medium', ports: split, portSpacingPx })).toBe(2 * portSpacingPx);
  });

  it('ignores top and bottom ports, which stack across the width', () => {
    const horizontal = [port('t1', 'top'), port('t2', 'top'), port('b1', 'bottom')] satisfies GraphNodePort[];
    expect(verticalPortCrowd(horizontal)).toBe(0);
    expect(graphNodeMinHeight({ size: 'medium', ports: horizontal, portSpacingPx: MIN_PRESS_TARGET })).toBe(
      defaultNodeMeasure.medium.minHeight,
    );
  });

  it('keeps the declared minHeight when the ports fit inside it', () => {
    const ports = [port('only', 'left')] satisfies GraphNodePort[];
    expect(
      graphNodeMinHeight({
        size: 'medium',
        ports,
        portSpacingPx: MIN_PRESS_TARGET,
        measure: { minHeight: 120 },
      }),
    ).toBe(120);
  });

  it('raises a declared minHeight that is too short for its own ports', () => {
    const ports = [port('a', 'left'), port('b', 'left'), port('c', 'left')];
    expect(
      graphNodeMinHeight({
        size: 'medium',
        ports,
        portSpacingPx: MIN_PRESS_TARGET,
        measure: { minHeight: 40 },
      }),
    ).toBe(3 * MIN_PRESS_TARGET);
  });

  it('is taller on a coarse pointer than on a fine one for the same ports', () => {
    const ports = [port('a', 'left'), port('b', 'left'), port('c', 'left')];
    const coarse = graphNodeMinHeight({
      size: 'medium',
      ports,
      portSpacingPx: portSpacing({ coarsePointer: true }),
    });
    const fine = graphNodeMinHeight({
      size: 'medium',
      ports,
      portSpacingPx: portSpacing({ coarsePointer: false }),
    });
    expect(coarse).toBeGreaterThan(fine);
  });
});

describe('graphNodeMeasure seeds both axes before first paint', () => {
  it('carries the width from the table and the height from the port floor', () => {
    const ports = [port('a', 'left'), port('b', 'left')];
    expect(graphNodeMeasure({ size: 'large', ports, portSpacingPx: MIN_PRESS_TARGET })).toStrictEqual({
      width: 216,
      minHeight: 2 * MIN_PRESS_TARGET,
    });
  });

  it('lets a declared kind measure win on both axes when it is large enough', () => {
    expect(
      graphNodeMeasure({
        size: 'small',
        ports: [],
        portSpacingPx: MIN_PRESS_TARGET,
        measure: { width: 300, minHeight: 200 },
      }),
    ).toStrictEqual({ width: 300, minHeight: 200 });
  });
});
