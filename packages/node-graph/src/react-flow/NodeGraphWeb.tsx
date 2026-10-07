/**
 * The web canvas: `GraphVars` + `KnobEnvelopeProvider` + `ReactFlow`, in that
 * order, under one root that carries the package's scope class.
 *
 * The order is the whole composition:
 *
 *  1. `GraphVars` writes the `--xy-*` / `--mpo-graph-*` layer onto the root, so
 *     React Flow's OWN stylesheet paints from mpo tokens instead of its
 *     defaults. Nothing else in the package touches a `.react-flow__` selector
 *     (`checkGraphVarsCoverage` in public/config/lint.mjs fails the build if it
 *     does, outside `css/graph.css`).
 *  2. `KnobEnvelopeProvider` rebuilds the Preset / Surface / Intent stack from
 *     the envelope. On web that is the degenerate case — the host stack is
 *     already above us — and it is HERE anyway, because milestone 2's WebView
 *     entry must run the same code path. One path, not two that drift.
 *  3. `ReactFlow` with exactly two registrations: one node type and one edge
 *     type, both switching on the model kind internally.
 *
 * Two stylesheets are imported. `@xyflow/react/dist/style.css` is required and
 * is NOT restated by this package — `css/graph.css` deliberately carries only
 * the handle `position: absolute` the 44pt region needs, not the edge
 * placement rules. Importing it here means a consumer cannot forget.
 */

import '@xyflow/react/dist/style.css';
import '../../css/graph.css';

import { isTouchSurface, useResolvedKnobs } from '@repo/theme';
import type { Knobs } from '@repo/theme';
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode, Ref } from 'react';

import type { GraphEventWire } from '../dom/wire';
import { graphEdgeTypes } from '../edges/GraphEdge';
import type { SnapGuide } from '../interaction/snapAlignment';
import { applySnapToChanges, createSnapSession, snapContextOptions } from '../interaction/snapChanges';
import type { GraphSnappingOptions } from '../interaction/snapChanges';
import { useLassoSelect } from '../interaction/useLassoSelect';
import type { GraphInteractionMode, LassoLongPressOptions } from '../interaction/useLassoSelect';
import { KnobEnvelopeProvider } from '../knobs/KnobEnvelopeProvider';
import { useKnobEnvelope } from '../knobs/useKnobEnvelope';
import type {
  ConnectionVerdict,
  EdgeKindDefs,
  GraphCommand,
  GraphDocument,
  GraphSchema,
  NodeId,
  NodeKindDefs,
  NodeRect,
  Viewport,
} from '../model/index';
import { portConnectionRadius } from '../nodes/handleGeometry';
import { defaultOverviewZoom } from '../nodes/lod';
import type { GraphNodeSizeKnob } from '../nodes/nodeMeasure';
import { GraphVars, graphRootClassName } from '../theme/GraphVarsStyle';

import { ConnectionPuck } from './ConnectionPuck';
import { GraphActionsProvider } from './GraphActions';
import type { GraphActions } from './GraphActions';
import { GraphCommandBridge } from './GraphCommandBridge';
import type { GraphCommandSlot, GraphCommands, NodeGraphHandle } from './graphHandle';
import { GraphHostProvider, GraphNodeHost } from './GraphNodeHost';
import { GraphPaintProbe } from './GraphPaintProbe';
import { GraphZoomVar } from './GraphZoomVar';
import { LassoOverlay } from './LassoOverlay';
import { SnapGuides } from './SnapGuides';
import { defaultGraphNodeType, useGraphController } from './useGraphController';
import { ReactFlow, ReactFlowProvider, useReactFlow, useStore } from './xy';
import type { NodeChange, NodeTypes } from './xy';

/**
 * The canvas decisions this package makes, spelled once so they can be read
 * and asserted without mounting anything.
 *
 * `onlyRenderVisibleElements` is true, against React Flow's own `false`. It is
 * measured: node drag 25.71 ms → 10.58 ms at 200 nodes / 4× throttle (design
 * §5). It costs nothing at small graphs and is the single largest win at large
 * ones, so the default is the measured one and a consumer opts OUT.
 */
