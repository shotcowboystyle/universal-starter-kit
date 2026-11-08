/**
 * The Tamagui node body.
 *
 * Knobs reach it through the REAL `useResolvedKnobs` — the resolver with its
 * Preset / Surface / Intent context stack, not the pure functions — which is
 * what MPO-191 AC-3 asks for. Every style comes from a whole `knobProps.*`
 * fragment spread (AGENTS.md); nothing here cherry-picks a resolved token.
 *
 * Two things this component must NOT do, both from design §7.1:
 *  - clip. The frame is never `overflow: hidden`, because handles sit at the
 *    node edge under `translate(±50%)` and a clipping frame eats half the dot
 *    and most of the 44pt hit region.
 *  - re-measure the world on a knob flip. `useUpdateNodeInternals` fires for
 *    ONE node when its own `ports` identity changes — a port added or removed
 *    changes `handleBounds` with no size change for React Flow's per-node
 *    ResizeObserver to see. A knob flip DOES change height, the observer does
 *    catch that (measured, design §5), and firing 200 updates on top of it
 *    would stack a second forced-layout storm on the observer's.
 */

import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { SizableText, XStack, YStack } from 'tamagui';

import { useGraphNodeKnobs } from '../knobs/graph-knobs';
import { useUpdateNodeInternals } from '../react-flow/xy';

import { paintedPortSize } from './handle-geometry';
import { detailOpacity, isOverview } from './lod';
import type { GraphRenderMode } from './lod';
import { containerRadiusPx, graphNodeMinHeight, graphNodeWidth, portSpacing } from './node-measure';
import type { GraphNodeMeasure, GraphNodePort, GraphNodeSizeKnob } from './node-measure';

export interface GraphNodeProps {
  /** Node id. React Flow addresses `updateNodeInternals` by it. */
  readonly id: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly ports?: readonly GraphNodePort[];
  /** Semantic intent — reaches the resolver, never a colour prop. */
  readonly intent?: string;
  readonly selected?: boolean;
  readonly dragging?: boolean;
  /** `NodeKindSpec.measure`; falls back to the per-kind default table. */
  readonly measure?: Partial<GraphNodeMeasure>;
  /**
   * "overview" below `overviewZoom` (design §5). Children FADE, they never
   * unmount, so the box keeps the same height in both modes and React Flow's
   * ResizeObserver has nothing to chase.
   */
  readonly renderMode?: GraphRenderMode;
  /** true on a touch surface — widens the port pitch to the press floor. */
  readonly coarsePointer?: boolean;
  /** Rendered inside each port row. Task 1.9 puts the painted disc here. */
  readonly renderPort?: (port: GraphNodePort) => ReactNode;
  readonly children?: ReactNode;
}

/**
 * Fire `updateNodeInternals` for this node when, and only when, its `ports`
 * array identity changes. Never on mount: React Flow measures a fresh node
 * itself, so a mount-time call is a redundant forced layout.
 */
const usePortInternals = (id: string, ports: readonly GraphNodePort[] | undefined) => {
  const updateNodeInternals = useUpdateNodeInternals();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    updateNodeInternals(id);
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- `ports` is the trigger: its identity changing is the whole reason to fire
  }, [id, ports, updateNodeInternals]);
};

