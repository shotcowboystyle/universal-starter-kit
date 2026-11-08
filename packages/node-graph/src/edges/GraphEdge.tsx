/**
 * ONE registered React Flow edge type, switching on `edge.kind` internally.
 *
 * Design §4.4: the package registers exactly one `edgeType`. That keeps the
 * edge component count at one and the `d`-string building in one place, which
 * is where the merged single-path overview layer plugs in later — 1,968 `<svg>`
 * down to 1 in the engine-split spike. Registering four types would make that a
 * four-site change.
 *
 * `edge.kind` is the MODEL's kind and rides in `edge.data.kind`; React Flow's
 * own `edge.type` is always `graphEdgeType`.
 */

import { usePresetContext, useResolvedKnobs, defaultKnobs } from '@repo/theme';
import type { Animation, BorderWidth } from '@repo/theme';
import { memo } from 'react';
import { SizableText, useTheme, View } from 'tamagui';

import { BaseEdge, EdgeLabelRenderer, getBezierPath, getSmoothStepPath, getStraightPath } from '../react-flow/xy';
import type { EdgeProps } from '../react-flow/xy';

import { resolveEdgeStyle, themeTokenName } from './edge-style';
import type { EdgePathKind, EdgeStyle } from './edge-style';

export const graphEdgeType = 'mpGraphEdge';

export interface GraphEdgeData {
  /** The model's `edge.kind`. */
  readonly kind?: string;
  /** `EdgeKindSpec.appearance`, when the kind is not one of the four. */
  readonly appearance?: string;
  readonly label?: string;
}

interface PathGeometry {
  readonly sourceX: number;
  readonly sourceY: number;
  readonly targetX: number;
  readonly targetY: number;
  readonly sourcePosition: EdgeProps['sourcePosition'];
  readonly targetPosition: EdgeProps['targetPosition'];
}

/**
 * `step` is `getSmoothStepPath` with a zero corner radius — React Flow has no
 * separate step builder, and the design's table names four path SHAPES, not
 * four functions.
 */
export const buildEdgePath = (
  path: EdgePathKind,
  geometry: PathGeometry,
): [d: string, labelX: number, labelY: number] => {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition } = geometry;
  switch (path) {
    case 'bezier': {
      const [d, labelX, labelY] = getBezierPath({
        sourceX,
        sourceY,
        targetX,
        targetY,
        sourcePosition,
        targetPosition,
      });
      return [d, labelX, labelY];
    }
    case 'straight': {
      const [d, labelX, labelY] = getStraightPath({ sourceX, sourceY, targetX, targetY });
      return [d, labelX, labelY];
    }
    case 'step':
    case 'smoothstep': {
      const [d, labelX, labelY] = getSmoothStepPath({
        sourceX,
        sourceY,
        targetX,
        targetY,
        sourcePosition,
        targetPosition,
        borderRadius: path === 'step' ? 0 : undefined,
      });
      return [d, labelX, labelY];
    }
    default: {
      const unknownPath: never = path;
      throw new Error(`buildEdgePath: unknown path kind ${String(unknownPath)}`);
    }
  }
};

/**
 * The raw knob values an edge paints from.
 *
 * `useResolvedKnobs` returns `knobProps`, not the knob NAMES, and the edge
 * needs the names because §11 remaps `borderWidth` rather than honouring the
 * resolved value. So this reads the same Preset context `useResolvedKnobs`
 * reads at its own step 1 — which means task 1.6's `KnobEnvelopeProvider`,
 * which rebuilds that context inside the WebView, feeds this hook with no
 * change here.
 */
export interface EdgeKnobs {
  readonly borderWidth: BorderWidth;
  readonly animation: Animation;
}

export const useEdgeKnobs = (): EdgeKnobs => {
  const preset = usePresetContext();
  const knobs = preset ? { ...preset.preset.knobs, ...preset.overrides } : defaultKnobs;
  return { borderWidth: knobs.borderWidth, animation: knobs.animation };
};

