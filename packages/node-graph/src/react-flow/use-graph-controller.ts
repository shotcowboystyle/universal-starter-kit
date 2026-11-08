/**
 * The controller: one document, one undo journal, and the four React Flow
 * callbacks that keep them honest.
 *
 * The rule that shapes everything here: **mid-drag is not a document state.**
 * React Flow emits a `position` change per animation frame, so a two-second
 * drag is ~120 of them. Committing each one would fire `onDocumentChange` 120
 * times, hand a consumer 120 autosaves, and bury the undo stack. So the live
 * React Flow array moves on every frame (the drag has to look right) while the
 * DOCUMENT moves once, when React Flow marks the last change `dragging: false`.
 * `use-graph-controller.test.tsx` pins that at 30 changes → 1 commit → 1 undo.
 *
 * Controlled and uncontrolled are the same code path with a different source of
 * truth: `commit` always computes the next document and always calls
 * `onDocumentChange`; it only WRITES to local state when uncontrolled. A
 * controlled parent that ignores the callback simply sees nothing move, which
 * is the behaviour every controlled React input has.
 *
 * Design: docs/design/node-graph-editor.md §4.5, §5.
 */

import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { LayoutRunnerKind } from '../diagnostics/types';
import { layout, reconcilePositions } from '../layout/layout';
import type { GraphLayoutOptions } from '../layout/layout';
import type { LayoutResult } from '../layout/types';
import { applyCommand } from '../model/commands';
import { validateConnection, validateDrop } from '../model/connect';
import type { NodeId, Size, XY } from '../model/document';
import { createHistory } from '../model/history';
import type {
  ConnectionVerdict,
  EdgeKindDefs,
  GraphCommand,
  GraphDocument,
  GraphEdgeOf,
  GraphSchema,
  HistoryOptions,
  NodeKindDefs,
} from '../model/index';
import { FINE_PORT_PITCH, portSpacing } from '../nodes/node-measure';
import type { GraphNodeSizeKnob } from '../nodes/node-measure';

import type { GraphFlowNodeData } from './flow-adapter';
import { preserveFlowState, toFlowEdges, toFlowNodes } from './flow-adapter';
import { applyEdgeChanges, applyNodeChanges } from './xy';
import type { Connection, Edge, EdgeChange, Node, NodeChange } from './xy';

/**
 * Dev-only, and genuinely once — a message repeated on every frame of a drag is
 * how a console gets trained out of a team.
 */
const warned = new Set<string>();
const warnOnce = (message: string): void => {
  if (process.env.NODE_ENV === 'production') {
    return;
  }
  if (warned.has(message)) {
    return;
  }
  warned.add(message);
  console.warn(`[@repo/node-graph] ${message}`);
};

/** Test seam. A module-level dedupe set outlives a test file otherwise. */
export const resetControllerWarnings = (): void => {
  warned.clear();
};

export interface UseGraphControllerOptions<N extends NodeKindDefs, E extends EdgeKindDefs> {
  readonly schema: GraphSchema<N, E>;
  /** Controlled. Wins over `defaultDocument`, with a warning, when both are passed. */
  readonly document?: GraphDocument<N, E>;
  /** Uncontrolled seed. Read once, at mount. */
  readonly defaultDocument?: GraphDocument<N, E>;
  readonly onDocumentChange?: (document: GraphDocument<N, E>, command: GraphCommand<N, E>) => void;
  /** Called when a DROP is refused, with the verdict `validateDrop` returned. */
  readonly onConnectionRefused?: (verdict: ConnectionVerdict) => void;
  /** Selection still works; nothing else commits. */
  readonly readOnly?: boolean;
  readonly history?: HistoryOptions;
  /** The resolved `size` knob, for the node measure seed. */
  readonly size?: GraphNodeSizeKnob;
  /** Touch surface: widens the port pitch, which raises the node height floor. */
  readonly coarsePointer?: boolean;
  /** The React Flow node type name `NodeGraphWeb` registers. */
  readonly nodeType?: string;
  /**
   * Reads the boxes React Flow has MEASURED, at the moment a relayout starts.
   *
   * A getter rather than a prop: measured sizes change on every observer
   * callback, and holding 200 of them in state would re-render the canvas for
   * a value only `relayout()` ever reads.
   */
  readonly readMeasuredSizes?: () => Readonly<Record<NodeId, Size>> | undefined;
}

