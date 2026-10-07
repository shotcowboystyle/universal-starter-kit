/**
 * The real tree, behind the dynamic import.
 *
 * Everything that can throw at module-eval time lives here rather than in the
 * entry, so a throw is a caught `{ t: "error", phase: "module" }` instead of a
 * blank WebView. That is the whole reason this file is separate from
 * `NodeGraphDom.ts`.
 *
 * It renders exactly one code path: `KnobEnvelopeProvider` rebuilds the real
 * Preset / Surface / Intent stack out of the envelope the host serialized, and
 * `NodeGraphWeb` — the same component the web Storybook mounts — resolves its
 * own knobs from that rebuilt stack. There is no DOM-specific canvas. Design
 * 6.1's claim is that the rehydrated `ResolvedKnobs` deep-equals the host's,
 * and `envelope.spec.tsx` is what holds it to that.
 *
 * A fresh React root has no `TamaguiProvider` above it, so this file supplies
 * the config. It takes it as a PROP from the app's `'use dom'` entry and falls
 * back to whatever `createTamagui` already installed: the config is not JSON
 * and cannot cross the bridge, so it has to come from a module the consumer's
 * DOM entry imports — the same constraint that makes schemas register by id,
 * and the one that had this canvas dying of `Missing theme.` on both platforms
 * until design §9.3 was amended to say who owns the entry.
 */

import { getConfig } from '@tamagui/web';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { parseKnobEnvelope } from '../knobs/envelope';
import type { KnobEnvelope } from '../knobs/envelope';
import { KnobEnvelopeProvider } from '../knobs/KnobEnvelopeProvider';
import type {
  ConnectionVerdict,
  EdgeKindDefs,
  GraphCommand,
  GraphDocument,
  GraphSchema,
  NodeKindDefs,
} from '../model/index';
import { getGraphSchema, parseDocument } from '../model/index';
import { demoGraphSchema } from '../react-flow/demoNodeBody';
import { demoGraphSchemaId } from '../react-flow/fixtures';
import { mountedNodeCount, subscribeNodeCensus } from '../react-flow/nodeCensus';
import { NodeGraphWeb } from '../react-flow/NodeGraphWeb';
import { xyflowVersion } from '../react-flow/xy';
import { probeRenderedFamily } from '../theme/faces';
import { GraphFaces } from '../theme/GraphFaces';
import type { GraphFaceStatus } from '../theme/GraphFaces';

import { readBootElapsedMs, graphReadySettleMs as settleGraceMs, stampBootStage } from './boot';
import { GraphDomLayout } from './GraphDomLayout';
import type { NodeGraphDomInnerProps, NodeGraphDomOptions } from './NodeGraphDomShell';
import { createGraphEventEmitter, createRevEchoGate, isBenignCanvasError } from './wire';
import type { FaceProbeWire, GraphEventWire, GraphFaceDeliveryWire } from './wire';

// Module eval got here, which is the stage the fallback names when the failure
// is further in. `faces` is stamped by `GraphFaces` in task 2.5; until that
// lands, boot goes `script -> module -> provider -> flow -> ready` and the
// forward-only stamp makes the skip harmless.
stampBootStage('module');

type AnyDocument = GraphDocument<NodeKindDefs, EdgeKindDefs>;
type AnySchema = GraphSchema<NodeKindDefs, EdgeKindDefs>;

function parseOptions(json: string): NodeGraphDomOptions {
  try {
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    return parsed as NodeGraphDomOptions;
  } catch {
    // Options are decoration around a canvas, never the canvas itself. A
    // malformed blob takes the defaults rather than the whole render.
    return {};
  }
}

