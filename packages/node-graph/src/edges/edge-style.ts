/**
 * How an edge paints, design §4.4 and §11.
 *
 * Pure: knob names in, a style out. No React, no `@xyflow`, no DOM — so the
 * table can be asserted without mounting anything, which is what makes
 * `edge-style.test.ts` a cheap test rather than a render.
 *
 * Stroke width is NOT per kind (design §4.4's last line): it comes from the
 * `borderWidth` knob, so one flip moves every edge on the canvas. Task 1.7's
 * `theme/graph-vars.ts` reads `edgeStrokeWidth` from here rather than repeating
 * the ladder — §11's borderWidth row cites that file, and one ladder in two
 * places is one ladder that can drift.
 */

import type { Animation, BorderWidth } from '@repo/theme';

import type { BuiltinEdgeKind } from './edge-kinds';

export type EdgePathKind = 'bezier' | 'smoothstep' | 'step' | 'straight';
export type EdgeMarker = 'arrow' | 'arrowclosed';

export interface EdgeAppearance {
  readonly path: EdgePathKind;
  /** A token expression. A hex literal here fails `edge-style.test.ts`. */
  readonly stroke: string;
  /** SVG `stroke-dasharray`. Absent means a solid line. */
  readonly dash?: string;
  readonly marker: EdgeMarker;
}

/** Design §4.4's table, verbatim. */
export const edgeAppearances: Readonly<Record<BuiltinEdgeKind, EdgeAppearance>> = {
  flow: { path: 'smoothstep', stroke: '$color9', marker: 'arrowclosed' },
  data: { path: 'bezier', stroke: '$color8', marker: 'arrow' },
  error: { path: 'smoothstep', stroke: '$red9', dash: '6 4', marker: 'arrowclosed' },
  conditional: { path: 'step', stroke: '$color8', dash: '2 4', marker: 'arrow' },
};

/**
 * §11: an edge is a stroke, not a border, and a 0-width edge erases the graph's
 * primary information. The theme's own `borderWidthMap` is 0 / 0.5 / 1 / 2
 * (`public/theme/src/theme/resolveKnobs.ts:90`), so this is a remap, and
 * deliberately not a floor to `hairlineWidth` — that token is dividers-only by
 * its own header, and a stroke that stays legible while the canvas zooms out is
 * not a divider.
 */
export const edgeStrokeWidths: Readonly<Record<BorderWidth, number>> = {
  none: 1,
  small: 1.5,
  medium: 2,
  large: 3,
};

export const edgeStrokeWidth = (borderWidth: BorderWidth): number => edgeStrokeWidths[borderWidth];

/** The keyframes live in `css/graph.css`, which lands with task 1.7. */
export const dashAnimation = 'mp-graph-dash 0.5s linear infinite';

const isBuiltin = (name: string): name is BuiltinEdgeKind => name in edgeAppearances;

/**
 * The marker goes on the EDGE OBJECT, not on the rendered path.
 *
 * React Flow builds its `<marker>` defs from the edges array and hands the
 * component an already-resolved `url(#...)` string, so `BaseEdge`'s `markerEnd`
 * is a string and cannot take a type. Measured against
 * `@xyflow/react` 12.11.5's `BaseEdgeProps`. So whoever BUILDS the edges — the
 * controller in task 1.11, or a story — reads the marker from here.
 */
export interface EdgeMarkerEnd {
  readonly type: EdgeMarker;
}

export const edgeMarkerEnd = (input: { readonly kind: string; readonly appearance?: string }): EdgeMarkerEnd => {
  const named = input.appearance ?? input.kind;
  return { type: edgeAppearances[isBuiltin(named) ? named : 'flow'].marker };
};

export interface EdgeStyleInput {
  /** `edge.kind` from the model, not React Flow's `edge.type`. */
  readonly kind: string;
  /** `EdgeKindSpec.appearance`, when the kind is not one of the four. */
  readonly appearance?: string;
  readonly borderWidth: BorderWidth;
  readonly animation: Animation;
}

/**
 * `"$color9"` -> `"color9"`. The theme key, so a renderer can look the token up
 * without the appearance table ever holding a resolved colour — which is what
 * keeps `edge-style.test.ts`'s hex ban meaningful.
 */
export const themeTokenName = (stroke: string): string => (stroke.startsWith('$') ? stroke.slice(1) : stroke);

export interface EdgeStyle {
  readonly path: EdgePathKind;
  readonly stroke: string;
  readonly strokeWidth: number;
  readonly strokeDasharray?: string;
  readonly marker: EdgeMarker;
  /** A CSS `animation` shorthand. `"none"` when the knob says so. */
  readonly animation: string;
}

export const resolveEdgeStyle = (input: EdgeStyleInput): EdgeStyle => {
  const named = input.appearance ?? input.kind;
  // An edge that does not paint is worse than one that paints plainly, so an
  // unknown kind reads as `flow` rather than disappearing.
  const appearance = edgeAppearances[isBuiltin(named) ? named : 'flow'];
  return {
    path: appearance.path,
    stroke: appearance.stroke,
    strokeWidth: edgeStrokeWidth(input.borderWidth),
    strokeDasharray: appearance.dash,
    marker: appearance.marker,
    // Stopping the march is not the same as erasing the dashes: the PATTERN is
    // how a reader tells an error edge from a flow edge, so it survives
    // `animation: "none"` and a reduced-motion user keeps the channel.
    animation: appearance.dash !== undefined && input.animation !== 'none' ? dashAnimation : 'none',
  };
};
