/**
 * The GraphNode measure recipe — pure. No React, no DOM, no `@xyflow`.
 *
 * A node is a CONTAINER, not a control (design §11 Size). Everything here
 * exists to keep it off the control-height ladder: the width rides a per-kind
 * table, the radius caps at the node's own padding, and the minimum height is
 * floored by how many ports have to fit down one edge.
 *
 * Pure on purpose. `graphNode.spec.ts` runs it in Node with no renderer, so
 * the laws are falsifiable before a pixel exists.
 */

import { capContainerRadius, MIN_PRESS_TARGET, resolveRadiusForPart } from '@repo/theme';
import type { Knobs } from '@repo/theme';

export type GraphNodeSizeKnob = Knobs['size'];
export type GraphNodeSpaceKnob = Knobs['space'];
export type GraphNodeRadiusKnob = Knobs['borderRadius'];

export type GraphPortSide = 'left' | 'right' | 'top' | 'bottom';

/**
 * The structural subset of `PortSpec` this module needs to measure a node.
 *
 * Task 1.3 follow-up: replace with `PortSpec` from `../model` once the schema
 * lands. It is declared structurally compatible on purpose — `PortSpec` adds
 * `index`, `dataType` and `arity`, none of which change a measurement — so the
 * swap is an import change, not a rewrite.
 */
export interface GraphNodePort {
  readonly id: string;
  readonly side: GraphPortSide;
  readonly direction: 'in' | 'out';
  readonly label?: string;
}

/** `NodeKindSpec.measure` (design §4.3): width fixed per kind, height knob-driven. */
export interface GraphNodeMeasure {
  readonly width: number;
  readonly minHeight: number;
}

/**
 * The default per-kind measure table (design §11 Size: "default 172 / 190 / 216").
 *
 * A kind that declares its own `measure` overrides this entirely; the table is
 * what an undeclared kind falls back to. `minHeight` anchors on design §5's
 * measured node heights (62 px compact, 72 px default) with `large` one step
 * above, rather than a number invented here.
 */
export const defaultNodeMeasure: Record<GraphNodeSizeKnob, GraphNodeMeasure> = {
  small: { width: 172, minHeight: 62 },
  medium: { width: 190, minHeight: 72 },
  large: { width: 216, minHeight: 84 },
};

/**
 * Container padding in px per `space` stop.
 *
 * Mirrors `panelPaddingPxMap` in `resolveKnobs.ts`, which is private to that
 * module — the resolver mirrors the same numbers for the same reason (it stays
 * pure, so it cannot read live tokens). `graphNode.spec.ts` pins this mirror
 * against `capContainerRadius(..., "full")`, which returns the padding px
 * itself, so a change in the resolver fails the spec here instead of drifting.
 */
export const nodePanelPaddingPx: Record<GraphNodeSpaceKnob, number> = {
  small: 13,
  medium: 18,
  large: 32,
};

/**
 * Vertical pitch between two ports on the same node edge.
 *
 * Coarse pointers get the press floor itself (design §7.1 H4: two ports closer
 * than the hit diameter would have overlapping discs and the wrong one would
 * win). Fine pointers get 24, which is H3's fine-pointer hit diameter and is
 * already above every painted stop (8 / 10 / 12), so the pitch never has to
 * consult the painted ladder — that is what keeps this module independent of
 * `handle-geometry.ts` rather than circular with it.
 */
export const FINE_PORT_PITCH = 24;

export const portSpacing = (opts: { readonly coarsePointer: boolean }): number =>
  opts.coarsePointer ? MIN_PRESS_TARGET : FINE_PORT_PITCH;

/**
 * §11 Size, GraphNode frame: `remap` to `NodeKindSpec.measure.width`.
 *
 * The size knob reaches the width only through the per-kind table. It never
 * reaches the control-height recipe (`knobProps.control.height`), because a
 * node is a container and a container that steps with a control ladder is a
 * control wearing a frame.
 */
export const graphNodeWidth = (opts: {
  readonly size: GraphNodeSizeKnob;
  readonly measure?: Partial<GraphNodeMeasure>;
}): number => opts.measure?.width ?? defaultNodeMeasure[opts.size].width;

