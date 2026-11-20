/**
 * `NodeGraph` on native — the same NAME and the same PROPS a web consumer
 * writes, resolving to the Expo DOM host instead of the canvas.
 *
 * The split happens HERE, at a `.native.tsx` twin, and never at a `.web.*` one.
 * MPO-192's ruling: a `.web.ts` twin replaces the shared file in One's Vite
 * client build exactly as it does under Metro, which is how the config reader
 * lost `import.meta.env` in the first place.
 *
 * WHY THIS FILE GREW A BODY (MPO-211 task 2.7). It used to forward straight to
 * `NodeGraphNative`, whose props are the BRIDGE's — `documentJson`, `rev`,
 * `envelope`, `schemaId` — because that is what can be JSON. That is the right
 * shape for the host and the wrong shape for a consumer: a story or a screen
 * that writes `<NodeGraph schema={schema} defaultDocument={doc} />` and works on
 * web got a DOM component with `documentJson: undefined` on device, and the
 * watchdog drew the fallback. Found by running it, not by reading it.
 *
 * So the serialization lives here, in the one file whose whole job is to be the
 * same component on both platforms:
 *
 *  - the document is serialized once and re-serialized only when the consumer
 *    hands down a new one;
 *  - `rev` is stamped here, and the canvas's echo gate refuses the document it
 *    caused, so a drag does not fight itself (`wire.ts` holds the gate);
 *  - a commit comes back as commands, is applied to the host's copy with the
 *    package's own `applyCommand`, and is handed to `onDocumentChange` with the
 *    same `(document, command)` signature `NodeGraphWeb` uses;
 *  - the knob envelope is captured from the LIVE native theme by
 *    `useKnobEnvelope`, which is what makes a knob flip in the on-device theme
 *    addon reach nodes rendering inside a WebView.
 *
 * `children` is accepted and ignored. React Flow's `<Background />` and
 * `<Controls />` are components, and a component cannot cross the bridge; the
 * canvas mounts its own chrome from `options`. Accepting them keeps ONE story
 * file for both platforms, which is the point.
 *
 * MILESTONE 6 MAKES THAT CONTRACT AUDIBLE. It was true, correct and silent, and
 * silence cost five acceptance criteria: every device-facing control milestones
 * 3-5 built was written as a child here, so on device AutoLayout had no Tidy
 * button, Perf200 had no sampler and `window.__mpoPerf200` appeared zero times
 * in the emitted bundle. Nothing threw. The canvas painted. So a canvas given
 * children now warns ONCE in dev, naming the two places a control may legally
 * go: a native SIBLING on `graphRef`, or a serializable option the DOM bundle
 * renders from. `native/graph-children.ts` holds the message.
 */

import { useCallback, useMemo, useState } from 'react';
import type { ReactNode, Ref } from 'react';

import type { NodeGraphDomOptions } from './dom/node-graph-dom-shell';
import type { GraphEventWire, PerfReportWire, GraphDiagnosticsWire } from './dom/wire';
import { useKnobEnvelope } from './knobs/use-knob-envelope';
import { applyCommand } from './model/commands';
import type { EdgeKindDefs, GraphCommand, GraphDocument, NodeKindDefs } from './model/index';
import { serializeDocument } from './model/serialize';
import type { NodeGraphDomEntry } from './native/dom-entry-registry';
import { warnOnGraphChildren } from './native/graph-children';
import { NodeGraphNative } from './native/NodeGraph.native';
import type { NodeGraphHandle } from './react-flow/graph-handle';
import type { NodeGraphWebProps } from './react-flow/NodeGraphWeb';

/**
 * The web props, minus the four that are web-only by construction.
 *
 * `nodeTypes` and `className` are a React Flow registry and a DOM class, and
 * `onConnectionRefused` takes a verdict object the bridge reports as a code and
 * a message instead. Omitting them rather than accepting-and-dropping means a
 * consumer who needs one fails to compile on native rather than at runtime.
 */
