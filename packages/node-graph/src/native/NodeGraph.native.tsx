/**
 * The native host: the WebView, the watchdog, and the fallback.
 *
 * Design 9.4 layer 4. A DOM component that never comes up is, by default, a
 * blank rectangle — the parse error that caused it happened before any error
 * boundary existed, and there is no console on a phone to find it in. So this
 * file starts a timer at mount and, if no `{ t: "ready" }` arrives inside
 * `readyTimeoutMs`, draws `GraphFallback` naming the last boot stage the
 * WebView managed to stamp.
 *
 * The retry is a REMOUNT under a new key, not a reload: the boot record is a
 * global inside the WebView, and a new key gives boot a fresh one rather than
 * a second attempt reading the first one's stages.
 *
 * The host owns `rev`. Every commit the canvas emits proposes `rev + 1`; this
 * file applies the commands, stamps the new rev and hands the document back.
 * The canvas's own echo gate then refuses the document it caused, so a drag
 * does not fight itself. `wire.ts` holds the gate and the reasoning.
 *
 * WHAT IT NO LONGER OWNS (design §9.3, MPO-211): the `'use dom'` entry. It used
 * to render the package's own, and the package's own can never see a consumer's
 * Tamagui config or schema — both are live objects, so both can only arrive
 * from a module the DOM BUNDLE imports, and a DOM bundle is rooted at the file
 * carrying the directive. Measured on the iPhone 16e simulator and on
 * emulator-5592: `render: Missing theme.`, identically on both platforms,
 * because `getConfig()` threw inside the WebView. So the entry is a PROP now,
 * and a host given none draws `GraphFallback` naming that rather than booting a
 * WebView that is guaranteed to fail four seconds later.
 */