/**
 * How many ports stack down the tallest vertical edge.
 *
 * Height crowding is per EDGE, not per node: `left` and `right` ports stack
 * vertically and can collide with their own side's neighbors, never with the
 * opposite side's. `top` / `bottom` ports stack horizontally and constrain
 * width, so they do not enter a height floor at all.
 */
export const verticalPortCrowd = (ports: readonly GraphNodePort[]): number => {
  let left = 0;
  let right = 0;
  for (const port of ports) {
    if (port.side === 'left') {
      left += 1;
    } else if (port.side === 'right') {
      right += 1;
    }
  }
  return Math.max(left, right);
};

/**
 * §7.1 H4, the floor half: a node is tall enough for every port on its
 * busiest edge to be a real target, instead of ports silently stealing hits
 * from each other.
 */
export const graphNodeMinHeight = (opts: {
  readonly size: GraphNodeSizeKnob;
  readonly ports: readonly GraphNodePort[];
  readonly portSpacingPx: number;
  readonly measure?: Partial<GraphNodeMeasure>;
}): number => {
  const declared = opts.measure?.minHeight ?? defaultNodeMeasure[opts.size].minHeight;
  return Math.max(declared, verticalPortCrowd(opts.ports) * opts.portSpacingPx);
};

/**
 * §11 Radius, GraphNode frame: CONTAINER-CAP. The Tamagui value to paint —
 * the radius token while it fits inside the node's own padding, the padding px
 * once it would not.
 */
export const graphNodeRadius = (knobs: {
  readonly borderRadius: GraphNodeRadiusKnob;
  readonly space: GraphNodeSpaceKnob;
}): string | number => capContainerRadius(knobs.borderRadius, knobs.space);

/**
 * Radius TOKEN → px.
 *
 * Mirrors `borderRadiusMap` / `radiusPxMap` in `resolveKnobs.ts`, both private
 * to that module. Needed because `capContainerRadius` returns either a token
 * (`"$4"`) or a px number, and a rendered node has to report ONE number.
 * `graphNode.spec.ts` pins the whole map against the doctrine table at every
 * stop and space, so a token that stops meaning what it says fails there.
 */
// oxlint-disable-next-line anti-slop/no-known-value-widening -- public lookup indexed by whatever token string the resolver returns; the miss is handled below
export const nodeRadiusTokenPx: Readonly<Record<string, number>> = {
  $0: 0,
  $2: 5,
  $4: 9,
  $6: 16,
  $12: 50,
};

/**
 * px for whatever `capContainerRadius` resolved to. A number is already the
 * capped px; a token goes through the mirror above.
 */
export const containerRadiusPx = (value: string | number): number => {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- `capContainerRadius` returns token | px by contract; this branches on that typed union
  if (typeof value === 'number') {
    return value;
  }
  const px = nodeRadiusTokenPx[value];
  if (px === undefined) {
    throw new Error(
      `containerRadiusPx: "${value}" is not a radius token this module mirrors — add it to nodeRadiusTokenPx beside the resolver's borderRadiusMap`,
    );
  }
  return px;
};

/**
 * The same radius in px, resolved through the DG-RAD doctrine table rather
 * than the resolver.
 *
 * Two independent implementations of one law: `graphNodeRadius` goes through
 * `capContainerRadius` (resolver), this goes through `resolveRadiusForPart`
 * (doctrine). `graphNode.spec.ts` asserts they agree at every stop, so a
 * doctrine/resolver drift is a failing test rather than a corner that quietly
 * clips a child.
 */
export const graphNodeRadiusPx = (knobs: {
  readonly borderRadius: GraphNodeRadiusKnob;
  readonly space: GraphNodeSpaceKnob;
}): number =>
  resolveRadiusForPart({
    radiusClass: 'CONTAINER-CAP',
    stop: knobs.borderRadius,
    paddingPx: nodePanelPaddingPx[knobs.space],
  }).px;

/** The complete measure a node is seeded with BEFORE first paint (design §5). */
export const graphNodeMeasure = (opts: {
  readonly size: GraphNodeSizeKnob;
  readonly ports: readonly GraphNodePort[];
  readonly portSpacingPx: number;
  readonly measure?: Partial<GraphNodeMeasure>;
}): GraphNodeMeasure => ({
  width: graphNodeWidth(opts),
  minHeight: graphNodeMinHeight(opts),
});