export const GraphNode = ({
  id,
  title,
  subtitle,
  ports,
  intent,
  selected = false,
  dragging = false,
  measure,
  renderMode = 'detail',
  coarsePointer = false,
  renderPort,
  children,
}: GraphNodeProps) => {
  // `useGraphNodeKnobs`, not `useResolvedKnobs` directly: it is task 1.6's ONE
  // node knob call site, so a §11 law gets added in one place rather than per
  // node kind. It resolves through the same real Preset / Surface / Intent
  // stack, which is what `KnobEnvelopeProvider` rebuilds inside the WebView —
  // so this component needs no native branch (design §6.1).
  const { knobProps, control } = useGraphNodeKnobs({ intent, selected, dragging });

  usePortInternals(id, ports);

  // SAFETY: the knob resolver only ever hands a graph component one of the
  // three size stops its kind declares (small / medium / large), which is
  // exactly `GraphNodeSizeKnob`; the resolver's own type is the wider union.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
  const size = knobProps.size as GraphNodeSizeKnob;
  const portSpacingPx = portSpacing({ coarsePointer });
  // The dot straddles the row's edge, so half of it lands inside the row. The
  // label clears the whole diameter rather than the half it strictly needs, so
  // the gutter still reads as a gutter at the `large` stop.
  const portGutterPx = paintedPortSize(size);
  const width = graphNodeWidth({ size, measure });
  const minHeight = graphNodeMinHeight({ size, ports: ports ?? [], portSpacingPx, measure });
  // The px the frame paints, read off the SAME fragment it is styled from.
  const radiusPx = containerRadiusPx(knobProps.containerRadius.borderRadius);
  const overview = isOverview(renderMode);
  // ZERO, never `display: none` and never an unmount. Children at opacity 0
  // are still laid out and still hold the box open, so the node's height is
  // the same number in both modes and React Flow's per-node ResizeObserver has
  // nothing to chase across a zoom tick. Design §5, and it is the invariant
  // `lod.test.tsx` exists for.
  const fade = detailOpacity(renderMode);

  return (
    <YStack
      data-graph-node={id}
      data-graph-node-radius={String(radiusPx)}
      data-graph-node-width={String(width)}
      data-graph-node-render-mode={renderMode}
      data-graph-node-port-spacing={String(portSpacingPx)}
      {...knobProps.surface}
      {...knobProps.containerRadius}
      {...knobProps.panelPadding}
      {...knobProps.gap}
      {...knobProps.elevationChrome}
      hoverStyle={{ ...control.hoverKnobProps }}
      pressStyle={{ ...control.pressKnobProps }}
      focusVisibleStyle={{ ...control.focusVisibleKnobProps }}
      width={width}
      minHeight={minHeight}
      // The containing block for its own ports. React Flow positions every
      // Handle absolutely, so a `static` frame hands them to whatever ancestor
      // happens to be positioned — off canvas, that is the document, and the
      // discs pile up in the page corner instead of on the node edge.
      position="relative"
      // §7.1 H6. Handles overhang the frame; a clipping node eats them.
      overflow="visible"
      opacity={dragging ? 0.85 : 1}
      transition={knobProps.transition}>
      <XStack
        {...knobProps.gap}
        alignItems="center"
        justifyContent="space-between">
        {/*
          `label` ALONE, and deliberately not `{...knobProps.heading}` before
          it. Measured in the MPO-191 knob fuzz: `label` carries
          `fontFamily: bodyFontValue` (resolveKnobs.ts:648-652) and `heading`
          carries the heading family, so spreading heading first and label
          second made the title paint the BODY face while the source read as if
          it painted the heading one. The rendered result was right — design §11
          declares this ink honours `bodyFont` — but only by spread order, and a
          reorder would have flipped a documented law silently. One fragment,
          one law. `GraphNode.test.tsx` pins that `headingFont` does not move it.
        */}
        <SizableText
          {...knobProps.label}
          numberOfLines={1}
          data-graph-node-title="">
          {title}
        </SizableText>
        {selected ? <YStack data-graph-node-selected="" /> : null}
      </XStack>

      {subtitle !== undefined && subtitle !== '' ? (
        <SizableText
          {...knobProps.body}
          {...knobProps.label}
          numberOfLines={2}
          // 0.75 is the subtitle's own de-emphasis in detail; overview
          // multiplies it to zero rather than replacing it, so the two laws
          // compose instead of one silently overriding the other.
          opacity={0.75 * fade}>
          {subtitle}
        </SizableText>
      ) : null}

      {ports !== undefined && ports.length > 0 ? (
        <YStack
          data-graph-node-ports=""
          gap={0}
          opacity={fade}
          // An invisible 44 px press target is a trap. The ports stay MOUNTED
          // (the box depends on them) but stop taking a pointer while nothing
          // is drawn there for the user to aim at.
          pointerEvents={overview ? 'none' : 'auto'}>
          {ports.map((port) => (
            <XStack
              key={port.id}
              data-graph-node-port-row={port.id}
              data-graph-node-port-side={port.side}
              height={portSpacingPx}
              alignItems="center"
              justifyContent={port.side === 'right' ? 'flex-end' : 'flex-start'}
              // Each row is the containing block for ITS OWN port. React Flow
              // places a handle at `top: 50%` of the nearest positioned
              // ancestor, so with only the frame positioned every left port on
              // a six-port node lands on the same pixel — seen in the Crowded
              // story before this line existed. Per-row makes the pitch real.
              position="relative"
              // The row is where the port's painted disc overhangs the frame.
              overflow="visible">
              {renderPort?.(port)}
              <SizableText
                {...knobProps.body}
                {...knobProps.label}
                numberOfLines={1}
                paddingLeft={port.side === 'right' ? 0 : portGutterPx}
                paddingRight={port.side === 'right' ? portGutterPx : 0}>
                {port.label ?? port.id}
              </SizableText>
            </XStack>
          ))}
        </YStack>
      ) : null}

      {/*
        Wrapped, and the wrapper is present in BOTH modes. Rendering
        `{children}` bare and switching it off in overview is what the previous
        version did, and an unmount collapses the box — which is the one thing
        design §5 forbids, because React Flow's observer then reports a new
        height and every edge attached to this node moves.
      */}
      {/* oxlint-disable-next-line typescript/strict-boolean-expressions -- ReactNode truthiness is the intended test: nothing to wrap means no wrapper */}
      {children ? (
        <YStack
          data-graph-node-children=""
          opacity={fade}
          pointerEvents={overview ? 'none' : 'auto'}>
          {children}
        </YStack>
      ) : null}
    </YStack>
  );
};
