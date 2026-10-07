/**
 * Native barrel.
 *
 * Deliberately NOT a mirror of `index.ts`. What a native consumer gets is the
 * host, the fallback and the bridge types — the canvas itself lives inside the
 * WebView and exporting it here would let a consumer mount React Flow on the
 * Hermes side, where it cannot run.
 *
 * The model half stays on its own condition
 * (`@repo/node-graph/model`) on both platforms, so a screen that
 * only needs the document shape does not pull in a WebView.
 *
 * Only `.native.*` twins exist in this package — never a `.web.*` twin (MPO-192).
 */

export { NodeGraph } from './NodeGraph.native';
export type { NodeGraphProps } from './NodeGraph.native';
export { demoControlSchemaId, demoGraphSchemaId } from './react-flow/fixtures';
export { NodeGraphNative, readyTimeoutMs } from './native/NodeGraph.native';
export type { NodeGraphNativeProps } from './native/NodeGraph.native';
export { GraphFallback, graphFallbackDetail } from './native/GraphFallback.native';
/**
 * The toolbar is plain Tamagui and lives on the Hermes side, above the WebView
 * (design §7.3, §7.6). `useLassoSelect` is deliberately NOT here: it imports
 * `SelectionMode` from the `@xyflow` boundary, and dragging React Flow onto
 * Hermes to read one enum is exactly what this barrel exists to prevent. The
 * mode itself is a string a shell can hold in `useState` and send across the
 * bridge; only its TYPE crosses, and a type is erased.
 */
export { GraphToolbar } from './native/GraphToolbar';
export type { GraphToolbarProps } from './native/GraphToolbar';
export type { GraphInteractionMode } from './interaction/useLassoSelect';
/**
 * The imperative handle a native SIBLING drives the canvas with (design §9.1).
 *
 * This is the milestone-6 surface: `NodeGraph` on native drops children, so a
 * toolbar, a Tidy button and a perf readout reach the canvas through these
 * eleven commands and read state back off the wire. Exported here because a
 * consumer needs the TYPE to declare its ref.
 */
export { graphCommandNames } from './react-flow/graphHandle';
export type { GraphCommands, GraphCommandSlot, NodeGraphHandle } from './react-flow/graphHandle';
export { graphChildrenWarning, resetGraphChildrenWarning, warnOnGraphChildren } from './native/graphChildren';
export { DomOnlyStory, hasDomRealm } from './native/DomOnlyStory';
export type { DomOnlyStoryProps } from './native/DomOnlyStory';

export type { GraphFallbackProps, GraphFallbackReason } from './native/GraphFallback.native';

/**
 * The DOM entry is NOT re-exported here.
 *
 * Design §9.3: the entry is app-owned, and this barrel is imported by native
 * code. Re-exporting the package's own `'use dom'` module would put a second
 * DOM bundle into every app that touches the barrel — one nothing renders,
 * because `NodeGraphNative` refuses to mount an entry that has no config. It
 * stays reachable at `@repo/node-graph/dom` for anyone who wants
 * to read the reference implementation.
 *
 * `NodeGraphDomShell` is absent for a sharper reason: its module body stamps
 * `__mp_graph_boot` at evaluation, and evaluating it on the Hermes side would
 * write a boot record for a WebView that does not exist. It lives at
 * `@repo/node-graph/dom-inner`, which only a `'use dom'` file ever
 * imports. Only its TYPES cross to native.
 */
export type {
  NodeGraphDomHandle,
  NodeGraphDomOptions,
  NodeGraphDomProps,
  NodeGraphDomRealmProps,
  NodeGraphDomShellProps,
} from './dom/NodeGraphDomShell';

export { clearNodeGraphDomEntry, getNodeGraphDomEntry, setNodeGraphDomEntry } from './native/domEntryRegistry';
export type { NodeGraphDomEntry } from './native/domEntryRegistry';

export {
  bootStageIndex,
  bootStages,
  graphReadySettleMs,
  readBootElapsedMs,
  readBootRecord,
  readBootStage,
  resetBoot,
  stampBootStage,
} from './dom/boot';
export type { BootRecord, BootStage } from './dom/boot';

/**
 * The `ready` payload as design 9.5's record, and the panel that renders it.
 *
 * Both are on the NATIVE barrel because native is where they are needed: the
 * canvas is inside a WebView, so `onReady` is the only way its diagnostics
 * reach a screen. `LiveGraphDiagnostics` is the story-shaped version of that.
 */
export { GraphBootFailure, GraphDiagnostics } from './diagnostics/GraphDiagnostics';
export type { GraphDiagnosticsProps } from './diagnostics/GraphDiagnostics';
export { graphDiagnosticsFromWire } from './diagnostics/fromWire';
export type {
  GraphDiagnostics as GraphDiagnosticsRecord,
  GraphFaceDelivery,
  GraphRenderer,
  LayoutRunnerKind,
} from './diagnostics/types';

export {
  createGraphEventEmitter,
  createRevEchoGate,
  decodeGraphEvent,
  encodeGraphEvent,
  graphEventEmission,
  graphEventKinds,
  isBenignCanvasError,
  isGraphEventKind,
} from './dom/wire';
export type {
  FaceProbeWire,
  FontFaceWire,
  GraphDiagnosticsWire,
  GraphFaceDeliveryWire,
  GraphErrorPhase,
  GraphEventEmitter,
  GraphEventKind,
  GraphEventThrottle,
  GraphEventWire,
  LassoPhaseWire,
  PerfReportWire,
  RevEchoGate,
} from './dom/wire';

export { KnobEnvelopeProvider } from './knobs/KnobEnvelopeProvider';
export { resolveEnvelopeThemeName } from './knobs/KnobEnvelopeProvider';
export { knobEnvelopeIdentity, knobEnvelopeSchemaVersion, knobsForEnvelope } from './knobs/envelope';
export type { GraphFontRef, KnobEnvelope } from './knobs/envelope';
export { useKnobEnvelope } from './knobs/useKnobEnvelope';
export type { UseKnobEnvelopeOptions } from './knobs/useKnobEnvelope';
