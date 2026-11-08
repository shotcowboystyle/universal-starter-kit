/**
 * The one place the imperative handle is IMPLEMENTED, for both realms.
 *
 * Milestone 6's rule (design §9.1): on native a consumer cannot put React
 * children inside the canvas, so a control is either a native SIBLING driving
 * the canvas through the handle, or it is rendered inside the DOM bundle from
 * serializable options. That makes the handle load-bearing rather than
 * decorative, and a handle implemented twice — once for the WebView and once
 * for the web — is two implementations that drift. `NodeGraphWeb` mounts this
 * and publishes the result through `graphRef`; `NodeGraphDomInner` mounts the
 * same component and lets the shell forward it across the bridge.
 *
 * It is a CHILD of `ReactFlow` because `useReactFlow()` throws outside the
 * provider the canvas mounts itself, and a child of `GraphActionsProvider`
 * because `relayout` / `undo` / `redo` live on the controller. It renders
 * `null`: nothing here paints.
 *
 * THE SAMPLER LIVES HERE TOO, and that is the milestone-6 change that unblocks
 * every device frame number. `Perf200` used to own it, as a CHILD of
 * `<NodeGraph>` — which native drops — so `window.__mpoPerf200` appeared zero
 * times in the emitted www.bundle and no device run was possible at all. The
 * sampler has to run in the realm that PAINTS: the host RN view's frame clock
 * keeps ticking while the WebView is stalled, so it measures the wrong thing by
 * construction.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';

import type { FrameRun } from '../bench/frame-sampler';
import { createDomTransformProbe, createFrameSampler, gestureWindow, reportRun } from '../bench/frame-sampler';
import type { GraphEventWire, PerfReportWire } from '../dom/wire';

import type { GraphCommandSlot } from './graph-handle';
import { useGraphActions } from './GraphActions';
import { reactFlowNodeSelector, reactFlowPaneSelector, reactFlowViewportSelector, useReactFlow } from './xy';

export interface GraphCommandBridgeProps {
  /** Filled once React Flow is reachable, emptied on unmount. */
  readonly commands: GraphCommandSlot;
  /** The single channel. `onEvent` on the DOM side; a story collector on web. */
  readonly emit: (event: GraphEventWire) => void;
  /** `react-flow-dom` or `react-flow-web`. Recorded on every perf report. */
  readonly host: string;
  /** Whether `onlyRenderVisibleElements` is on, recorded on every perf report. */
  readonly culling: boolean;
  /** The canvas root, so two canvases on one page do not measure each other. */
  readonly rootRef: { current: HTMLElement | null };
  /** The DOM realm stamps its boot record here. Web passes nothing. */
  readonly onMounted?: () => void;
}

/**
 * A rejected run crosses the bridge too.
 *
 * `reportRun` discards a run where nothing moved (design §13.2, and the
 * reactflow spike lost a whole round of measurements to a silently reset touch
 * emulation). On a phone a Stop that produced nothing and a Stop that never
 * reached the canvas look identical, so the rejection is reported as a
 * rejection rather than as silence.
 */
const toWire = (
  run: FrameRun,
  label: string,
  context: { host: string; culling: boolean; nodeCount: number; layoutRunner: string },
): PerfReportWire => {
  const result = reportRun(run, { ...context, label });
  if (!result.ok) {
    return {
      ok: false,
      reason: result.error.reason,
      message: result.error.message,
      label,
      nodeCount: run.nodeCount || context.nodeCount,
      culling: context.culling,
      layoutRunner: context.layoutRunner,
      didMove: run.didMove,
      durationMs: run.stoppedAt - run.startedAt,
      stats: run.stats,
      // Carried on a REJECTION too: a run discarded for `didMove` still says
      // how many gestures were bracketed, which is what tells an operator
      // whether the marks were the thing that went wrong.
      gesture: gestureWindow(run),
      reportJson: '',
    };
  }
  return {
    ok: true,
    label,
    nodeCount: result.value.nodeCount,
    culling: result.value.culling,
    layoutRunner: result.value.layoutRunner ?? context.layoutRunner,
    didMove: true,
    durationMs: result.value.durationMs,
    stats: result.value.stats,
    gesture: result.value.gesture,
    reportJson: JSON.stringify(result.value),
  };
};

const selectOnly = <T extends { readonly id: string }>(nodes: readonly T[], wanted: ReadonlySet<string>): T[] =>
  nodes.map((node) => ({ ...node, selected: wanted.has(node.id) }));