import { createElement, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { Ref } from 'react';

import { recordGraphError, resetGraphError } from '../diagnostics/lastError';
import type { BootStage } from '../dom/boot';
import type { NodeGraphDomHandle, NodeGraphDomOptions, NodeGraphDomProps } from '../dom/NodeGraphDomShell';
import { decodeGraphEvent } from '../dom/wire';
import type { GraphDiagnosticsWire, GraphEventWire, PerfReportWire } from '../dom/wire';
import type { KnobEnvelope } from '../knobs/envelope';
import type { NodeId, Viewport } from '../model/index';
import type { NodeGraphHandle } from '../react-flow/graphHandle';

import { getNodeGraphDomEntry } from './domEntryRegistry';
import type { NodeGraphDomEntry } from './domEntryRegistry';
import { GraphFallback } from './GraphFallback.native';
import type { GraphFallbackReason } from './GraphFallback.native';

/**
 * The watchdog budget. Design 9.4 said 4000; this is the measured replacement.
 *
 * 4000 was never measured — the design's own words were that "a cold WKWebView
 * start with a first-run font fetch is comfortably under it". On emulator-5590,
 * rebooted fresh, it was not: the watchdog fired, the fallback blamed a parse
 * error, and Retry rendered the canvas immediately. Nothing had failed. A
 * watchdog cannot tell a dead canvas from a slow one, so the only safe budget
 * is one set from a real cold start with headroom over it.
 *
 * Two things go into the number now:
 *
 *  - the cold WebView start itself, which the canvas MEASURES and reports as
 *    `bootMs` in design 9.5's panel, so this constant can be re-set from a
 *    device instead of from a guess;
 *  - `graphReadySettleMs` (1800), which the canvas deliberately waits before
 *    stamping `ready` so its own diagnostics are filled in rather than
 *    reporting `nodesMounted: 0` and every face `pending`.
 *
 * This MUST stay comfortably above their sum. A watchdog that undercut the
 * settle grace would declare a healthy canvas dead while it was filling in its
 * own panel, which is a worse version of exactly the bug this replaces.
 */
export const readyTimeoutMs = 12_000;

export interface NodeGraphNativeProps {
  readonly documentJson: string;
  readonly rev: number;
  readonly envelope: KnobEnvelope;
  readonly schemaId: string;
  readonly options?: NodeGraphDomOptions;
  /** Commands the canvas proposes, already JSON. The host applies and re-stamps `rev`. */
  readonly onCommit?: (rev: number, commandsJson: string) => void;
  readonly onSelection?: (ids: readonly NodeId[]) => void;
  readonly onViewport?: (viewport: Viewport) => void;
  readonly onNodeActivate?: (id: NodeId) => void;
  readonly onConnectionRefused?: (code: string, message: string) => void;
  readonly onHaptic?: (kind: 'selection' | 'impact' | 'warning') => void;
  readonly onReady?: (diagnostics: GraphDiagnosticsWire) => void;
  readonly onError?: (event: Extract<GraphEventWire, { t: 'error' }>) => void;
  /**
   * The canvas painted. Milestone 6: this, and not `ready`, is what the
   * watchdog is measured against — see the effect below.
   */
  readonly onPaint?: (bootMs: number | null) => void;
  readonly onLayoutResult?: (result: {
    runner: string;
    ms: number;
    nodeCount: number;
    /** Present when the engine REJECTED. `runner` is `none` and `ms` is 0 there. */
    error?: string;
  }) => void;
  readonly onPerfReport?: (report: PerfReportWire) => void;
  readonly onLasso?: (event: Extract<GraphEventWire, { t: 'lasso' }>) => void;
  /**
   * EVERY decoded event, before the typed callbacks fire. One name that means
   * the same thing on both platforms, so one story file can serve both.
   */
  readonly onGraphEvent?: (event: GraphEventWire) => void;
  /**
   * The imperative handle, forwarded to the DOM component. It is the ONLY way a
   * native sibling can drive this canvas, so it is a prop and not an internal
   * ref — which is what it was, and which is why nothing on a device could ever
   * press Tidy.
   */
  readonly graphRef?: Ref<NodeGraphHandle>;
  /** Overridable so a test can make the watchdog fire without waiting four seconds. */
  readonly readyTimeoutMs?: number;
  /**
   * D1 is unruled. The gate that passed used Expo's OWN DOM WebView, and
   * `@expo/dom-webview` is what this repo carries — `react-native-webview` is in
   * no package.json here. So the default is `useExpoDOMWebView: true`, which is
   * exactly what was proven, and a consumer who adds `react-native-webview` can
   * override the whole `dom` prop.
   */
  readonly dom?: NonNullable<NodeGraphDomProps['dom']>;
  /**
   * The app's `'use dom'` entry. Design §9.3: it imports the app's tamagui
   * config and its schema registration and renders `NodeGraphDomShell`, and
   * nothing inside this package can stand in for it.
   *
   * Falls back to `getNodeGraphDomEntry()` so a story that lives in this
   * package — which cannot import an app's config — still gets a canvas once
   * the app has registered one.
   */
  readonly domEntry?: NodeGraphDomEntry;
}

const defaultDomProps = { matchContents: false, useExpoDOMWebView: true } as const;

export function NodeGraphNative(props: NodeGraphNativeProps) {
  const {
    documentJson,
    envelope,
    onCommit,
    onConnectionRefused,
    onError,
    onGraphEvent,
    onHaptic,
    onLasso,
    onLayoutResult,
    onNodeActivate,
    onPaint,
    onPerfReport,
    onReady,
    onSelection,
    onViewport,
    options,
    rev,
    schemaId,
  } = props;
  const timeout = props.readyTimeoutMs ?? readyTimeoutMs;

  const [attempt, setAttempt] = useState(0);
  const [ready, setReady] = useState(false);
  /**
   * The canvas PAINTED. Milestone 6, and the fix for a watchdog that fired on a
   * working canvas.
   *
   * `ready` is deliberately late: the canvas waits `graphReadySettleMs` (1800)
   * so the diagnostics it carries are filled in rather than reporting
   * `nodesMounted: 0` and every face `pending`. That is right for the panel and
   * wrong for a liveness check. Measured on emulator-5592: the 12 s budget
   * fired on a canvas that was already on screen, and on emulator-5590 Retry
   * did not recover it. The watchdog was timing the clock that is allowed to be
   * slow.
   *
   * So the budget is now measured against `paint`, the frame after React Flow's
   * first render. The budget itself is UNCHANGED — 12000 was set from a real
   * cold start and nothing about that measurement has been re-taken — but it is
   * now spent on the question it was always meant to answer: are there pixels.
   */
  const [painted, setPainted] = useState(false);
  /**
   * A retry that re-CREATES the WebView, in two phases.
   *
   * Bumping `attempt` gave the entry a new `key`, which is a remount of the
   * React element — and on emulator-5590 that was not enough to recover: the
   * old WebView was still being torn down as the new one mounted. Rendering
   * nothing for one commit forces the unmount to complete before the next
   * `createElement` runs, so the second attempt gets a genuinely new WebView
   * with a fresh boot record rather than a second pass over the first one's.
   */
  const [restarting, setRestarting] = useState(false);
  /**
   * Whether ANY event has crossed the bridge on this attempt.
   *
   * The host only learns a boot STAGE from `ready`, so a failure before that
   * leaves `stage` null — which the fallback used to render as "it never
   * started". Measured on the simulator: the canvas reported a render error,
   * so it had plainly started, and the message sent the reader hunting a parse
   * error that did not exist.
   */
  const [started, setStarted] = useState(false);
  /**
   * The last thing the canvas said, whatever its phase.
   *
   * A `runtime` error is deliberately NOT fatal — replacing a working canvas
   * because one handler threw would be the worse failure — but when the
   * WATCHDOG then fires, this is the only description of what went wrong that
   * exists on this side of the bridge, and it was being thrown away. Measured
   * on the iPhone 16e simulator: the fallback read "it started and reported a
   * problem" while holding the problem's text and printing none of it.
   */
  const lastReport = useRef<string | null>(null);
  const [stage, setStage] = useState<BootStage | null>(null);
  const [failure, setFailure] = useState<{
    reason: GraphFallbackReason;
    message?: string;
  } | null>(null);

  /**
   * THE DOM ENTRY GETS A REF THIS COMPONENT OWNS, AND NEVER THE CONSUMER'S.
   *
   * `expo/dom`'s `RawWebView` installs its imperative proxy in the RENDER body,
   * guarded by `ref.current == null`, and nothing nulls it afterwards — React
   * does not manage a ref a component assigns to itself. Hand it the same ref
   * object twice and the second WebView never publishes a proxy: the first
   * one's is still sitting there, the guard is false, and every command goes on
   * forwarding into a WebView that has been torn down. Nothing throws. The
   * canvas paints and pans. The buttons stop working.
   *
   * That is one bug behind two of the m6 device findings. `Tidy` never answered
   * on either Android emulator — and BOTH had come up through the watchdog +
   * Retry path, which is `attempt + 1`, a keyed remount, while iOS never did.
   * `Perf200`'s culling toggle was a `key` on `<NodeGraph>`, so culling-off was
   * only reachable through a remount, and its `perfStart` / `perfStop` both went
   * to the dead proxy — leaving the readout on `sampling…` forever.
   *
   * Nulling the shared ref is NOT the fix: React renders the new subtree before
   * it runs the old one's cleanups, so a null on unmount lands after the new
   * instance has already skipped its install, and wipes the proxy that was
   * about to work. The fix is to stop sharing. A fresh object per `attempt`, so
   * a Retry-recreated WebView always sees `null` and installs; and the
   * consumer's `graphRef` is published through a stable forwarder below — the
   * same shape `NodeGraphWeb` uses for `commandSlot`, for the same reason.
   */
  const entryRef = useMemo<{ current: NodeGraphDomHandle | null }>(() => ({ current: null }), [attempt]);
  // Read through a ref so the forwarder can be built ONCE. A forwarder rebuilt
  // per attempt would hand a sibling toolbar a new object mid-session.
  const liveRef = useRef(entryRef);
  liveRef.current = entryRef;

  /**
   * The consumer's handle: stable, and null-safe by construction.
   *
   * Written out rather than looped over `graphCommandNames`, for the reason the
   * shell writes its thirteen out — annotating the literal `NodeGraphHandle` is
   * what makes a command added to the interface and forgotten here a BUILD
   * error rather than a button that silently does nothing on a phone.
   */
  const handle = useMemo<NodeGraphHandle>(
    () => ({
      fitView: () => liveRef.current.current?.fitView(),
      relayout: () => liveRef.current.current?.relayout(),
      zoomTo: (zoom) => liveRef.current.current?.zoomTo(zoom),
      centerOn: (nodeId) => liveRef.current.current?.centerOn(nodeId),
      setSelection: (ids) => liveRef.current.current?.setSelection(ids),
      exportViewport: () => liveRef.current.current?.exportViewport(),
      undo: () => liveRef.current.current?.undo(),
      redo: () => liveRef.current.current?.redo(),
      perfStart: (label) => liveRef.current.current?.perfStart(label),
      perfStop: (label) => liveRef.current.current?.perfStop(label),
      perfMark: (label) => liveRef.current.current?.perfMark(label),
      setViewport: (x, y, zoom) => liveRef.current.current?.setViewport(x, y, zoom),
      synthPinch: (scale, steps) => liveRef.current.current?.synthPinch(scale, steps),
    }),
    [],
  );
  useImperativeHandle(props.graphRef, () => handle, [handle]);

  // A new attempt is a new WebView, so everything the last one reported is
  // stale. Resetting here rather than in the retry handler keeps the two in
  // step even if a consumer remounts us for its own reasons.
  useEffect(() => {
    setReady(false);
    setPainted(false);
    setStage(null);
    setStarted(false);
    setFailure(null);
    lastReport.current = null;
    // A new attempt must not be judged on the previous one's failure; the
    // diagnostics panel reads this slot on the Hermes side.
    resetGraphError();
  }, [attempt]);

  /**
   * The watchdog. It stops on the FIRST of paint or ready, which in practice is
   * always paint — `ready` cannot arrive before the canvas has painted, and it
   * is held back another 1800 ms after that on purpose.
   *
   * `ready` stays in the condition anyway rather than being replaced by it: a
   * canvas that somehow reported ready without a paint marker is alive, and a
   * watchdog that killed it on a missing marker would be a new way to fail.
   */
  useEffect(() => {
    if (ready || painted || restarting) {
      return;
    }
    const timer = setTimeout(() => {
      setFailure({ reason: 'no-ready', message: lastReport.current ?? undefined });
    }, timeout);
    return () => {
      clearTimeout(timer);
    };
  }, [attempt, painted, ready, restarting, timeout]);

  /**
   * Phase two of the retry: one commit with no WebView, then a new one.
   *
   * `setRestarting(false)` in an effect rather than in the click handler is the
   * whole mechanism — the render between them is the one that unmounts.
   */
  useEffect(() => {
    if (!restarting) {
      return;
    }
    setRestarting(false);
  }, [restarting]);

  const onEvent = useCallback(
    async (eventJson: string) => {
      setStarted(true);
      let event: GraphEventWire;
      try {
        event = decodeGraphEvent(eventJson);
      } catch (error) {
        // A tag this build does not know means the DOM bundle and this host are
        // out of step. That is worth surfacing, not swallowing.
        onError?.({
          t: 'error',
          phase: 'runtime',
          message: error instanceof Error ? error.message : String(error),
        });
        return;
      }
      // Before the switch, and before any typed callback: a consumer reading the
      // raw channel should see an event even when a handler below throws.
      onGraphEvent?.(event);
      switch (event.t) {
        case 'ready': {
          setReady(true);
          setStage(event.diagnostics.stage);
          onReady?.(event.diagnostics);
          return;
        }
        case 'commit': {
          onCommit?.(event.rev, event.commandsJson);
          return;
        }
        case 'selection': {
          onSelection?.(event.ids);
          return;
        }
        case 'viewport': {
          onViewport?.(event.viewport);
          return;
        }
        case 'nodeActivate': {
          onNodeActivate?.(event.id);
          return;
        }
        case 'connectRefused': {
          onConnectionRefused?.(event.code, event.message);
          return;
        }
        case 'haptic': {
          onHaptic?.(event.kind);
          return;
        }
        case 'metrics': {
          return;
        }
        case 'paint': {
          setPainted(true);
          onPaint?.(event.bootMs);
          return;
        }
        case 'layoutResult': {
          onLayoutResult?.({
            runner: event.runner,
            ms: event.ms,
            nodeCount: event.nodeCount,
            error: event.error,
          });
          return;
        }
        case 'perfReport': {
          onPerfReport?.(event.report);
          return;
        }
        case 'lasso': {
          onLasso?.(event);
          // A lasso that armed is the moment design §7.3 L3 asks for a buzz,
          // and the shell is the only thing that can produce one. The hint
          // rides the event; acting on it is still the consumer's call.
          if (event.haptic) {
            onHaptic?.(event.haptic);
          }
          return;
        }
        case 'error': {
          lastReport.current = `${event.phase}: ${event.message}`;
          // The canvas and this host are different JS realms, so the panel of
          // design 9.5 — which reads a global — can never see what the WebView
          // recorded. Copying it across is what makes `NodeGraph/Diagnostics`
          // able to report a DOM-side failure at all.
          recordGraphError({ phase: event.phase, message: event.message, stack: event.stack });
          // `module` and `render` are fatal to the canvas; `runtime` is not,
          // and replacing a working canvas with a fallback because one handler
          // threw would be the worse failure.
          if (event.phase !== 'runtime') {
            setFailure({
              reason: event.phase === 'boot' ? 'no-ready' : event.phase,
              message: event.message,
            });
          }
          onError?.(event);
          return;
        }
      }
    },
    [
      onCommit,
      onConnectionRefused,
      onError,
      onGraphEvent,
      onHaptic,
      onLasso,
      onLayoutResult,
      onNodeActivate,
      onPaint,
      onPerfReport,
      onReady,
      onSelection,
      onViewport,
    ],
  );

  const envelopeJson = useMemo(() => JSON.stringify(envelope), [envelope]);
  const optionsJson = useMemo(() => JSON.stringify(options ?? {}), [options]);
  const domProps = useMemo(() => ({ ...defaultDomProps, ...props.dom }), [props.dom]);
  const entry = props.domEntry ?? getNodeGraphDomEntry();

  /**
   * No entry is not a timeout and must not read like one. Reported before a
   * WebView is even created, because there is nothing to wait for: the canvas
   * would come up, fail to find a config, and say so four seconds later.
   */
  if (!entry) {
    return (
      <GraphFallback
        message={
          'no DOM entry supplied — pass `domEntry`, or call `setNodeGraphDomEntry` ' +
          "with a module whose first statement is 'use dom' and which imports the " +
          "app's tamagui config and schema registration."
        }
        reason="no-dom-entry"
        stage={null}
        started={false}
      />
    );
  }

  if (failure) {
    return (
      <GraphFallback
        message={failure.message}
        onRetry={() => {
          setRestarting(true);
          setAttempt((value) => value + 1);
        }}
        reason={failure.reason}
        stage={stage}
        started={started}
        // Only the timeout waited. A reported `module` or `render` failure came
        // back when it came back, and printing a budget beside it would read as
        // if the budget were the cause.
        waitedMs={failure.reason === 'no-ready' ? timeout : undefined}
      />
    );
  }

  // The one commit with no WebView. See `restarting`: a new `key` alone did not
  // recover emulator-5590, because the old WebView was still tearing down.
  if (restarting) {
    return null;
  }

  // `createElement`, not JSX: `entry` is a value chosen at runtime and JSX on a
  // lowercase-bound component reads as an intrinsic element.
  return createElement(entry, {
    key: attempt,
    dom: domProps,
    documentJson,
    envelopeJson,
    onEvent,
    optionsJson,
    // This component's own, one per attempt. Never `props.graphRef`: see
    // `entryRef` above — a ref object the entry writes into is a ref object
    // only the entry may own, and the consumer reaches the same commands
    // through the forwarder `useImperativeHandle` publishes.
    ref: entryRef,
    rev,
    schemaId,
  });
}
