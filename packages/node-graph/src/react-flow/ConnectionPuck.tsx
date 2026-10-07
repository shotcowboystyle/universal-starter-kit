/**
 * The connection puck (design §7.4, task 3.5).
 *
 * The native spike named this the hardest touch item, verbatim: the finger
 * occludes the port it is aiming at. So during a connection drag ONE overlay,
 * pinned to the top of the canvas, says what the drag is currently over. One
 * div, updated on move, no per-node cost.
 *
 * COUNTER-SCALED, and the mechanism is placement rather than arithmetic. React
 * Flow renders `<ReactFlow>`'s children as siblings of `.react-flow__viewport`,
 * not inside it, so nothing here rides the pan/zoom matrix and the puck is the
 * same physical size at zoom 0.25 and at zoom 2. Applying a `scale(1/zoom)` on
 * top of that would counter a transform that was never applied and shrink the
 * puck as the user zoomed IN. `ConnectionPuck.spec.tsx` measures the rendered
 * size at both extremes rather than trusting either story.
 *
 * The candidate it names is filtered through `legalTargets`. `connectionRadius`
 * is the 44 px hit diameter (task 3.4 H5), so React Flow will snap the drag
 * onto whatever handle is nearest, including one the schema refuses. Naming a
 * target the drop will then reject is worse than naming nothing.
 */

import { useResolvedKnobs } from '@repo/theme';
import { SizableText, XStack } from 'tamagui';

import { isLegalTarget } from '../interaction/legalTargets';
import type { EdgeKindDefs, GraphDocument, GraphSchema, NodeKindDefs, PortRef, PortSpec } from '../model/index';
import { resolvePorts } from '../model/index';

import { useStore } from './xy';

export interface ConnectionPuckProps<N extends NodeKindDefs, E extends EdgeKindDefs> {
  readonly document: GraphDocument<N, E>;
  readonly schema: GraphSchema<N, E>;
  /**
   * Names a node for the puck. Defaults to the node id, which is the only name
   * the MODEL has: a node's human title lives in the consumer's own `render`,
   * and this package cannot reach into it.
   */
  readonly nodeLabel?: (nodeId: string) => string | undefined;
  /** Semantic intent, reaches the resolver, never a colour prop. */
  readonly intent?: string;
}

/** Separator that cannot occur in a node id or a port id, so the key round-trips. */
const keySeparator = '\u0000';

function portOf<N extends NodeKindDefs, E extends EdgeKindDefs>(
  document: GraphDocument<N, E>,
  schema: GraphSchema<N, E>,
  ref: PortRef,
): PortSpec | undefined {
  const node = document.nodes.find((candidate) => candidate.id === ref.node);
  if (!node) {
    return undefined;
  }
  return resolvePorts(schema, node).find((candidate) => candidate.id === ref.port);
}

function splitKey(key: string): PortRef {
  const at = key.indexOf(keySeparator);
  return { node: key.slice(0, at), port: key.slice(at + 1) };
}

export interface ConnectionPuckLabel {
  /** What the puck says. */
  readonly text: string;
  /** Whether a LEGAL candidate is under the pointer right now. */
  readonly legal: boolean;
  /** `node:port` of that candidate, or `""`. What the device screenshot reads. */
  readonly target: string;
}

/**
 * What the puck should say, as a pure function.
 *
 * Split out of the component because everything interesting here is a
 * DECISION — is this candidate legal, and if not what is still worth saying —
 * and a decision asserted through a rendered DOM is a decision asserted
 * through three layers of Tamagui. The component keeps only the two store
 * reads.
 */
export function connectionPuckLabel<N extends NodeKindDefs, E extends EdgeKindDefs>(opts: {
  readonly document: GraphDocument<N, E>;
  readonly schema: GraphSchema<N, E>;
  /** null when no connection is in progress. */
  readonly source: PortRef | null;
  /** null when the drag is over open canvas. */
  readonly candidate: PortRef | null;
  readonly nodeLabel?: (nodeId: string) => string | undefined;
}): ConnectionPuckLabel | null {
  const { document, schema, source, candidate, nodeLabel } = opts;
  if (!source) {
    return null;
  }
  const legal = candidate ? isLegalTarget({ document, schema, source, target: candidate }) : false;
  const name = (ref: PortRef) => {
    const spec = portOf(document, schema, ref);
    return `${nodeLabel?.(ref.node) ?? ref.node} / ${spec?.label ?? ref.port}`;
  };
  return {
    legal,
    target: legal && candidate ? `${candidate.node}:${candidate.port}` : '',
    // An illegal candidate falls back to naming the SOURCE rather than going
    // blank: a puck that disappears the moment the finger drifts over a
    // refused port reads as a broken overlay, not as a refusal.
    text: legal && candidate ? name(candidate) : `from ${name(source)}`,
  };
}

export function ConnectionPuck<N extends NodeKindDefs, E extends EdgeKindDefs>({
  document,
  schema,
  nodeLabel,
  intent,
}: ConnectionPuckProps<N, E>) {
  const { knobProps } = useResolvedKnobs({ component: 'ConnectionPuck', intent });

  // Two STRINGS, not the connection object. The store hands back a fresh
  // object on every pointer tick, so selecting it whole would re-render this
  // component on every frame of a pan as well as a connect. A string compares
  // by value, which is what makes zustand's shallow check bite.
  const fromKey = useStore((state) =>
    state.connection.inProgress
      ? `${state.connection.fromHandle.nodeId}${keySeparator}${state.connection.fromHandle.id ?? ''}`
      : null,
  );
  const toKey = useStore((state) =>
    state.connection.inProgress && state.connection.toHandle
      ? `${state.connection.toHandle.nodeId}${keySeparator}${state.connection.toHandle.id ?? ''}`
      : null,
  );

  const label = connectionPuckLabel({
    document,
    schema,
    source: fromKey ? splitKey(fromKey) : null,
    candidate: toKey ? splitKey(toKey) : null,
    nodeLabel,
  });
  if (!label) {
    return null;
  }

  return (
    <XStack
      // React Flow's children are siblings of the viewport, so `absolute` here
      // is against the CANVAS and the puck stays put while the graph moves
      // underneath it.
      position="absolute"
      top="$3"
      left="50%"
      transform="translateX(-50%)"
      zIndex={5}
      pointerEvents="none"
      data-graph-connection-puck=""
      data-graph-puck-target={label.target}
      data-graph-puck-legal={String(label.legal)}
      {...knobProps.elevatedSurface}
      {...knobProps.containerRadius}
      {...knobProps.panelPadding}
      {...knobProps.gap}
      {...knobProps.elevationChrome}
      alignItems="center"
      // Dimmed while nothing legal is under the pointer. The puck is still
      // saying something true, what you are dragging, just not the thing the
      // user is looking for.
      opacity={label.legal ? 1 : 0.7}
      transition={knobProps.transition}>
      <SizableText
        {...knobProps.label}
        numberOfLines={1}>
        {label.text}
      </SizableText>
    </XStack>
  );
}