export const GraphCommandBridge = ({ commands, culling, emit, host, onMounted, rootRef }: GraphCommandBridgeProps) => {
  const flow = useReactFlow();
  const actions = useGraphActions();

  // Read through a ref so the command object below is built ONCE. A relayout
  // flips `layoutPending` twice, and rebuilding the whole handle on each flip
  // would hand the shell a new object mid-gesture.
  const latest = useRef({ actions, culling, host });
  // oxlint-disable-next-line react/refs -- latest-value ref, written every render by design
  latest.current = { actions, culling, host };

  const probe = useMemo(
    () =>
      createDomTransformProbe({
        viewport: reactFlowViewportSelector,
        node: reactFlowNodeSelector,
        // oxlint-disable-next-line react/refs -- the root element is attached before the canvas mounts this bridge
        root: rootRef.current ?? undefined,
      }),
    [rootRef],
  );

  const countNodes = useCallback(() => {
    const root = rootRef.current ?? globalThis.document;
    return root?.querySelectorAll(reactFlowNodeSelector).length ?? 0;
  }, [rootRef]);

  // oxlint-disable-next-line react/refs -- `countNodes` is stored by the sampler and only called from rAF, never during render
  const sampler = useMemo(() => createFrameSampler({ probeTransform: probe, countNodes }), [countNodes, probe]);

  useEffect(() => {
    onMounted?.();
    // oxlint-disable-next-line react/immutability -- `commands` is the imperative slot this bridge exists to fill
    commands.current = {
      fitView: () => {
        void flow.fitView();
      },
      /**
       * It was a NO-OP and the comment said so: milestone 4 would fill it in,
       * and milestone 4 built the engine and never came back. `layoutRunner`
       * therefore read `none` on every device — not because the probe failed,
       * but because nothing on a phone could ask for a layout.
       */
      relayout: () => {
        void (async () => {
          try {
            const result = await latest.current.actions.relayout();
            emit({
              t: 'layoutResult',
              // `none` is honest for an empty graph: no engine ran, so no runner
              // produced anything, and inventing one would be a reading.
              runner: result?.runner ?? 'none',
              ms: result?.ms ?? 0,
              nodeCount: latest.current.actions.nodeCount,
            });
          } catch (error) {
            /**
             * A REJECTION ANSWERS TOO, and this is the second way the m6 Android
             * Tidy could have gone silent.
             *
             * `layout()` rejects when the blob Worker cannot be constructed or
             * dies mid-flight, and both are realm-local: a Retry-recreated
             * WebView builds a new blob URL and a new Worker, and either can
             * fail on its own. With only a `.then` the rejection went to
             * `unhandledrejection` — reported as a non-fatal `runtime` error,
             * correctly — and no `layoutResult` ever crossed. The toolbar then
             * sits on "laying out…" forever, which from the outside is
             * identical to a Tidy that never reached the canvas at all.
             *
             * `runner: "none"` and `ms: 0` because inventing either would read
             * as a successful tidy; the message is what says otherwise.
             */
            emit({
              t: 'layoutResult',
              runner: 'none',
              ms: 0,
              nodeCount: latest.current.actions.nodeCount,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        })();
      },
      zoomTo: (zoom) => {
        void flow.zoomTo(zoom);
      },
      centerOn: (nodeId) => {
        void flow.fitView({ nodes: [{ id: nodeId }], duration: 200 });
      },
      setSelection: (ids) => {
        const wanted = new Set(ids);
        flow.setNodes((nodes) => selectOnly(nodes, wanted));
        emit({ t: 'selection', ids: [...wanted] });
      },
      exportViewport: () => {
        emit({ t: 'viewport', viewport: flow.getViewport() });
      },
      undo: () => {
        latest.current.actions.undo();
      },
      redo: () => {
        latest.current.actions.redo();
      },
      perfStart: () => {
        sampler.start();
      },
      perfMark: (label) => {
        sampler.mark(label);
      },
      setViewport: (x, y, zoom) => {
        // No `duration`: an animated move is still moving when the sampler
        // starts, and the first frames of every run would measure the seek.
        void flow.setViewport({ x, y, zoom });
      },
      /**
       * Synthesised pinch, design §13.2. Dispatched on the PANE, because that
       * is the element d3-zoom binds its touch listener to.
       *
       * It moved in here from the Perf200 story in milestone 6 for the reason
       * everything else did: the pane exists only in the realm the canvas
       * paints in, and on native that realm is the WebView. A story on the
       * Hermes side has no pane to dispatch on.
       */
      synthPinch: (scale, steps) => {
        const root = rootRef.current ?? globalThis.document;
        const pane = root?.querySelector<HTMLElement>(reactFlowPaneSelector);
        if (!pane) {
          return;
        }
        // A desktop Chrome with no touch emulation has no `Touch` constructor
        // at all. Returning is honest: "the pinch did nothing" and "the browser
        // has no touch" are different findings and only one is a bug. The
        // caller learns which from the perf run's own `didMove`.
        // oxlint-disable-next-line anti-slop/no-runtime-typeof -- `Touch` may be an undeclared global; a bare reference would throw
        if (typeof Touch !== 'function' || typeof TouchEvent !== 'function') {
          return;
        }
        const box = pane.getBoundingClientRect();
        const cx = box.left + box.width / 2;
        const cy = box.top + box.height / 2;
        const point = (id: number, x: number, y: number) =>
          new Touch({ identifier: id, target: pane, clientX: x, clientY: y });
        const send = (type: string, points: Touch[]) => {
          pane.dispatchEvent(
            new TouchEvent(type, {
              bubbles: true,
              cancelable: true,
              touches: points,
              targetTouches: points,
              changedTouches: points,
            }),
          );
        };
        const spread = 60;
        const total = Math.max(1, Math.round(steps));
        send('touchstart', [point(1, cx - spread, cy), point(2, cx + spread, cy)]);
        let step = 0;
        const advance = () => {
          step += 1;
          const factor = 1 + (scale - 1) * (step / total);
          const half = spread * factor;
          send('touchmove', [point(1, cx - half, cy), point(2, cx + half, cy)]);
          if (step < total) {
            globalThis.requestAnimationFrame(advance);
          } else {
            send('touchend', []);
          }
        };
        globalThis.requestAnimationFrame(advance);
      },
      perfStop: (label) => {
        const run = sampler.stop();
        emit({
          t: 'perfReport',
          report: toWire(run, label, {
            culling: latest.current.culling,
            host: latest.current.host,
            layoutRunner: latest.current.actions.layoutRunner,
            nodeCount: latest.current.actions.nodeCount,
          }),
        });
      },
    };
    return () => {
      commands.current = null;
    };
  }, [commands, emit, flow, onMounted, rootRef, sampler]);

  return null;
};
