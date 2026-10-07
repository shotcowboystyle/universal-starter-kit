/**
 * Web barrel.
 *
 * The model half is NOT re-exported here. It has its own condition
 * (`@repo/node-graph/model`) so a server, a CLI, a Frappe hook or
 * the CI bench can import it without React or `@xyflow` — re-exporting it from
 * this file would defeat that by making one import pull the whole editor.
 *
 * `css/graph.css` is imported by `NodeGraphWeb`, so a consumer of `NodeGraph`
 * gets it automatically. A consumer who mounts `ReactFlow` themselves imports
 * `@repo/node-graph/css/graph.css`.
 */

export { NodeGraph } from './NodeGraph';
export type { NodeGraphProps } from './NodeGraph';
export { graphCanvasDefaults, NodeGraphWeb } from './react-flow/NodeGraphWeb';
export type { NodeGraphWebProps } from './react-flow/NodeGraphWeb';
export { defaultGraphNodeType, useGraphController } from './react-flow/useGraphController';
export type { GraphController, GraphRelayoutOptions, UseGraphControllerOptions } from './react-flow/useGraphController';
export { GraphActionsProvider, useGraphActions } from './react-flow/GraphActions';
/**
 * The imperative handle (design §9.1), on the WEB barrel as well as the native
 * one. Milestone 6: a control is either a sibling on this handle or a
 * serializable option, and a web story that could not rehearse the native shape
 * would be a story that proves nothing about the phone.
 */
export { graphCommandNames } from './react-flow/graphHandle';
export type { GraphCommands, GraphCommandSlot, NodeGraphHandle } from './react-flow/graphHandle';
export { GraphCommandBridge } from './react-flow/GraphCommandBridge';
export type { GraphCommandBridgeProps } from './react-flow/GraphCommandBridge';
export { GraphPaintProbe } from './react-flow/GraphPaintProbe';
export { GraphZoomVar, graphZoomVarName } from './react-flow/GraphZoomVar';
export { DomOnlyStory, domOnlyStoryDecorator, hasDomRealm } from './native/DomOnlyStory';
export type { DomOnlyStoryProps } from './native/DomOnlyStory';
/**
 * The event union, on the WEB barrel too. `NodeGraphWeb.onGraphEvent` hands it
 * out, so a web consumer needs the type to declare its handler — the same union
 * that crosses the bridge as JSON on native, which is what lets one story file
 * read a runner on both.
 */
export type { GraphEventWire, LassoPhaseWire, PerfReportWire } from './dom/wire';
export type { GraphActions } from './react-flow/GraphActions';
export type { GraphFlowNodeData } from './react-flow/flowAdapter';
export { toFlowEdges, toFlowNodes } from './react-flow/flowAdapter';
export { GraphNodeHost, useGraphHost } from './react-flow/GraphNodeHost';
export { ConnectionPuck, connectionPuckLabel } from './react-flow/ConnectionPuck';
export type { ConnectionPuckLabel, ConnectionPuckProps } from './react-flow/ConnectionPuck';
export { filterLegalCandidates, isLegalTarget, legalTargets } from './interaction/legalTargets';
export type { LegalTargetQuery } from './interaction/legalTargets';
export { mountedNodeCount, registerMountedNode, resetNodeCensus, subscribeNodeCensus } from './react-flow/nodeCensus';
export { demoControlSchemaId, demoGraphSchemaId } from './react-flow/fixtures';
export type { GraphHostValue } from './react-flow/GraphNodeHost';

export { GraphEdge, graphEdgeType, graphEdgeTypes } from './edges/GraphEdge';
export type { GraphEdgeData } from './edges/GraphEdge';
export { builtinEdgeKindNames, builtinEdgeKinds } from './edges/edgeKinds';
export type { BuiltinEdgeData, BuiltinEdgeKind } from './edges/edgeKinds';
export {
  dashAnimation,
  edgeAppearances,
  edgeMarkerEnd,
  edgeStrokeWidth,
  edgeStrokeWidths,
  resolveEdgeStyle,
} from './edges/edgeStyle';
export type { EdgeAppearance, EdgeMarker, EdgePathKind, EdgeStyle } from './edges/edgeStyle';

export { GraphBootFailure, GraphDiagnostics } from './diagnostics/GraphDiagnostics';
export { graphDiagnosticsFromWire } from './diagnostics/fromWire';
export type { GraphDiagnosticsProps } from './diagnostics/GraphDiagnostics';
export { useGraphDiagnostics } from './diagnostics/useGraphDiagnostics';
export { graphErrorGlobalKey, readGraphError, recordGraphError, resetGraphError } from './diagnostics/lastError';
export type { GraphErrorRecord } from './diagnostics/lastError';
export type {
  GraphDiagnostics as GraphDiagnosticsRecord,
  GraphDiagnosticsInput,
  GraphFaceDelivery,
  GraphRenderer,
  LayoutRunnerKind,
} from './diagnostics/types';

export { GraphFaces, useGraphFaces } from './theme/GraphFaces';
export type { GraphFacesProps, GraphFaceSource, GraphFaceStatus } from './theme/GraphFaces';
export {
  corruptFirstFamily,
  faceBytes,
  graphFaceCeilingBytes,
  graphFaceCss,
  graphFaces,
  probeFamily,
  probeRenderedFamily,
  splitFontStack,
} from './theme/faces';
export type { FaceProbe, GraphFaceAsset, GraphFaceCategory, GraphFaceDeclaration } from './theme/faces';
export { generatedGraphFaces } from './theme/faces.generated';