export function NodeGraphDomInner(props: NodeGraphDomInnerProps) {
  const { commands, documentJson, envelopeJson, onEvent, optionsJson, rev, schemaId } = props;

  const emitter = useMemo(() => createGraphEventEmitter({ send: (json) => void onEvent(json) }), [onEvent]);
  useEffect(
    () => () => {
      emitter.dispose();
    },
    [emitter],
  );
  const emit = useCallback(
    (event: GraphEventWire) => {
      emitter.emit(event);
    },
    [emitter],
  );

  const gate = useRef(createRevEchoGate()).current;

  /**
   * `flow` — React Flow mounted and is reachable. Stamped from the command
   * bridge's own mount effect, which is the first moment that is true; it used
   * to be stamped by the bridge itself when the bridge lived in this file.
   */
  const stampFlowStage = useCallback(() => {
    stampBootStage('flow');
  }, []);
  const options = useMemo(() => parseOptions(optionsJson), [optionsJson]);

  /**
   * The package's own demo schema, registered HERE or nowhere.
   *
   * A schema's `render` is a component, so it cannot be JSON and cannot cross
   * the bridge: the only way a canvas gets one is a module the DOM BUNDLE
   * imports, and a DOM bundle is rooted at `NodeGraphDom.ts`. That is a real
   * constraint on every consumer — each app writes its own `'use dom'` entry
   * that imports its schema registration — but it left the package's own
   * `NodeGraph/NodeGraph` story with no canvas on device, because a story
   * cannot inject a module into a bundle rooted in this package.
   *
   * So exactly one id is special-cased, and only on a MISS. `demoNodeBody` is
   * reached through a dynamic import so it lands in its own chunk: a real
   * consumer registers their schema, never misses, and never fetches it.
   */
  /**
   * The package's own demo schema, registered HERE or nowhere.
   *
   * A schema's `render` is a component, so it cannot be JSON and cannot cross
   * the bridge: the only way a canvas gets one is a module the DOM BUNDLE
   * imports, and a DOM bundle is rooted at `NodeGraphDom.ts`. That is a real
   * constraint on every consumer — each app writes its own `'use dom'` entry
   * that imports its schema registration — but it left the package's own
   * `NodeGraph/NodeGraph` story with no canvas on device, because a story
   * cannot inject a module into a bundle rooted in this package.
   *
   * Exactly one id is special-cased, and only on a MISS, so a consumer who
   * registers their own schema is never shadowed.
   *
   * STATIC, and it was a dynamic import until it was measured. A second
   * dynamic import makes Metro emit a shared `__common` chunk, and
   * `expo export`'s html serializer then dies with
   * `Asset not found: _expo/static/js/web/__common-<hash>.js` — exiting 0 and
   * writing nothing, which `verify-dom-bundle.mjs` catches and CI would not.
   * The embed build showed the chunk this bought: `demoNodeBody-<hash>.js` at
   * 5.6 KB. Five kilobytes is not worth a broken export.
   */
  const demoSchema = useMemo(
    () => (schemaId === demoGraphSchemaId ? (demoGraphSchema() as unknown as AnySchema) : undefined),
    [schemaId],
  );
  /**
   * By id first, by value second — and BY VALUE IS NOW A LIST.
   *
   * `schemaId` is the only thing that crosses the bridge, so every mechanism
   * here is a lookup keyed by it. Three sources, in this order:
   *
   *  1. `registerGraphSchema`, the process-wide registry, for an app that would
   *     rather import a registration module than thread a prop;
   *  2. `schemas` / `schema` from the app's own `'use dom'` entry;
   *  3. the package's own demo schema, only on a miss.
   *
   * `schemas` is the milestone-6 device-pass fix. The entry could supply
   * exactly ONE schema by value, so an app with two canvases had one that could
   * not render on device: measured on the iPhone 16e, `NodeGraph/Perf200` →
   * `Control` reported `no graph schema registered as "node-graph-demo-control"`
   * and painted nothing, and design §13.2 mandates that control condition in
   * every measurement session.
   *
   * The id MUST match. A silent substitution would render the wrong nodes and
   * report nothing, which is strictly worse than the fallback saying what is
   * missing — so this is a `Map` lookup and never a "take the first one".
   */
  const supplied = useMemo(() => {
    const byId = new Map<string, AnySchema>();
    // The single-schema prop is written LAST so it wins a tie: an app that
    // passes both has said the singular one is the answer for its id.
    for (const candidate of [...(props.schemas ?? []), ...(props.schema ? [props.schema] : [])]) {
      byId.set(candidate.id, candidate as unknown as AnySchema);
    }
    return byId.get(schemaId);
  }, [props.schema, props.schemas, schemaId]);
  const schema = useMemo(
    () => (getGraphSchema(schemaId) as unknown as AnySchema | undefined) ?? supplied ?? demoSchema,
    [demoSchema, schemaId, supplied],
  );

  const envelope = useMemo<{ value: KnobEnvelope } | { error: string }>(() => {
    try {
      return { value: parseKnobEnvelope(envelopeJson) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }, [envelopeJson]);

  const [document, setDocument] = useState<AnyDocument | null>(null);

  // The inbound half of echo suppression. A document whose rev this canvas
  // emitted itself is its own commit coming back, and applying it would fight
  // the drag that produced it.
  useEffect(() => {
    if (!schema) {
      return;
    }
    if (!gate.acceptInbound(rev)) {
      return;
    }
    const parsed = parseDocument<NodeKindDefs, EdgeKindDefs>(documentJson, schema, {
      dropUnknownKinds: options.dropUnknownKinds,
    });
    if (parsed.ok) {
      setDocument(parsed.value);
      return;
    }
    emit({
      t: 'error',
      phase: 'render',
      message: `document rejected: ${parsed.error.map((problem) => problem.message).join('; ')}`,
    });
  }, [documentJson, emit, gate, options.dropUnknownKinds, rev, schema]);

  const onDocumentChange = useCallback(
    (next: AnyDocument, command: GraphCommand<NodeKindDefs, EdgeKindDefs>) => {
      setDocument(next);
      const proposed = rev + 1;
      gate.markEmitted(proposed);
      emit({ t: 'commit', rev: proposed, commandsJson: JSON.stringify([command]) });
    },
    [emit, gate, rev],
  );

  const onConnectionRefused = useCallback(
    (verdict: ConnectionVerdict) => {
      if (verdict.ok) {
        return;
      }
      emit({ t: 'connectRefused', code: verdict.code, message: verdict.message });
    },
    [emit],
  );

  /**
   * `window.onerror` and `unhandledrejection`, design 9.4 layer 5.
   *
   * The filter is the hard-won part: React Flow's own ResizeObserver trips its
   * loop notice on every layout pass, and treating that as fatal blanked the
   * canvas mid-drag in the gate.
   */
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      if (isBenignCanvasError(event.message)) {
        return;
      }
      emit({
        t: 'error',
        phase: 'runtime',
        message: event.message,
        stack: event.error instanceof Error ? event.error.stack : undefined,
      });
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const { reason } = event;
      const message = reason instanceof Error ? reason.message : String(reason);
      if (isBenignCanvasError(message)) {
        return;
      }
      emit({
        t: 'error',
        phase: 'runtime',
        message,
        stack: reason instanceof Error ? reason.stack : undefined,
      });
    };
    globalThis.addEventListener('error', onError);
    globalThis.addEventListener('unhandledrejection', onRejection);
    return () => {
      globalThis.removeEventListener('error', onError);
      globalThis.removeEventListener('unhandledrejection', onRejection);
    };
  }, [emit]);

  /**
   * The one `createTamagui` already installed, not a new one.
   *
   * A fresh React root has no `TamaguiProvider` above it, and the config is not
   * JSON so it cannot cross the bridge — it has to come from a module the
   * consumer's DOM entry imports, the same constraint that makes schemas
   * register by id. `getConfig` THROWS when `createTamagui` has not run, and
   * `@tamagui/web`'s index does not re-export the `Maybe` variant, so the
   * try/catch is the supported way to ask.
   */
  const config = useMemo(() => {
    if (props.config) {
      return props.config;
    }
    try {
      return getConfig();
    } catch {
      return;
    }
  }, [props.config]);

  /**
   * The two ways this file can refuse to render, computed rather than thrown,
   * so the refusal is reportable instead of a blank rectangle.
   */
  const problem = useMemo(() => {
    if ('error' in envelope) {
      return envelope.error;
    }
    // Measured, not guessed: without this the first Tamagui component throws
    // `Missing theme.` from somewhere three components deep, and the reader has
    // no way to get from that to "the DOM entry never imported a config".
    if (!config) {
      return (
        "no Tamagui config inside the DOM bundle — the app's `'use dom'` entry " +
        'must import its own tamagui config module and pass it to ' +
        'NodeGraphDomShell as `config`, because a config is a live object and ' +
        'cannot cross the bridge.'
      );
    }
    // Still fetching the chunk that would supply it. Reporting now would draw
    // the fallback over a canvas that is about to work.
    if (!schema) {
      return (
        `no graph schema registered as ${JSON.stringify(schemaId)} — ` +
        'pass it to NodeGraphDomShell as `schema` or in `schemas`, or register it ' +
        'with `registerGraphSchema` in a module BOTH the native screen and the DOM ' +
        "entry import, because a node's `render` is a component and cannot cross " +
        'the bridge. An entry that renders more than one kind of canvas needs ' +
        '`schemas`: only the id crosses.'
      );
    }
    return null;
  }, [config, envelope, schema, schemaId]);

  useEffect(() => {
    if (!problem) {
      return;
    }
    emit({ t: 'error', phase: 'render', message: problem });
  }, [emit, problem]);

  /**
   * Design §6.3's control, run WHERE IT HAS TO RUN.
   *
   * The `FontProof` story runs the same probe, but a story renders on the
   * Hermes side and the canvas renders in a WebView — two font stacks, two
   * renderers, and only one of them is the thing AC-3 asks about. Measured on
   * the iPhone 16e: mounting `GraphFaces` in a native story throws
   * `View config getter callback for component 'style' must be a function`,
   * because a `<style>` element is not a React Native component. So on device
   * the probe can only run in here, and its result can only reach a reader
   * through the `ready` event.
   *
   * It probes a rendered node's TITLE rather than the canvas root: the root
   * inherits nothing from `GraphNode`'s resolved `$body` stack, and the title is
   * the element that stack exists for. The target is the package's own
   * `data-graph-node-title` attribute rather than a `.react-flow__` class,
   * which is both the house rule (`lint-conventions.mjs`'s GRAPH VARS COVERAGE)
   * and the right coupling: the probe should break when OUR node changes, not
   * when @xyflow renames an internal. If no node has mounted (the `Empty`
   * story), the body is honest — `conclusive: false` falls out of `probeFamily`
   * on its own when a measurement is worthless.
   */
  const probeFaces = useCallback((): readonly FaceProbeWire[] => {
    if (globalThis.document === undefined) {
      return [];
    }
    const el = globalThis.document.querySelector('[data-graph-node-title]') ?? globalThis.document.body;
    if (!el) {
      return [];
    }
    const probe = probeRenderedFamily(el);
    return probe.stack ? [probe] : [];
  }, []);

  /**
   * Which mechanism delivered each face, lifted out of `GraphFaces`.
   *
   * `GraphFaces` has always known this and has always reported it to a
   * callback; nothing on a device ever saw the answer, so "did the asset URL
   * work or did the base64 carry it" was unanswerable from a screenshot. It
   * rides the `ready` event now (MPO-211, design 6.3).
   */
  const [faceDelivery, setFaceDelivery] = useState<readonly GraphFaceDeliveryWire[]>([]);
  const onFaceStatus = useCallback((statuses: readonly GraphFaceStatus[]) => {
    setFaceDelivery(statuses);
  }, []);

  /**
   * The ready gate, and why it is no longer "the document parsed".
   *
   * `ready` carries design 9.5's whole record, and two of its fields are not
   * knowable at the instant the document lands: React Flow has not measured
   * the pane yet, so with culling on NO node body has mounted, and
   * `GraphFaces` has not heard back from `document.fonts`. Emitting then
   * reported `nodesMounted: 0` and every face `pending` — numbers that read as
   * a broken canvas on a canvas that was about to paint correctly.
   *
   * So the gate waits for the canvas to actually paint, bounded by
   * `settleGraceMs` so a canvas that never mounts a node still reports rather
   * than hanging until the native watchdog fires. An EMPTY document satisfies
   * the node half immediately — zero mounted is the correct number there, and
   * waiting for the grace would make `NodeGraph/NodeGraph` -> `Empty` slow for
   * no information.
   */
  const [isReady, setIsReady] = useState(false);
  const [censusTick, setCensusTick] = useState(0);
  const [settleExpired, setSettleExpired] = useState(false);

  // Subscribed only until `ready`. A live subscription would re-render this
  // root on every cull and uncull, which is every frame of a pan.
  useEffect(() => {
    if (isReady) {
      return;
    }
    return subscribeNodeCensus(() => {
      setCensusTick((tick) => tick + 1);
    });
  }, [isReady]);

  useEffect(() => {
    if (isReady) {
      return;
    }
    const timer = setTimeout(() => {
      setSettleExpired(true);
    }, settleGraceMs);
    return () => {
      clearTimeout(timer);
    };
  }, [isReady]);

  const ready = useRef(false);
  useEffect(() => {
    if (ready.current || problem || !document || !('value' in envelope)) {
      return;
    }
    // `censusTick` is read so this effect re-runs when a node mounts; the count
    // itself is read imperatively, because the value is what matters and the
    // tick is only the wake-up.
    void censusTick;
    const nodesMounted = mountedNodeCount();
    const facesSettled = faceDelivery.length > 0 && faceDelivery.every((face) => face.source !== 'pending');
    const nodesSettled = document.nodes.length === 0 || nodesMounted > 0;
    if (!settleExpired && !(facesSettled && nodesSettled)) {
      return;
    }
    ready.current = true;
    setIsReady(true);
    const stage = stampBootStage('ready');
    emit({
      t: 'ready',
      diagnostics: {
        stage,
        // Measured, not budgeted: this is the number the native watchdog's
        // 4000 ms was supposed to be set from and never was.
        bootMs: readBootElapsedMs(),
        renderer: 'react-flow-dom',
        /**
         * WHY THIS WAS EMPTY, and it is worth writing down because the panel
         * beside it was right the whole time.
         *
         * The comment here said `useGraphDiagnostics` would fill it in at task
         * 2.6. That reading was of the WEB path: on web the panel calls the
         * hook itself and the hook reads `xy.ts`. Inside the WebView the panel
         * is on the other side of the bridge and can only render what this
         * object carries, so the field stayed the literal empty string it was
         * seeded with — which is why `Diagnostics -> Live` printed nothing for
         * `xyflow:` on both platforms while `Diagnostics -> Main` printed
         * 12.11.5 from the same constant.
         *
         * `xy.ts` is the only file allowed to reach `@xyflow`, and it exports
         * the version as a plain string for exactly this. Reading it here is
         * one import, not an invention.
         */
        xyflowVersion,
        layoutRunner: 'none',
        faces: probeFaces(),
        faceDelivery,
        // The census, not the document. `onlyRenderVisibleElements` is on by
        // default, so a 12-node document paints ten bodies at the default
        // viewport and the two numbers are different facts.
        nodesMounted,
        nodesInDocument: document.nodes.length,
        culling: options.onlyRenderVisibleElements !== false,
        renderMode: 'detail',
        scheme: envelope.value.scheme,
        lastError: null,
      },
    });
  }, [
    censusTick,
    document,
    emit,
    envelope,
    faceDelivery,
    options.onlyRenderVisibleElements,
    probeFaces,
    problem,
    settleExpired,
  ]);

  if (problem || !('value' in envelope) || !schema || !document) {
    return null;
  }

  // Stamped in the render body, not an effect: child effects run BEFORE parent
  // effects, so `flow` would be stamped first and the forward-only rule would
  // then drop `provider` from the history the fallback reads. The write is
  // idempotent and touches no React state, so a double render costs nothing.
  stampBootStage('provider');

  return (
    <KnobEnvelopeProvider
      envelope={envelope.value}
      config={config}>
      {/*
        Design 6.3's faces, INSIDE the WebView, which is the only place they can
        do anything. Task 2.5 built the payload and mounted it only in the web
        `FontProof` story, so on device the canvas painted in whatever the
        WKWebView fell back to — the `$body` face was not reaching the one
        renderer the whole mechanism exists for. It is a `<style>` element and
        nothing else, so it costs no layout and cannot move a node.

        No `assetUris`: a `require()`d asset URL is the host's to supply and the
        canvas has no way to reach one across the bridge, so the base64 path
        carries every face here. That is the path the gate proved.
      */}
      {/*
        Without these four rules the canvas below is laid out correctly and
        painted nowhere: `NodeGraphWeb` sizes itself `height: 100%` against an
        auto-height `html > body > #root`, so React Flow's pane collapses and
        clips every node. Measured on the iPhone 16e and emulator-5592 — no
        error, no fallback, boot through to `ready`, and a white rectangle.
      */}
      <GraphDomLayout />
      <GraphFaces onStatus={onFaceStatus} />
      {/*
        MILESTONE 6. Everything that used to be a `children` of this canvas is
        now either a prop or a command, because native drops children by
        contract and every device-facing control in the story set was one.

        `commandSlot` is the shell's own ref, so `useDOMImperativeHandle`
        forwards straight into the same eleven commands the web canvas
        publishes through `graphRef`. `onGraphEvent` is the one channel. And
        `longPressLasso` is a boolean rather than a hook, because the gesture
        needs the pane element and the pane exists only in HERE.
      */}
      <NodeGraphWeb<NodeKindDefs, EdgeKindDefs>
        schema={schema}
        document={document}
        onDocumentChange={onDocumentChange}
        onConnectionRefused={onConnectionRefused}
        readOnly={options.readOnly}
        presetName={envelope.value.presetName}
        intent={envelope.value.intent}
        coarsePointer={options.coarsePointer}
        onlyRenderVisibleElements={options.onlyRenderVisibleElements}
        fitView={options.fitView}
        overviewZoom={options.overviewZoom}
        longPressLasso={options.longPressLasso}
        interactionMode={options.interactionMode}
        commandSlot={commands}
        onGraphEvent={emit}
        renderer="react-flow-dom"
        readBootMs={readBootElapsedMs}
        onCanvasMounted={stampFlowStage}
      />
    </KnobEnvelopeProvider>
  );
}