export const graphCanvasDefaults = {
  onlyRenderVisibleElements: true,
  fitView: true,
  /** Below this zoom a node draws in `overview` mode. Design §5. */
  overviewZoom: defaultOverviewZoom,
  /**
   * React Flow's own default is **0.5**, which is ABOVE `overviewZoom`.
   *
   * Measured in Chrome on `NodeGraph/Overview` at 500 nodes: the zoom-out
   * control bottomed out at 0.5, `fitView` clamped there and showed 50 of the
   * 500 nodes, and the overview mode this milestone builds was unreachable —
   * not broken, unreachable, which is worse, because every unit spec around it
   * was green. A level of detail below a floor the user cannot cross is dead
   * code with a passing test suite.
   *
   * `graphCanvasDefaults.minZoom < graphCanvasDefaults.overviewZoom` is
   * asserted in `lod.spec.tsx`, so the two cannot drift back into that state.
   */
  minZoom: 0.05,
  maxZoom: 2,
} as const;

/**
 * Re-fit once React Flow has MEASURED the nodes, not just seeded them.
 *
 * Measured in Chrome on `Main`: the seed (design §5) makes React Flow consider
 * every node initialized on the first frame, so its own `fitView` runs against
 * the SEEDED box — 72 px tall — and never runs again. The observer then reports
 * the real 147 px and the bottom row hangs out of the pane. Seeding and
 * fitting are both right; what was missing is that fitting has to happen after
 * the correction, once.
 *
 * Not asserted in a spec: happy-dom measures nothing, so `measured` never turns
 * true there and the effect can only be exercised in a browser. It is what the
 * browser found, and it is checked there.
 */
function FitOnFirstMeasure({ enabled }: { enabled: boolean }) {
  const { fitView } = useReactFlow();
  const allMeasured = useStore((state) => {
    let total = 0;
    let measured = 0;
    for (const node of state.nodeLookup.values()) {
      total += 1;
      if (node.measured?.height) {
        measured += 1;
      }
    }
    return total > 0 && total === measured;
  });
  const fitted = useRef(false);
  useEffect(() => {
    if (!enabled || fitted.current || !allMeasured) {
      return;
    }
    fitted.current = true;
    void fitView();
  }, [enabled, allMeasured, fitView]);
  return null;
}