export type NodeGraphProps<N extends NodeKindDefs = NodeKindDefs, E extends EdgeKindDefs = EdgeKindDefs> = Omit<
  NodeGraphWebProps<N, E>,
  'nodeTypes' | 'className' | 'onConnectionRefused' | 'children'
> & {
  /** Accepted so one story file serves both platforms. Never rendered here. */
  readonly children?: ReactNode;
  /** Refusals arrive over the wire as a code and a message, not as a verdict. */
  readonly onConnectionRefused?: (code: string, message: string) => void;
  /** Overridable so a test can make the watchdog fire without waiting four seconds. */
  readonly readyTimeoutMs?: number;
  /**
   * The app's `'use dom'` entry (design §9.3). Native only: on web there is no
   * bridge and `NodeGraphWebProps` has no such prop, so a screen that passes it
   * fails to compile for web rather than silently ignoring it.
   *
   * A story in THIS package cannot supply one — `public/*` may not import an
   * app's config — so the Kitchen Sink registers the app's entry once through
   * `setNodeGraphDomEntry` and every story picks it up.
   */
  readonly domEntry?: NodeGraphDomEntry;
  /**
   * Design 9.5's record, as the canvas inside the WebView measured it.
   *
   * NATIVE ONLY, and deliberately absent from `NodeGraphWebProps`: on web
   * there is no bridge and no `ready` event to carry one, so a screen that
   * passes this fails to compile for web rather than silently never firing.
   * The web twin of a caller reads `useGraphDiagnostics` directly instead.
   *
   * It exists because the DOM half of AC-3 has nowhere else to land. `faces`
   * carries design 6.3's corrupted-first-family probe, run INSIDE the WebView
   * against a rendered node title, and `nodesMounted` / `nodesInDocument` are
   * the only honest source for how many nodes actually painted — a story on the
   * Hermes side can measure neither. `NodeGraph/Diagnostics` -> `Live` renders
   * this straight into `GraphDiagnostics`.
   */
  readonly onReady?: (diagnostics: GraphDiagnosticsWire) => void;
  /**
   * The handle a native SIBLING drives the canvas with (milestone 6, §9.1).
   *
   * The same eleven commands `NodeGraphWeb` publishes through its own
   * `graphRef`, so a toolbar written once works on both platforms. This is the
   * legal replacement for the children this component drops, and the warning it
   * emits names it.
   */
  readonly graphRef?: Ref<NodeGraphHandle>;
  /**
   * Arms design §7.3's long press INSIDE the WebView, where the pane element
   * exists. Serializable, because it crosses the bridge as an option.
   */
  readonly longPressLasso?: boolean;
  /**
   * A tidy finished: the runner that produced it and its engine milliseconds.
   *
   * A REJECTED relayout arrives here too, carrying `error` with `runner: "none"`
   * and `ms: 0`. Before the m6 device pass a rejection answered with nothing at
   * all, which is why a stuck "laying out…" could not be told apart from a Tidy
   * that never reached the canvas.
   */
  readonly onLayoutResult?: (result: { runner: string; ms: number; nodeCount: number; error?: string }) => void;
  /** A perf run finished. A REJECTED run arrives here too — see `PerfReportWire`. */
  readonly onPerfReport?: (report: PerfReportWire) => void;
  /** The long press armed, selected, or was cancelled. */
  readonly onLasso?: (event: Extract<GraphEventWire, { t: 'lasso' }>) => void;
  /** The canvas painted its first frame. The watchdog's real clock (§9.4). */
  readonly onPaint?: (bootMs: number | null) => void;
  /**
   * EVERY event, undecomposed — the same prop name and the same union
   * `NodeGraphWeb` takes on web.
   *
   * It exists so ONE story file can serve both platforms, which is the point of
   * this whole component. The typed callbacks above are what a real screen
   * wants; a story that has to read a runner on a phone and on a desktop wants
   * one name that means the same thing in both places.
   */
  readonly onGraphEvent?: (event: GraphEventWire) => void;
};