export interface GraphController<N extends NodeKindDefs, E extends EdgeKindDefs> {
  readonly document: GraphDocument<N, E>;
  readonly nodes: Node<GraphFlowNodeData>[];
  readonly edges: Edge[];
  readonly onNodesChange: (changes: NodeChange[]) => void;
  readonly onEdgesChange: (changes: EdgeChange[]) => void;
  readonly onConnect: (connection: Connection) => void;
  readonly isValidConnection: (connection: Connection | Edge) => boolean;
  readonly commit: (command: GraphCommand<N, E>) => void;
  readonly undo: () => void;
  readonly redo: () => void;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  /**
   * Tidy the graph. ONE `setPositions` command, one undo, design §8.
   *
   * Resolves with the engine's result even when nothing was committed (an
   * empty document, `readOnly`, or a superseded generation), so a caller can
   * report the runner and the ms without inferring them from a side effect.
   * `null` means there was nothing to lay out.
   */
  readonly relayout: (options?: GraphRelayoutOptions) => Promise<LayoutResult | null>;
  /** `none` until the first relayout has resolved a runner. */
  readonly layoutRunner: LayoutRunnerKind;
  /** Engine milliseconds of the last relayout. `null` before the first. */
  readonly lastLayoutMs: number | null;
  /** True from the call until its result has been applied. */
  readonly layoutPending: boolean;
}

/** Everything `layout()` takes except the measure knobs, which the canvas owns. */
export type GraphRelayoutOptions = Omit<GraphLayoutOptions, 'size' | 'coarsePointer'>;

export const defaultGraphNodeType = 'mpGraphNode';

const emptyDocument = <N extends NodeKindDefs, E extends EdgeKindDefs>(): GraphDocument<N, E> => ({
  version: 1,
  nodes: [],
  edges: [],
});

/** The deltas a finished drag actually produced, zero-movement nodes dropped. */
const dragDeltas = <N extends NodeKindDefs, E extends EdgeKindDefs>(
  document: GraphDocument<N, E>,
  nodes: readonly Node<GraphFlowNodeData>[],
): Readonly<Record<NodeId, XY>> => {
  const live = new Map<string, XY>(nodes.map((node) => [node.id, node.position]));
  const deltas: Record<NodeId, XY> = {};
  for (const node of document.nodes) {
    const to = live.get(node.id);
    if (to === undefined) {
      continue;
    }
    const dx = to.x - node.position.x;
    const dy = to.y - node.position.y;
    if (dx !== 0 || dy !== 0) {
      deltas[node.id] = { x: dx, y: dy };
    }
  }
  return deltas;
};

/**
 * Which kind a fresh connection becomes.
 *
 * `"flow"` when the schema has it — control moving is the neutral reading of a
 * plain drag — otherwise the first declared kind, because a schema that omits
 * `flow` has said what its own default is by declaration order.
 */
const defaultEdgeKind = <N extends NodeKindDefs, E extends EdgeKindDefs>(
  schema: GraphSchema<N, E>,
): string | undefined => {
  const names = Object.keys(schema.edges);
  return names.includes('flow') ? 'flow' : names[0];
};