export interface NodeGraphWebProps<N extends NodeKindDefs, E extends EdgeKindDefs> {
  readonly schema: GraphSchema<N, E>;
  /** Controlled. */
  readonly document?: GraphDocument<N, E>;
  /** Uncontrolled seed. */
  readonly defaultDocument?: GraphDocument<N, E>;
  readonly onDocumentChange?: (document: GraphDocument<N, E>, command: GraphCommand<N, E>) => void;
  readonly onConnectionRefused?: (verdict: ConnectionVerdict) => void;
  readonly readOnly?: boolean;
  /** Merged on top of the whole Preset chain, and carried across the bridge. */
  readonly knobs?: Partial<Knobs>;
  /** The name the host mounted `<Preset preset=…>` with. See `KnobEnvelope.presetName`. */
  readonly presetName?: string;
  readonly intent?: string | null;
  /**
   * Touch surface: widens the port pitch, raises the handle hit region to the
   * 44 px press floor, and makes fields display-only.
   *
   * Defaults to `isTouchSurface()` (design 7.1 H3). It used to default to
   * `false`, which meant a canvas mounted inside the WebView with nobody
   * passing the prop painted 24 px targets and set `--mpo-graph-handle-hit`
   * to 24 — the press floor missed by twenty pixels, silently, on the one
   * surface the floor is for.
   */
  readonly coarsePointer?: boolean;
  /**
   * `pan` (the default) is React Flow's ordinary canvas. `select` swaps the
   * one-finger pan for a marquee by setting `panOnDrag={false}`, which is the
   * only value that opens the touch guard at `Pane/index.tsx:146` — design
   * §7.3, and `lassoFlowProps` carries the reasoning.
   *
   * Controlled on purpose: the toolbar that flips it lives in the native shell
   * (`GraphToolbar`), outside the WebView, so the canvas is told the mode
   * rather than owning it.
   */
  readonly interactionMode?: GraphInteractionMode;
  readonly onlyRenderVisibleElements?: boolean;
  readonly fitView?: boolean;
  readonly overviewZoom?: number;
  /**
   * Alignment snapping and the optional grid, design §7.2. Alignment is on;
   * pass `{ alignment: false }` to turn the whole thing off, or a `grid` in
   * flow units to compose one with it.
   */
  readonly snapping?: GraphSnappingOptions;
  /**
   * Defaults to 0.05, well under `overviewZoom`. React Flow's own 0.5 sits
   * ABOVE it, which makes overview mode unreachable — see
   * `graphCanvasDefaults.minZoom`. Raising this above `overviewZoom` turns the
   * level of detail off, and that is the consumer's call to make explicitly.
   */
  readonly minZoom?: number;
  readonly maxZoom?: number;
  /** Extra node types a consumer registers alongside the built-in one. */
  readonly nodeTypes?: NodeTypes;
  readonly className?: string;
  readonly style?: CSSProperties;
  /**
   * The one overlay that says what a connection drag is currently over
   * (design §7.4). On by default: it exists only while a drag is in progress,
   * and on a phone the finger occludes the port it is aiming at, which the
   * native spike named the hardest touch item verbatim.
   */
  readonly connectionPuck?: boolean;
  /** Names a node for the puck. Defaults to the node id. */
  readonly nodeLabel?: (nodeId: string) => string | undefined;
  /**
   * The long press, design §7.3, INSIDE the canvas.
   *
   * It used to be a hook a consumer called and wired to a DOM ref of its own
   * (`NodeGraph/Lasso` → `LongPress` did exactly that). On native that story
   * could not mount at all — `View config getter callback for component 'div'
   * must be a function` — because the ref hung off the React Native host tree
   * while the pane it must intercept lives in the WebView's realm, which a
   * host-side ref can never reach.
   *
   * So the gesture moved in here, where the pane exists on both platforms, and
   * a native consumer arms it with a serializable option instead of a hook.
   * Off by default: design §7.3 L7 says nothing changes on a fine pointer.
   */
  readonly longPressLasso?: boolean;
  /**
   * The single channel, on web.
   *
   * Design §9.1's `onEvent`, unwrapped: on native the same union crosses the
   * bridge as JSON, and on web it is handed straight to the caller. One prop
   * rather than six callbacks, for the reason the bridge has one channel —
   * adding an event is then a change to a type and to nothing else.
   */
  readonly onGraphEvent?: (event: GraphEventWire) => void;
  /**
   * The imperative handle, design §9.1.
   *
   * The same eleven commands the native shell forwards across the bridge, so a
   * toolbar written as a sibling drives the canvas identically on both
   * platforms. That is milestone 6's whole rule: a native consumer cannot put
   * children inside the canvas, so the handle is the surface, and a handle that
   * existed only on native would be a surface the web story could not rehearse.
   */
  readonly graphRef?: Ref<NodeGraphHandle>;
  /**
   * The DOM shell's own slot, threaded down so `useDOMImperativeHandle` can
   * forward into it. Consumers use `graphRef`; this is the bridge's door and it
   * is documented so nobody mistakes it for one.
   */
  readonly commandSlot?: GraphCommandSlot;
  /**
   * Which realm this canvas is painting in. Recorded on every perf report, so a
   * device run and a desktop run are distinguishable in the data rather than in
   * someone's memory.
   */
  readonly renderer?: 'react-flow-web' | 'react-flow-dom';
  /**
   * Milliseconds from the DOM bundle's first line to now, when there is a boot
   * record to read. Rides the `paint` event, which is what the native watchdog
   * is measured against (design §9.4). Web has no boot record and passes none.
   */
  readonly readBootMs?: () => number | null;
  /** The DOM realm stamps its boot stage here. Web passes nothing. */
  readonly onCanvasMounted?: () => void;
  /** `Background`, `Controls`, `MiniMap` — React Flow children. */
  readonly children?: ReactNode;
}