/**
 * A token is not a CSS value. `stroke: "$color9"` is an invalid declaration, so
 * the browser drops it and falls through to React Flow's own
 * `.react-flow__edge-path` rule — which resolves to nothing, because its
 * `--xy-edge-stroke` is undefined until task 1.7's bridge writes it. The result
 * is a canvas of invisible edges with visible arrowheads, which is what the
 * story showed before this existed.
 *
 * So the token is resolved through the live Tamagui theme here. Task 1.7's
 * `--mp-graph-edge-stroke` still wins when it lands, because it is the first
 * arm of the `var()` fallback below.
 */
const useStrokeValue = (stroke: string): string => {
  const theme = useTheme();
  // SAFETY: Tamagui's theme proxy maps every token name to an optional `{ get }`
  // gettable; a missing name yields undefined, which `entry?.get?.()` handles.
  // oxlint-disable-next-line anti-slop/no-chained-type-assertions, typescript/no-unsafe-type-assertion, anti-slop/no-unknown-returns -- the theme's static type has no string index; the value is narrowed by the typeof check below
  const entry = (theme as unknown as Record<string, { get?: () => unknown } | undefined>)[themeTokenName(stroke)];
  const value = entry?.get?.();
  // `currentColor` rather than a hex fallback: a hex literal in this package is
  // exactly what `edge-style.test.ts` bans, and an edge that inherits the canvas
  // ink is still visible.
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- a theme value may be a string or a number; only a string is a paintable colour
  return typeof value === 'string' ? value : 'currentColor';
};

/**
 * §11 radius: a chip inside the canvas frame steps down, so it remaps to
 * `borderRadiusNested`. Whole `knobProps.*` fragments only, per AGENTS.md — a
 * cherry-picked token is how a chip ends up half-themed.
 *
 * Padding is `panelPadding`, the only complete padding fragment the recipes
 * expose (`public/theme/src/theme/recipes.ts`). §11 rules the chip's RADIUS and
 * says nothing about its padding, so this is the nearest whole fragment rather
 * than an invented one.
 */
const EdgeLabel = ({ label, x, y }: { label: string; x: number; y: number }) => {
  const { knobProps } = useResolvedKnobs({ component: 'GraphEdge' });
  return (
    <EdgeLabelRenderer>
      <View
        className="mp-graph-edge-label"
        position="absolute"
        transform={`translate(-50%, -50%) translate(${x}px, ${y}px)`}
        pointerEvents="none"
        {...knobProps.surface}
        {...knobProps.borderRadiusNested}
        {...knobProps.panelPadding}>
        <SizableText {...knobProps.body}>{label}</SizableText>
      </View>
    </EdgeLabelRenderer>
  );
};

export const GraphEdgeComponent = (props: EdgeProps) => {
  // SAFETY: every edge registered under `graphEdgeType` is built with
  // GraphEdgeData (or no data at all), and every field of it is optional.
  const data = (props.data ?? {}) as GraphEdgeData;
  const { borderWidth, animation } = useEdgeKnobs();
  const style: EdgeStyle = resolveEdgeStyle({
    kind: data.kind ?? 'flow',
    appearance: data.appearance,
    borderWidth,
    animation,
  });
  const strokeValue = useStrokeValue(style.stroke);
  const [d, labelX, labelY] = buildEdgePath(style.path, props);
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- React Flow's `label` is a ReactNode; only a string fits the text chip
  const label = data.label ?? (typeof props.label === 'string' ? props.label : undefined);

  return (
    <>
      <BaseEdge
        id={props.id}
        path={d}
        // Already a resolved `url(#...)`: React Flow builds the marker defs
        // from the edges array, so the TYPE is chosen by `edgeMarkerEnd` where
        // the edge is built, not here.
        markerEnd={props.markerEnd}
        style={{
          stroke: `var(--mp-graph-edge-stroke, ${strokeValue})`,
          strokeWidth: style.strokeWidth,
          strokeDasharray: style.strokeDasharray,
          animation: style.animation,
          ...props.style,
        }}
      />
      {label !== undefined && label !== '' ? (
        <EdgeLabel
          label={label}
          x={labelX}
          y={labelY}
        />
      ) : null}
    </>
  );
};

export const GraphEdge = memo(GraphEdgeComponent);

/** The whole registration. One entry, on purpose. */
export const graphEdgeTypes = { [graphEdgeType]: GraphEdge } as const;
