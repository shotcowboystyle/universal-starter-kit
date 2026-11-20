/**
 * A port. PAINTED ONLY — this component draws a dot and declares a hit region;
 * it decides nothing about whether a connection is legal. That is
 * `validateConnection`'s job (task 1.3) and the puck's (task 3.5).
 *
 * Two knob laws it obeys and one it refuses (design §11):
 *  - size: `honor`. The painted dot is 8 / 10 / 12.
 *  - borderWidth: `honor`. The dot's ring follows the knob.
 *  - borderRadius: `IGNORE`. 50% at every stop, `none` included, because a
 *    square port reads as a resize grip. The circle is the part's identity,
 *    not its styling.
 *  - elevation: `ignore`. Ports never cast a shadow.
 *
 * The 44pt region is a `::after` pseudo-element in `css/graph.css`, never
 * element growth — see §7.1 H2 and `handle-geometry.ts`. This component's only
 * job in that mechanism is to publish the two custom properties the sheet
 * reads, so the geometry has exactly one source.
 */

import { isTouchSurface, useResolvedKnobs } from '@repo/theme';
import type { CSSProperties } from 'react';

import { Handle, Position } from '../react-flow/xy';

import { paintedPortSize, portHitSize, portRegionInset } from './handle-geometry';
import type { GraphNodeSizeKnob, GraphPortSide } from './node-measure';

const positionForSide: Record<GraphPortSide, Position> = {
  left: Position.Left,
  right: Position.Right,
  top: Position.Top,
  bottom: Position.Bottom,
};

export interface GraphPortProps {
  readonly id: string;
  readonly side: GraphPortSide;
  readonly direction: 'in' | 'out';
  /** Semantic intent — reaches the resolver, never a color prop. */
  readonly intent?: string;
  /**
   * true on a touch surface. Picks H3's 44 over its fine-pointer value.
   *
   * Defaults to `isTouchSurface()` (design 7.1 H3), not to `false`. A port
   * rendered on a phone with nobody passing the prop was getting a 24 px
   * target — under the press floor the whole mechanism exists to reach — and
   * nothing in the type said so. The canvas passes it explicitly; this is the
   * standalone case.
   */
  readonly coarsePointer?: boolean;
  /** The owning node's port pitch, so H4's crowding cap can bite. */
  readonly portSpacingPx?: number;
  readonly isConnectable?: boolean;
}

export const GraphPort = ({
  id,
  side,
  direction,
  intent,
  coarsePointer = isTouchSurface(),
  portSpacingPx,
  isConnectable = true,
}: GraphPortProps) => {
  const { knobProps } = useResolvedKnobs({ component: 'GraphPort', intent });
  // SAFETY: the knob resolver only ever hands a graph component one of the
  // three size stops its kind declares (small / medium / large), which is
  // exactly `GraphNodeSizeKnob`; the resolver's own type is the wider union.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
  const size = knobProps.size as GraphNodeSizeKnob;

  const painted = paintedPortSize(size);
  const hit = portHitSize({ size, coarsePointer, portSpacingPx });
  const borderWidthPx = knobProps.surface.borderWidth;
  // The zoom-1 inset. Not a style any more (see below) — it is REPORTED, on
  // `data-graph-port-inset`, so the `HitTarget` story and `GraphPort.test.tsx`
  // can read the number the sheet reduces to when nothing is zoomed.
  const inset = portRegionInset({ size, coarsePointer, portSpacingPx, borderWidthPx });

  // `Handle` renders a plain div, not a Tamagui stack, so the knob fragment is
  // spread into a style object rather than onto props. It is still the whole
  // `surface` fragment — no token is cherry-picked out of it.
  const style: CSSProperties = {
    backgroundColor: knobProps.surface.backgroundColor,
    borderColor: knobProps.surface.borderColor,
    borderWidth: borderWidthPx,
    borderStyle: 'solid',
    // The custom properties `css/graph.css` reads. Three INPUTS, not an
    // answer: the sheet computes the inset itself, because milestone 6's H7
    // makes it depend on the live viewport zoom — which this component cannot
    // see without subscribing to the store on every pinch frame, and would then
    // have to re-render every port to publish.
    //
    // `--mpo-graph-handle-inset` used to be published here as the answer. It is
    // gone rather than kept beside the calc: a var nothing reads is the kind of
    // drift that survives three refactors and then gets believed.
    // SAFETY: widening a custom-property key to `string` only opts it out of
    // CSSProperties' excess-property check; React writes any key as a style.
    ['--mpo-graph-handle-size' as string]: `${painted}px`,
    // SAFETY: as above — a custom property, widened past the excess-property check.
    ['--mpo-graph-handle-hit' as string]: `${hit}px`,
    // SAFETY: as above — a custom property, widened past the excess-property check.
    ['--mpo-graph-handle-border' as string]: `${borderWidthPx}px`,
    // §11: the circle is identity. Declared here as well as in the sheet so a
    // consumer who forgets to import the CSS still gets a round port rather
    // than a square one that reads as a resize grip.
    borderRadius: '50%',
    width: painted,
    height: painted,
    boxShadow: 'none',
  };

  return (
    <Handle
      id={id}
      type={direction === 'in' ? 'target' : 'source'}
      position={positionForSide[side]}
      className="mp-graph-port"
      isConnectable={isConnectable}
      style={style}
      data-graph-port={id}
      data-graph-port-painted={String(painted)}
      data-graph-port-hit={String(hit)}
      data-graph-port-inset={String(inset)}
    />
  );
};