function NodeGraphCanvas<N extends NodeKindDefs, E extends EdgeKindDefs>(props: NodeGraphWebProps<N, E>) {
  const {
    schema,
    document,
    defaultDocument,
    onDocumentChange,
    onConnectionRefused,
    readOnly = false,
    knobs,
    presetName,
    intent,
    coarsePointer = isTouchSurface(),
    interactionMode = 'pan',
    onlyRenderVisibleElements = graphCanvasDefaults.onlyRenderVisibleElements,
    fitView = graphCanvasDefaults.fitView,
    overviewZoom = graphCanvasDefaults.overviewZoom,
    snapping,
    minZoom = graphCanvasDefaults.minZoom,
    maxZoom = graphCanvasDefaults.maxZoom,
    nodeTypes,
    connectionPuck = true,
    longPressLasso = false,
    nodeLabel,
    className,
    style,
    children,
  } = props;

  /**
   * The canvas root element, needed by three things that all have to agree on
   * WHICH canvas they mean: the zoom variable H7 reads, the frame sampler's
   * transform probe, and the long press's hunt for `.react-flow__pane`. Two
   * canvases on one page is exactly the `NodeGraph/Perf200` layout, so scoping
   * them to a root is not hypothetical tidiness.
   */
  const rootRef = useRef<HTMLDivElement | null>(null);

  /**
   * The one channel. A stable identity even when the caller passes an inline
   * arrow, because the command bridge builds its handle once and a changing
   * `emit` would rebuild it mid-gesture.
   */
  const graphEventRef = useRef(props.onGraphEvent);
  graphEventRef.current = props.onGraphEvent;
  const emit = useCallback((event: GraphEventWire) => graphEventRef.current?.(event), []);

  const perfHost = props.renderer ?? 'react-flow-web';
  const readBootMsRef = useRef(props.readBootMs);
  readBootMsRef.current = props.readBootMs;
  /**
   * The frame after React Flow's first render. It is what the native watchdog
   * times against, because `ready` waits `graphReadySettleMs` for its own
   * diagnostics to fill in and therefore cannot be the thing a liveness check
   * measures — on emulator-5592 the 12 s budget fired on a canvas that was
   * already on screen.
   */
  const onPaint = useCallback(() => emit({ t: 'paint', bootMs: readBootMsRef.current?.() ?? null }), [emit]);

  // The canvas CHROME's knobs. A node's own paint comes from its body's
  // `useResolvedKnobs`, not from here; this is the `size` the measure seed
  // reads and the pointer class the var layer needs.
  const { knobProps } = useResolvedKnobs();
  const size = knobProps.size as GraphNodeSizeKnob;

  const envelope = useKnobEnvelope({
    knobs,
    presetName,
    intent: intent ?? undefined,
    pointer: coarsePointer ? 'coarse' : 'fine',
  });

  /**
   * H5. The magnetic drop radius is the hit DIAMETER, not React Flow's 20 px
   * default, so what snaps a connection is the same circle the user can see
   * and press. 20 px under a 44 px target means a drop that looks on the port
   * and refuses; 44 under a 24 px target means one that looks off it and takes.
   */
  const connectionRadius = portConnectionRadius({ size, coarsePointer });

  const reactFlowApi = useReactFlow();
  /**
   * The boxes React Flow's ResizeObserver has actually reported, read on
   * demand. See `GraphLayoutOptions.measured`: laying a graph out on the seed
   * puts ranks 18 flow units apart where `rankSpacing` asked for 90, because
   * the demo kinds seed 72 px and paint 144-192.
   */
  const readMeasuredSizes = useCallback(() => {
    const sizes: Record<string, { width: number; height: number }> = {};
    for (const node of reactFlowApi.getNodes()) {
      const width = node.measured?.width;
      const height = node.measured?.height;
      if (width && height) {
        sizes[node.id] = { width, height };
      }
    }
    return sizes;
  }, [reactFlowApi]);

  const controller = useGraphController<N, E>({
    schema,
    document,
    defaultDocument,
    onDocumentChange,
    onConnectionRefused,
    readOnly,
    size,
    coarsePointer,
    readMeasuredSizes,
  });

  const setNodeData = useCallback(
    (id: string, patch: Record<string, unknown>) => {
      const node = controller.document.nodes.find((candidate) => candidate.id === id);
      if (!node) {
        return;
      }
      controller.commit({
        t: 'setNodeData',
        id,
        data: { ...(node.data as Record<string, unknown>), ...patch },
      } as GraphCommand<N, E>);
    },
    [controller],
  );

  const host = useMemo(
    () => ({
      schema: schema as unknown as GraphSchema<NodeKindDefs, EdgeKindDefs>,
      overviewZoom,
      coarsePointer,
      readOnly,
      setNodeData,
    }),
    [schema, overviewZoom, coarsePointer, readOnly, setNodeData],
  );

  // Snapping sits BETWEEN React Flow and the controller: it rewrites the live
  // drag frames, and the controller still sees one `dragging: false` change and
  // commits once (design §4.5). The session is a ref, not state — it is the
  // drag's memory (S3) and re-rendering on it would rebuild the index it exists
  // to keep.
  const snapSession = useRef(createSnapSession());
  const [guides, setGuides] = useState<readonly SnapGuide[]>([]);
  const snapOptions = snapContextOptions({
    snapping,
    animation: envelope.knobs.animation as string | undefined,
    reducedMotion: envelope.prefersReducedMotion,
    coarsePointer,
  });
  const { alignment: snapAlignmentOn, grid: snapGrid, thresholdScreenPx } = snapOptions;
  const reactFlow = reactFlowApi;
  const controllerNodesRef = useRef(controller.nodes);
  controllerNodesRef.current = controller.nodes;
  const controllerChangeRef = useRef(controller.onNodesChange);
  controllerChangeRef.current = controller.onNodesChange;

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const snapped = applySnapToChanges(changes, {
        nodes: controllerNodesRef.current,
        zoom: reactFlow.getZoom(),
        session: snapSession.current,
        alignment: snapAlignmentOn,
        grid: snapGrid,
        thresholdScreenPx,
      });
      // Same reference when nothing fired, so an ordinary pan does not
      // re-render the guide layer 120 times a second.
      setGuides((previous) => (previous.length === 0 && snapped.guides.length === 0 ? previous : snapped.guides));
      controllerChangeRef.current(snapped.changes as NodeChange[]);
    },
    [reactFlow, snapAlignmentOn, snapGrid, thresholdScreenPx],
  );

  /**
   * The long press, design §7.3 L1-L7, mounted where the pane is.
   *
   * `useLassoSelect` is called with `mode` CONTROLLED, so it never changes the
   * toolbar's mode itself — the toolbar is a sibling and owns that. What this
   * call is for is `effectiveMode` and `marquee`: while armed the canvas must
   * take `panOnDrag={false}` whatever the toolbar says, or the interceptor
   * stops the gesture already running and the NEXT one pans anyway.
   */
  const longPress = useMemo<LassoLongPressOptions>(
    () => ({
      rootRef,
      enabled: longPressLasso,
      viewport: {
        get: (): Viewport => reactFlowApi.getViewport(),
        set: (viewport: Viewport) => {
          void reactFlowApi.setViewport(viewport, { duration: 0 });
        },
      },
      getNodeRects: (): readonly NodeRect[] =>
        reactFlowApi.getNodes().map((node) => ({
          id: node.id,
          rect: {
            x: node.position.x,
            y: node.position.y,
            width: node.measured?.width ?? node.width ?? 0,
            height: node.measured?.height ?? node.height ?? 0,
          },
        })),
      onSelect: (ids: readonly NodeId[]) => {
        const wanted = new Set<string>(ids);
        reactFlowApi.setNodes((nodes) => nodes.map((node) => ({ ...node, selected: wanted.has(node.id) })));
        emit({ t: 'lasso', phase: 'select', ids, haptic: null });
        // The ordinary selection event too, so a consumer that only cares WHAT
        // is selected does not have to know a lasso happened.
        emit({ t: 'selection', ids });
      },
      // A WebView cannot buzz. The shell can, so the canvas asks — a HINT, not
      // a command: whether a buzz is appropriate is the shell's call.
      onHaptic: () => emit({ t: 'lasso', phase: 'arm', ids: [], haptic: 'selection' }),
      onCancel: () => emit({ t: 'lasso', phase: 'cancel', ids: [], haptic: null }),
    }),
    [emit, longPressLasso, reactFlowApi],
  );

  const lasso = useLassoSelect({ mode: interactionMode, longPress });

  /**
   * The imperative handle, filled by `GraphCommandBridge` below.
   *
   * `commandSlot` is the DOM shell's own ref when the canvas is inside a
   * WebView, and this local one on web. One slot either way, so the eleven
   * commands have exactly one implementation.
   */
  const ownSlot = useRef<GraphCommands | null>(null);
  const slot = props.commandSlot ?? ownSlot;

  /**
   * A stable forwarder, not the slot itself: the slot is null until React Flow
   * mounts, and a `graphRef` that handed out null would make a sibling toolbar
   * fail on the first press after every remount.
   */
  const handle = useMemo<NodeGraphHandle>(
    () => ({
      fitView: () => slot.current?.fitView(),
      relayout: () => slot.current?.relayout(),
      zoomTo: (zoom) => slot.current?.zoomTo(zoom),
      centerOn: (nodeId) => slot.current?.centerOn(nodeId),
      setSelection: (ids) => slot.current?.setSelection(ids),
      exportViewport: () => slot.current?.exportViewport(),
      undo: () => slot.current?.undo(),
      redo: () => slot.current?.redo(),
      perfStart: (label) => slot.current?.perfStart(label),
      perfStop: (label) => slot.current?.perfStop(label),
      perfMark: (label) => slot.current?.perfMark(label),
      setViewport: (x, y, zoom) => slot.current?.setViewport(x, y, zoom),
      synthPinch: (scale, steps) => slot.current?.synthPinch(scale, steps),
    }),
    [slot],
  );
  useImperativeHandle(props.graphRef, () => handle, [handle]);

  const types = useMemo<NodeTypes>(() => ({ [defaultGraphNodeType]: GraphNodeHost, ...nodeTypes }), [nodeTypes]);

  // Published to `children`, which mount BELOW the controller. A Tidy or Undo
  // button has no other way to reach it — see `GraphActions.tsx`.
  const actions = useMemo<GraphActions>(
    () => ({
      relayout: controller.relayout,
      undo: controller.undo,
      redo: controller.redo,
      canUndo: controller.canUndo,
      canRedo: controller.canRedo,
      layoutRunner: controller.layoutRunner,
      lastLayoutMs: controller.lastLayoutMs,
      layoutPending: controller.layoutPending,
      nodeCount: controller.document.nodes.length,
    }),
    [
      controller.relayout,
      controller.undo,
      controller.redo,
      controller.canUndo,
      controller.canRedo,
      controller.layoutRunner,
      controller.lastLayoutMs,
      controller.layoutPending,
      controller.document.nodes.length,
    ],
  );

  return (
    <div
      ref={rootRef}
      className={className ? `${graphRootClassName} ${className}` : graphRootClassName}
      data-graph-scheme={envelope.scheme}
      style={{ width: '100%', height: '100%', ...style }}>
      <GraphVars
        vars={envelope.vars}
        scheme={envelope.scheme}
        revision={envelope.revision}
      />
      <KnobEnvelopeProvider envelope={envelope}>
        <GraphActionsProvider value={actions}>
          <GraphHostProvider value={host}>
            <ReactFlow
              nodes={controller.nodes}
              edges={controller.edges}
              nodeTypes={types}
              edgeTypes={graphEdgeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={controller.onEdgesChange}
              onConnect={controller.onConnect}
              isValidConnection={controller.isValidConnection}
              connectionRadius={connectionRadius}
              onlyRenderVisibleElements={onlyRenderVisibleElements}
              fitView={fitView}
              minZoom={minZoom}
              maxZoom={maxZoom}
              {...lasso.flowProps}
              // The scheme the envelope resolved, so the canvas chrome and the
              // Tamagui bodies inside it cannot disagree about which theme is on.
              colorMode={envelope.scheme}
              nodesDraggable={!readOnly}
              nodesConnectable={!readOnly}
              elementsSelectable
              proOptions={{ hideAttribution: true }}>
              <FitOnFirstMeasure enabled={fitView} />
              <GraphZoomVar rootRef={rootRef} />
              <GraphPaintProbe onPaint={onPaint} />
              <GraphCommandBridge
                commands={slot}
                culling={onlyRenderVisibleElements}
                emit={emit}
                host={perfHost}
                rootRef={rootRef}
                onMounted={props.onCanvasMounted}
              />
              <SnapGuides
                guides={guides}
                animated={snapOptions.animateGuides}
              />
              {/* INSIDE the canvas, so the `--xy-selection-*` layer is in scope.
                  Outside it the rectangle is the right size and invisible. */}
              <LassoOverlay rect={lasso.marquee} />
              {connectionPuck ? (
                <ConnectionPuck
                  document={controller.document}
                  schema={schema}
                  nodeLabel={nodeLabel}
                />
              ) : null}
              {children}
            </ReactFlow>
          </GraphHostProvider>
        </GraphActionsProvider>
      </KnobEnvelopeProvider>
    </div>
  );
}

/**
 * `ReactFlowProvider` is mounted by the package, not asked of the consumer.
 *
 * `GraphNodeHost` reads the store for the live zoom and `GraphNode` calls
 * `useUpdateNodeInternals`; both throw outside a provider. Making the consumer
 * remember it is a failure mode with a confusing message.
 */
export function NodeGraphWeb<N extends NodeKindDefs, E extends EdgeKindDefs>(props: NodeGraphWebProps<N, E>) {
  return (
    <ReactFlowProvider>
      <NodeGraphCanvas {...props} />
    </ReactFlowProvider>
  );
}