export { KnobEnvelopeProvider } from './knobs/KnobEnvelopeProvider';
export { resolveEnvelopeThemeName } from './knobs/KnobEnvelopeProvider';
export type { KnobEnvelopeProviderProps } from './knobs/KnobEnvelopeProvider';
export { knobEnvelopeIdentity, knobEnvelopeSchemaVersion, knobsForEnvelope } from './knobs/envelope';
export type { GraphFontRef, KnobEnvelope } from './knobs/envelope';
export { useKnobEnvelope } from './knobs/useKnobEnvelope';
export type { UseKnobEnvelopeOptions } from './knobs/useKnobEnvelope';
export { useGraphNodeKnobs } from './knobs/graphKnobs';
export type { GraphNodeKnobs, UseGraphNodeKnobsOptions } from './knobs/graphKnobs';

export { lassoFlowProps, lassoHoldMs, lassoSlopPx, useLassoSelect } from './interaction/useLassoSelect';
export type {
  GraphInteractionMode,
  LassoFlowProps,
  LassoLongPressOptions,
  LassoSelect,
  LassoViewportPort,
  UseLassoSelectOptions,
} from './interaction/useLassoSelect';
export { installLassoIntercept } from './interaction/lassoIntercept';
export type { LassoIntercept, LassoInterceptOptions } from './interaction/lassoIntercept';
export { LassoOverlay } from './react-flow/LassoOverlay';
export type { LassoOverlayProps } from './react-flow/LassoOverlay';
export { GraphToolbar } from './native/GraphToolbar';
export type { GraphToolbarProps } from './native/GraphToolbar';

export { GraphNode } from './nodes/GraphNode';
export type { GraphNodeProps } from './nodes/GraphNode';
export { GraphPort } from './nodes/GraphPort';
export { defaultOverviewZoom, detailOpacity, isOverview, lodForZoom } from './nodes/lod';
export type { GraphRenderMode } from './nodes/lod';
export { OverviewNode } from './nodes/overviewNode';
export type { OverviewNodeProps } from './nodes/overviewNode';
export type { GraphPortProps } from './nodes/GraphPort';
export {
  FINE_PORT_HIT_MIN,
  paintedPortSize,
  paintedPortSizePx,
  portConnectionRadius,
  portGeometry,
  portHitSize,
  portRegionInset,
} from './nodes/handleGeometry';
export type { PortGeometry, PortRect } from './nodes/handleGeometry';
export {
  containerRadiusPx,
  defaultNodeMeasure,
  FINE_PORT_PITCH,
  graphNodeMeasure,
  graphNodeMinHeight,
  graphNodeRadius,
  graphNodeRadiusPx,
  graphNodeWidth,
  nodePanelPaddingPx,
  nodeRadiusTokenPx,
  portSpacing,
  verticalPortCrowd,
} from './nodes/nodeMeasure';
export type {
  GraphNodeMeasure,
  GraphNodePort,
  GraphNodeRadiusKnob,
  GraphNodeSizeKnob,
  GraphNodeSpaceKnob,
  GraphPortSide,
} from './nodes/nodeMeasure';

export { GraphVars, graphRootClassName, graphVarsSheet, useGraphCssVars } from './theme/GraphVarsStyle';
export type { GraphVarsProps } from './theme/GraphVarsStyle';
export { graphCssVars } from './theme/graphVars';
export type { GraphCssVarsOptions, GraphThemeAccess } from './theme/graphVars';

/**
 * The DOM-entry registry, on the WEB barrel too, and that is deliberate.
 *
 * A cross-platform app registers its `'use dom'` entry from one shared module
 * (design §9.3), and a shared module has to resolve on both platforms or the
 * web build fails on a name only the native barrel carries. The registry itself
 * is platform-neutral — a module-level slot and two functions, no React Native
 * import — and on web nothing reads it, because `NodeGraphWeb` mounts React
 * Flow directly and there is no bridge to cross.
 */
export { clearNodeGraphDomEntry, getNodeGraphDomEntry, setNodeGraphDomEntry } from './native/domEntryRegistry';
export type { NodeGraphDomEntry } from './native/domEntryRegistry';

export { layoutWithDagre, defaultLayoutSpacing } from './layout/dagre';
export { buildLayoutRequest, layout, reconcilePositions } from './layout/layout';
export type { GraphLayoutOptions } from './layout/layout';
export {
  createLayoutRunner,
  defaultProbeTimeoutMs,
  getLayoutRunner,
  readLayoutRunnerFallback,
  resetLayoutRunner,
  resolveRunner,
} from './layout/runner';
export type { LayoutRunner, LayoutRunnerFallback, LayoutRunnerOptions } from './layout/runner';
export type {
  LayoutDirection,
  LayoutEdgeInput,
  LayoutEngine,
  LayoutNodeInput,
  LayoutOptions,
  LayoutRequest,
  LayoutResult,
  LayoutWorkerRequest,
  LayoutWorkerResponse,
} from './layout/types';
export { cloneStructured, ensureStructuredClone } from './layout/structuredCloneShim';
export { layoutWorkerBytes, layoutWorkerSha256 } from './layout/worker.generated';
