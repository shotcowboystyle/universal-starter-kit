/**
 * The ONE registered React Flow node type.
 *
 * Same shape as the edge layer (design §4.4): one registration, switching on
 * the model kind internally, so the node component count stays at one however
 * many kinds a schema declares. It looks the kind up in the schema and renders
 * that kind's own `render` — the consumer's Tamagui body — which is what keeps
 * nodes Tamagui rather than a fixed shape this package chose.
 *
 * `renderMode` is computed HERE, from the live zoom, and handed down as a prop
 * (design §5). Every mode keeps the same box: below `overviewZoom` children
 * fade, they do not unmount, because React Flow 12 installs a per-node
 * `ResizeObserver` and a height-changing LOD would re-measure every node on
 * every zoom tick and move every edge endpoint with it.
 */

import { createContext, memo, useContext, useEffect, useMemo } from 'react';

import type { EdgeKindDefs, GraphSchema, NodeKindDefs, PortSpec } from '../model/index';
import { nodeKindSpec } from '../model/index';
import { lodForZoom } from '../nodes/lod';

import type { GraphFlowNodeData } from './flowAdapter';
import { registerMountedNode } from './nodeCensus';
import { useStore } from './xy';
import type { NodeProps } from './xy';

export interface GraphHostValue {
  readonly schema: GraphSchema<NodeKindDefs, EdgeKindDefs>;
  /** Below this zoom the graph draws in `overview` mode (design §5). */
  readonly overviewZoom: number;
  /** Touch surface: fields are display-only and taps route to the sheet. */
  readonly coarsePointer: boolean;
  readonly readOnly: boolean;
  readonly setNodeData: (id: string, patch: Record<string, unknown>) => void;
}

const GraphHostContext = createContext<GraphHostValue | null>(null);

export const GraphHostProvider = GraphHostContext.Provider;

export function useGraphHost(): GraphHostValue {
  const value = useContext(GraphHostContext);
  if (!value) {
    throw new Error(
      '[@repo/node-graph] a graph node rendered outside <NodeGraph>. ' +
        'The node type is registered by the canvas and cannot be used on its own.',
    );
  }
  return value;
}

function GraphNodeHostComponent({ id, data, selected, dragging }: NodeProps) {
  const host = useGraphHost();
  const nodeData = data as unknown as GraphFlowNodeData;
  const zoom = useStore((state) => state.transform[2]);
  const spec = nodeKindSpec(host.schema, nodeData.kind);

  /**
   * The census, design 9.5's `nodesMounted` (MPO-211).
   *
   * This is the only component React Flow mounts once per RENDERED node, so
   * it is the only place the number is knowable — with `onlyRenderVisibleElements`
   * on, the store still holds every node while only the visible ones mount, and
   * the document holds more still. Registering here counts what is painted,
   * whatever body the consumer's schema renders.
   *
   * Before the early return: the unknown-kind branch below still mounted a node.
   */
  useEffect(() => registerMountedNode(id), [id]);

  const setData = useMemo(
    () => (patch: Record<string, unknown>) => {
      host.setNodeData(id, patch);
    },
    [host, id],
  );

  if (!spec) {
    // A kind the schema does not declare. Loud rather than blank: a node that
    // silently renders nothing is the hardest kind of missing thing to find.
    return (
      <div
        data-graph-node-unknown={nodeData.kind}
        role="alert">
        {`unknown node kind: ${nodeData.kind}`}
      </div>
    );
  }

  const Render = spec.render;
  return (
    <Render
      id={id}
      data={nodeData.data}
      selected={selected ?? false}
      dragging={dragging ?? false}
      renderMode={lodForZoom(zoom, host.overviewZoom)}
      readOnlyFields={host.readOnly || host.coarsePointer}
      ports={nodeData.ports}
      measure={spec.measure}
      setData={setData as never}
    />
  );
}

export const GraphNodeHost = memo(GraphNodeHostComponent);
