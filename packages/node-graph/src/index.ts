/**
 * Web barrel.
 *
 * The model half is NOT re-exported here. It has its own condition
 * (`@repo/node-graph/model`) so a server, a CLI or the CI bench can
 * import it without React or `@xyflow` — re-exporting it from
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
export { defaultGraphNodeType, useGraphController } from './react-flow/use-graph-controller';
export type {
  GraphController,
  GraphRelayoutOptions,
  UseGraphControllerOptions,
} from './react-flow/use-graph-controller';
export { GraphActionsProvider, useGraphActions } from './react-flow/GraphActions';
/**
 * The imperative handle (design §9.1), on the WEB barrel as well as the native
 * one. Milestone 6: a control is either a sibling on this handle or a
 * serializable option, and a web story that could not rehearse the native shape
 * would be a story that proves nothing about the phone.
 */
export { graphCommandNames } from './react-flow/graph-handle';
export type { GraphCommands, GraphCommandSlot, NodeGraphHandle } from './react-flow/graph-handle';
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
export type { GraphFlowNodeData } from './react-flow/flow-adapter';
export { toFlowEdges, toFlowNodes } from './react-flow/flow-adapter';
export { GraphNodeHost, useGraphHost } from './react-flow/GraphNodeHost';
export { ConnectionPuck, connectionPuckLabel } from './react-flow/ConnectionPuck';
export type { ConnectionPuckLabel, ConnectionPuckProps } from './react-flow/ConnectionPuck';
export { filterLegalCandidates, isLegalTarget, legalTargets } from './interaction/legal-targets';
export type { LegalTargetQuery } from './interaction/legal-targets';
export { mountedNodeCount, registerMountedNode, resetNodeCensus, subscribeNodeCensus } from './react-flow/node-census';
export { demoControlSchemaId, demoGraphSchemaId } from './react-flow/fixtures';
export type { GraphHostValue } from './react-flow/GraphNodeHost';

export { GraphEdge, graphEdgeType, graphEdgeTypes } from './edges/GraphEdge';
export type { GraphEdgeData } from './edges/GraphEdge';
export { builtinEdgeKindNames, builtinEdgeKinds } from './edges/edge-kinds';
export type { BuiltinEdgeData, BuiltinEdgeKind } from './edges/edge-kinds';
export {
  dashAnimation,
  edgeAppearances,
  edgeMarkerEnd,
  edgeStrokeWidth,
  edgeStrokeWidths,
  resolveEdgeStyle,
} from './edges/edge-style';
export type { EdgeAppearance, EdgeMarker, EdgePathKind, EdgeStyle } from './edges/edge-style';

export { GraphBootFailure, GraphDiagnostics } from './diagnostics/GraphDiagnostics';
export { graphDiagnosticsFromWire } from './diagnostics/from-wire';
export type { GraphDiagnosticsProps } from './diagnostics/GraphDiagnostics';
export { useGraphDiagnostics } from './diagnostics/use-graph-diagnostics';
export { graphErrorGlobalKey, readGraphError, recordGraphError, resetGraphError } from './diagnostics/last-error';
export type { GraphErrorRecord } from './diagnostics/last-error';
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
export { useKnobEnvelope } from './knobs/use-knob-envelope';
export type { UseKnobEnvelopeOptions } from './knobs/use-knob-envelope';
export { useGraphNodeKnobs } from './knobs/graph-knobs';
export type { GraphNodeKnobs, UseGraphNodeKnobsOptions } from './knobs/graph-knobs';

export { lassoFlowProps, lassoHoldMs, lassoSlopPx, useLassoSelect } from './interaction/use-lasso-select';
export type {
  GraphInteractionMode,
  LassoFlowProps,
  LassoLongPressOptions,
  LassoSelect,
  LassoViewportPort,
  UseLassoSelectOptions,
} from './interaction/use-lasso-select';
export { installLassoIntercept } from './interaction/lasso-intercept';
export type { LassoIntercept, LassoInterceptOptions } from './interaction/lasso-intercept';
export { LassoOverlay } from './react-flow/LassoOverlay';
export type { LassoOverlayProps } from './react-flow/LassoOverlay';
export { GraphToolbar } from './native/GraphToolbar';
export type { GraphToolbarProps } from './native/GraphToolbar';

export { GraphNode } from './nodes/GraphNode';
export type { GraphNodeProps } from './nodes/GraphNode';
export { GraphPort } from './nodes/GraphPort';
export { defaultOverviewZoom, detailOpacity, isOverview, lodForZoom } from './nodes/lod';
export type { GraphRenderMode } from './nodes/lod';
export { OverviewNode } from './nodes/overview-node';
export type { OverviewNodeProps } from './nodes/overview-node';
export type { GraphPortProps } from './nodes/GraphPort';
export {
  FINE_PORT_HIT_MIN,
  paintedPortSize,
  paintedPortSizePx,
  portConnectionRadius,
  portGeometry,
  portHitSize,
  portRegionInset,
} from './nodes/handle-geometry';
export type { PortGeometry, PortRect } from './nodes/handle-geometry';
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
} from './nodes/node-measure';
export type {
  GraphNodeMeasure,
  GraphNodePort,
  GraphNodeRadiusKnob,
  GraphNodeSizeKnob,
  GraphNodeSpaceKnob,
  GraphPortSide,
} from './nodes/node-measure';

export { GraphVars, graphRootClassName, graphVarsSheet, useGraphCssVars } from './theme/GraphVarsStyle';
export type { GraphVarsProps } from './theme/GraphVarsStyle';
export { graphCssVars } from './theme/graph-vars';
export type { GraphCssVarsOptions, GraphThemeAccess } from './theme/graph-vars';

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
export { clearNodeGraphDomEntry, getNodeGraphDomEntry, setNodeGraphDomEntry } from './native/dom-entry-registry';
export type { NodeGraphDomEntry } from './native/dom-entry-registry';

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
export { cloneStructured, ensureStructuredClone } from './layout/structured-clone-shim';
export { layoutWorkerBytes, layoutWorkerSha256 } from './layout/worker.generated';
