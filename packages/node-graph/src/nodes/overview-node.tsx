/**
 * The overview body: one plain box with the resolved background (design §5).
 *
 * At 500 nodes and zoom 0.2, a Tamagui body per node is 500 knob resolutions,
 * 500 subtrees and 500 observer callbacks to paint something the size of a
 * postage stamp. This is what a consumer swaps in instead, and it is also what
 * the merged single-path edge layer will sit behind in v1.1.
 *
 * The load-bearing part is not the div, it is the MEASURE. Width and minimum
 * height come from `node-measure.ts` — the same recipe `GraphNode` uses, given
 * the same knobs and the same ports — so swapping the body cannot change the
 * node's box, and React Flow's per-node `ResizeObserver` has nothing to report.
 * A "small gray rectangle" here would move every edge endpoint on the canvas
 * the moment a user zoomed out, which is the failure design §5 is written
 * against.
 *
 * `lod.test.tsx` asserts the box against `GraphNode`'s rather than against a
 * number, so the two cannot drift.
 */

import { useResolvedKnobs } from '@repo/theme';
import { YStack } from 'tamagui';

import type { GraphNodeMeasure, GraphNodePort, GraphNodeSizeKnob } from './node-measure';
import { graphNodeMinHeight, graphNodeWidth, portSpacing } from './node-measure';

export interface OverviewNodeProps {
  readonly id: string;
  /** Same ports the detail body would render. They set the height floor. */
  readonly ports?: readonly GraphNodePort[];
  /** Semantic intent — reaches the resolver, never a color prop. */
  readonly intent?: string;
  readonly selected?: boolean;
  /** `NodeKindSpec.measure`; falls back to the per-kind default table. */
  readonly measure?: Partial<GraphNodeMeasure>;
  /** true on a touch surface — widens the port pitch, raising the floor. */
  readonly coarsePointer?: boolean;
}

export const OverviewNode = ({
  id,
  ports,
  intent,
  selected = false,
  measure,
  coarsePointer = false,
}: OverviewNodeProps) => {
  // The same resolver call the detail body makes, so the fill is the fill the
  // user was just looking at rather than a second gray invented here.
  const { knobProps } = useResolvedKnobs({ component: 'GraphNode', intent });
  // SAFETY: the knob resolver only ever hands a graph component one of the
  // three size stops its kind declares (small / medium / large), which is
  // exactly `GraphNodeSizeKnob`; the resolver's own type is the wider union.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
  const size = knobProps.size as GraphNodeSizeKnob;
  const portSpacingPx = portSpacing({ coarsePointer });

  return (
    <YStack
      data-graph-node={id}
      data-graph-node-render-mode="overview"
      data-graph-node-overview=""
      data-graph-node-width={String(graphNodeWidth({ size, measure }))}
      {...knobProps.surface}
      {...knobProps.containerRadius}
      width={graphNodeWidth({ size, measure })}
      minHeight={graphNodeMinHeight({ size, ports: ports ?? [], portSpacingPx, measure })}
      position="relative"
      // §7.1 H6, and it matters more here, not less: the ports are still
      // mounted on the node in overview mode, so a clipping frame would eat
      // them exactly as it would in detail.
      overflow="visible"
      opacity={selected ? 1 : 0.9}
    />
  );
};