export const NodeGraph = <N extends NodeKindDefs, E extends EdgeKindDefs>(props: NodeGraphProps<N, E>) => {
  const {
    coarsePointer,
    defaultDocument,
    domEntry,
    fitView,
    graphRef,
    intent,
    interactionMode,
    knobs,
    longPressLasso,
    onConnectionRefused,
    onDocumentChange,
    onGraphEvent,
    onLasso,
    onLayoutResult,
    onlyRenderVisibleElements,
    onPaint,
    onPerfReport,
    onReady,
    overviewZoom,
    presetName,
    readOnly,
    readyTimeoutMs,
    schema,
  } = props;

  // Once per process, in dev. See `native/graph-children.ts` for why a contract
  // that was already written down needed to start speaking.
  warnOnGraphChildren(props.children);

  // The host's own copy. Controlled beats uncontrolled, exactly as on web; the
  // seed is read once because a `defaultDocument` that changes identity every
  // render is a story writing an object literal, not a new document.
  // oxlint-disable-next-line react/hook-use-state -- read-once seed: there is deliberately no setter, a ref read during render is what this replaces.
  const [seed] = useState(() => props.document ?? defaultDocument ?? null);
  const [held, setHeld] = useState<GraphDocument<N, E> | null>(seed);
  const document = props.document ?? held;

  // `rev` is the host's, and it only ever climbs. Every commit the canvas
  // proposes arrives as `rev + 1`; stamping it here is what lets the canvas
  // refuse its own echo on the way back in.
  const [rev, setRev] = useState(0);

  const documentJson = useMemo(
    () => (document ? serializeDocument(document) : serializeDocument({ version: 1, nodes: [], edges: [] })),
    [document],
  );

  const envelope = useKnobEnvelope({
    intent,
    knobs,
    pointer: coarsePointer ? 'coarse' : undefined,
    presetName,
  });

  const options = useMemo<NodeGraphDomOptions>(
    () => ({
      coarsePointer,
      fitView,
      interactionMode,
      longPressLasso,
      onlyRenderVisibleElements,
      overviewZoom,
      readOnly,
    }),
    [coarsePointer, fitView, interactionMode, longPressLasso, onlyRenderVisibleElements, overviewZoom, readOnly],
  );

  const onCommit = useCallback(
    (nextRev: number, commandsJson: string) => {
      setRev(nextRev);
      let commands: GraphCommand<N, E>[];
      try {
        // SAFETY: commandsJson is the serialized command array the DOM canvas built from this same schema; a parse failure is caught below.
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- JSON.parse returns any; the wire contract above fixes the shape.
        commands = JSON.parse(commandsJson) as GraphCommand<N, E>[];
      } catch {
        // A commit this build cannot parse means the DOM bundle and this host
        // are out of step. The canvas still holds the real document; dropping
        // the host's mirror is better than corrupting it.
        return;
      }
      setHeld((current) => {
        let next = current ?? seed;
        if (!next) {
          return current;
        }
        for (const command of commands) {
          next = applyCommand(next, command);
        }
        for (const command of commands) {
          onDocumentChange?.(next, command);
        }
        return next;
      });
    },
    [onDocumentChange, seed],
  );

  return (
    <NodeGraphNative
      documentJson={documentJson}
      domEntry={domEntry}
      envelope={envelope}
      graphRef={graphRef}
      onCommit={onCommit}
      onConnectionRefused={onConnectionRefused}
      onGraphEvent={onGraphEvent}
      onLasso={onLasso}
      onLayoutResult={onLayoutResult}
      onPaint={onPaint}
      onPerfReport={onPerfReport}
      onReady={onReady}
      options={options}
      readyTimeoutMs={readyTimeoutMs}
      rev={rev}
      schemaId={schema.id}
    />
  );
};