export const useGraphController = <N extends NodeKindDefs, E extends EdgeKindDefs>(
  options: UseGraphControllerOptions<N, E>,
): GraphController<N, E> => {
  const {
    schema,
    document: controlledDocument,
    defaultDocument,
    onDocumentChange,
    onConnectionRefused,
    readOnly = false,
    size = 'medium',
    coarsePointer = false,
    nodeType = defaultGraphNodeType,
    readMeasuredSizes,
  } = options;

  const controlled = controlledDocument !== undefined;
  if (controlled && defaultDocument !== undefined) {
    warnOnce(
      'useGraphController received both `document` and `defaultDocument`. ' +
        '`document` wins; drop `defaultDocument` to silence this.',
    );
  }

  const [ownDocument, setOwnDocument] = useState<GraphDocument<N, E>>(
    () => defaultDocument ?? controlledDocument ?? emptyDocument<N, E>(),
  );
  const document = controlled ? controlledDocument : ownDocument;

  // The journal is per-controller, not per-render. Rebuilding it on an
  // inline `{ limit: 100 }` literal would silently erase the undo stack on
  // every render of the parent, so it is created once, lazily.
  // oxlint-disable-next-line react/hook-use-state -- the journal is mutated through its own methods; it never needs a setter
  const [history] = useState(() => createHistory<N, E>(options.history));
  const [historyVersion, setHistoryVersion] = useState(0);

  const portSpacingPx = coarsePointer ? portSpacing({ coarsePointer }) : FINE_PORT_PITCH;
  const mapping = useMemo(() => ({ size, portSpacingPx, nodeType }), [size, portSpacingPx, nodeType]);

  const [nodes, setNodes] = useState<Node<GraphFlowNodeData>[]>(() => toFlowNodes(document, schema, mapping));
  const [edges, setEdges] = useState<Edge[]>(() => toFlowEdges(document, schema));
  // Latest-value refs: the callbacks below read the current value without
  // re-subscribing on every render.
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const documentRef = useRef(document);
  documentRef.current = document;

  const schemaRef = useRef(schema);
  schemaRef.current = schema;

  // Relayout bookkeeping (see `relayout` below). Declared here because
  // `onNodesChange` records touched nodes into `layoutTouchedRef`.
  const measuredRef = useRef(readMeasuredSizes);
  measuredRef.current = readMeasuredSizes;
  const layoutGenerationRef = useRef(0);
  const layoutTouchedRef = useRef<Set<NodeId> | null>(null);
  const [layoutRunner, setLayoutRunner] = useState<LayoutRunnerKind>('none');
  const [lastLayoutMs, setLastLayoutMs] = useState<number | null>(null);
  const [layoutPending, setLayoutPending] = useState(false);

  // Re-derive when the AUTHORITATIVE document changes — a controlled prop, or
  // our own commit. Never mid-drag: `onNodesChange` writes the live array
  // directly and the document does not move until the drag ends, so this
  // effect does not fire and cannot fight the pointer.
  //
  // The schema is keyed by `schema.id`, NOT by object identity. `createGraphSchema`
  // returns a fresh object every call, so `useGraphController({ schema:
  // makeSchema(), … })` — the obvious way to write it, and what the spec does —
  // would otherwise re-derive, re-render, build another schema and never
  // settle. Measured: the first version of this effect hung the spec run
  // outright. `schema.id` is already the schema's identity in this package
  // (design §4.3: it is what crosses the bridge), so keying on it is not a
  // workaround, it is the declared identity. A schema mutated in place under
  // the same id does not re-derive, which is the documented cost.
  useEffect(() => {
    const { current } = schemaRef;
    setNodes((previous) => preserveFlowState(toFlowNodes(document, current, mapping), previous));
    setEdges(toFlowEdges(document, current));
  }, [document, schema.id, mapping]);

  const commit = useCallback(
    (command: GraphCommand<N, E>) => {
      const { current } = documentRef;
      const next = history.commit(current, command);
      setHistoryVersion((version) => version + 1);
      if (!controlled) {
        setOwnDocument(next);
      }
      documentRef.current = next;
      onDocumentChange?.(next, command);
    },
    [controlled, history, onDocumentChange],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      // SAFETY: the input array is Node<GraphFlowNodeData>[] and React Flow's
      // changes only move/select/measure existing nodes, so every node keeps its data shape.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
      const next = applyNodeChanges(changes, nodesRef.current) as Node<GraphFlowNodeData>[];
      nodesRef.current = next;
      setNodes(next);
      // The generation guard's other half (design §8). Every node the user
      // moves while a layout is in flight is remembered, so the arriving
      // result can skip it instead of yanking it back under the pointer.
      if (layoutTouchedRef.current) {
        for (const change of changes) {
          if (change.type === 'position') {
            layoutTouchedRef.current.add(change.id);
          }
        }
      }
      if (readOnly) {
        return;
      }
      // The END of a drag, and only that, is a document edit.
      const dragEnded = changes.some((change) => change.type === 'position' && change.dragging === false);
      if (!dragEnded) {
        return;
      }
      const deltas = dragDeltas(documentRef.current, next);
      if (Object.keys(deltas).length === 0) {
        return;
      }
      commit({ t: 'moveNodes', deltas });
    },
    [commit, readOnly],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const next = applyEdgeChanges(changes, edges);
      setEdges(next);
      if (readOnly) {
        return;
      }
      const removed = changes
        .filter((change): change is EdgeChange & { type: 'remove'; id: string } => change.type === 'remove')
        .map((change) => change.id);
      if (removed.length === 0) {
        return;
      }
      commit({ t: 'removeEdges', ids: removed });
    },
    [commit, edges, readOnly],
  );

  const connectionContext = useCallback(
    (connection: Connection | Edge) => {
      if (!connection.source || !connection.target) {
        return null;
      }
      // A handle id is the PORT id. React Flow allows a node with one unnamed
      // handle, but this package always names them (`GraphPort` requires an
      // `id`), so a null handle here is a half-built drag, not a default.
      const sourcePort = connection.sourceHandle ?? '';
      const targetPort = connection.targetHandle ?? '';
      if (sourcePort === '' || targetPort === '') {
        return null;
      }
      return {
        document: documentRef.current,
        schema,
        source: { node: connection.source, port: sourcePort },
        target: { node: connection.target, port: targetPort },
      };
    },
    [schema],
  );

  const isValidConnection = useCallback(
    (connection: Connection | Edge) => {
      if (readOnly) {
        return false;
      }
      const ctx = connectionContext(connection);
      if (!ctx) {
        return false;
      }
      // `validateConnection`, NEVER `validateDrop`: this runs on every pointer
      // tick of a connection drag, and the drop rules are the O(V+E) ones
      // (design §4.4). The type refuses a drop-only rule here; the spec pins
      // that the drop rules do not run.
      return validateConnection(ctx).ok;
    },
    [connectionContext, readOnly],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (readOnly) {
        return;
      }
      const ctx = connectionContext(connection);
      if (!ctx) {
        return;
      }
      const verdict = validateDrop(ctx);
      if (!verdict.ok) {
        onConnectionRefused?.(verdict);
        return;
      }
      const kind = defaultEdgeKind(schema);
      if (kind === undefined || kind === '') {
        return;
      }
      // SAFETY: `schema.edges` is an object keyed by edge kind name; widening
      // it to a string-keyed record only loses the per-kind data typing.
      const spec = (schema.edges as Record<string, { defaultData?: unknown } | undefined>)[kind];
      // SAFETY: `kind` is a declared key of `schema.edges` and `data` is that kind's
      // own `defaultData`, which is the shape `GraphEdgeOf<E>` requires for it.
      // oxlint-disable-next-line anti-slop/no-chained-type-assertions, typescript/no-unsafe-type-assertion -- see SAFETY above
      const edge = {
        id: `${ctx.source.node}:${ctx.source.port}->${ctx.target.node}:${ctx.target.port}`,
        kind,
        source: ctx.source,
        target: ctx.target,
        // The kind's own `defaultData`. `E[kind]` cannot be proven from a
        // runtime string, so the cast is at the ONE place the kind is chosen,
        // not spread through the command type.
        data: spec?.defaultData ?? {},
      } as unknown as GraphEdgeOf<E>;
      commit({ t: 'addEdges', edges: [edge] });
    },
    [commit, connectionContext, onConnectionRefused, readOnly, schema],
  );

  /**
   * Auto-layout, design §8. The whole point of this function is that a tidy is
   * ONE history entry: `setPositions` carries absolutes, so its inverse holds
   * the whole prior arrangement and one undo puts the graph back exactly.
   *
   * The staleness rules are two, and they are different:
   *
   *  - A NEWER relayout supersedes an older one outright. Two arrangements
   *    landing one after the other would be two undo entries for one button
   *    press, and the first is not an arrangement anybody asked to keep.
   *  - A node the user TOUCHED mid-flight is skipped, and the rest of the
   *    result still applies. Discarding everything because one node moved
   *    makes a relayout feel like it silently failed.
   */
  const relayout = useCallback(
    async (layoutOptions: GraphRelayoutOptions = {}): Promise<LayoutResult | null> => {
      const source = documentRef.current;
      if (source.nodes.length === 0) {
        return null;
      }

      layoutGenerationRef.current += 1;
      const generation = layoutGenerationRef.current;
      layoutTouchedRef.current = new Set<NodeId>();
      setLayoutPending(true);

      let result: LayoutResult;
      try {
        result = await layout(source, schemaRef.current, {
          ...layoutOptions,
          size,
          coarsePointer,
          measured: layoutOptions.measured ?? measuredRef.current?.(),
        });
      } finally {
        if (layoutGenerationRef.current === generation) {
          setLayoutPending(false);
        }
      }

      // A later relayout already went out; this one's arrangement is not the
      // one the user is waiting for.
      if (layoutGenerationRef.current !== generation) {
        return result;
      }

      const touched = layoutTouchedRef.current ?? new Set<NodeId>();
      layoutTouchedRef.current = null;
      setLayoutRunner(result.runner ?? 'inline');
      setLastLayoutMs(result.ms);
      if (readOnly) {
        return result;
      }

      const positions = reconcilePositions(result, touched);
      if (Object.keys(positions).length === 0) {
        return result;
      }

      // `startTransition`, so React never paints a half-laid-out graph and the
      // 200-node commit cannot preempt the frame the user is panning in.
      startTransition(() => {
        commit({ t: 'setPositions', positions });
      });
      return result;
    },
    [coarsePointer, commit, readOnly, size],
  );

  const publishHistoryChange = useCallback(
    (next: GraphDocument<N, E>, command: GraphCommand<N, E>) => {
      if (next === documentRef.current) {
        return;
      }
      if (!controlled) {
        setOwnDocument(next);
      }
      documentRef.current = next;
      onDocumentChange?.(next, command);
    },
    [controlled, onDocumentChange],
  );

  const undo = useCallback(() => {
    history.undo(documentRef.current, publishHistoryChange);
    setHistoryVersion((version) => version + 1);
  }, [history, publishHistoryChange]);

  const redo = useCallback(() => {
    history.redo(documentRef.current, publishHistoryChange);
    setHistoryVersion((version) => version + 1);
  }, [history, publishHistoryChange]);

  return {
    document,
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    isValidConnection,
    commit,
    undo,
    redo,
    // `historyVersion` is what makes these re-read after a commit; the journal
    // itself is a stable object, so nothing else would tell React to look.
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- historyVersion is the deliberate invalidation key
    canUndo: useMemo(() => history.canUndo(), [history, historyVersion]),
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- historyVersion is the deliberate invalidation key
    canRedo: useMemo(() => history.canRedo(), [history, historyVersion]),
    relayout,
    layoutRunner,
    lastLayoutMs,
    layoutPending,
  };
};

/** Applying a command without a controller — the model half, for a consumer. */
export const applyGraphCommand = <N extends NodeKindDefs, E extends EdgeKindDefs>(
  document: GraphDocument<N, E>,
  command: GraphCommand<N, E>,
): GraphDocument<N, E> => applyCommand(document, command);
