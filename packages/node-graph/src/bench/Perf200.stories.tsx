/**
 * `NodeGraph/Perf200` — the story every number in design §13.2 is taken on.
 *
 * MILESTONE 6 MOVED THE SAMPLER INTO THE CANVAS, and that is what makes a
 * device number possible at all. This file used to own it, inside a `<Harness/>`
 * rendered as a CHILD of `<NodeGraph>` — and `NodeGraph.native.tsx` accepts
 * children and ignores them. So on the iPhone 16e simulator and both emulators
 * this story painted 200 nodes with no Start, no Stop, no toggle and no
 * readout. Proven in the artefact as well as on the screen: `__mpoPerf200`
 * appears 0 times in the emitted www.bundle while `hermes-inline` appears 6.
 *
 * The sampler now runs in `GraphCommandBridge`, inside whichever realm the
 * canvas paints in, and is driven by `perfStart` / `perfStop` / `perfMark` on
 * the imperative handle. Its report comes back on the wire as
 * `{ t: "perfReport" }`. That is the only correct place for it either way: the
 * host RN view's frame clock keeps ticking while the WebView is stalled, so a
 * Hermes-side sampler would measure the wrong thing even if children worked.
 *
 * What still lives here, and only here:
 *
 *  1. **A culling toggle.** `onlyRenderVisibleElements` is the single largest
 *     win at 200 nodes (design §5: node drag 25.71 ms → 10.58 ms at 4x), so a
 *     run that forgot to turn it on and a run that deliberately turned it off
 *     have to be distinguishable in the data rather than in someone's memory.
 *     It is a PROP, so it crosses the bridge as an option — and it FLIPS IN
 *     PLACE. It was keyed on the canvas until the m6 device pass, which is a
 *     remount per toggle: sampler discarded, viewport reset, handle dead.
 *  2. **A plain-div control condition.** Design §13.2 asks for one in every
 *     session so the Tamagui cost is MEASURED rather than carried over from
 *     the web's ~10%. `Control` renders the same graph, the same edges and the
 *     same React Flow `Handle`s — only the node BODY changes, from the
 *     package's `GraphNode` frame to a bare styled `div`.
 *
 *     THE SCHEMA ITSELF LEFT THIS FILE after the m6 device pass, and that is
 *     the whole of the fix. A `render` is a component, so only `schemaId`
 *     crosses the bridge and a schema built in a story — which runs on the
 *     Hermes side — is unreachable from the realm that has to render it. On the
 *     iPhone 16e this story reported `render: no graph schema registered as
 *     "node-graph-demo-control"` and painted nothing. It lives in
 *     `react-flow/demoControlBody.tsx` now, and the Kitchen Sink's `'use dom'`
 *     entry registers it beside the demo schema through `schemas`.
 *  3. **A `window.__mpoPerf200` handle.** Browser automation cannot press a
 *     Tamagui button reliably across an emulated touch surface, and the
 *     measurement has to start and stop on exact frames. It is story-only and
 *     it now forwards to `graphRef`, so web automation and a device tap drive
 *     exactly the same code.
 */

import { Button } from '@repo/forms';
import { pressTargetStyle } from '@repo/theme';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SizableText, XStack, YStack } from 'tamagui';

import type { FrameStats } from '../bench/frameSampler';
import { gestureEndMark, gestureStartMark } from '../bench/frameSampler';
import type { GraphEventWire, PerfReportWire } from '../dom/wire';
import { hasDomRealm } from '../native/DomOnlyStory';
import { NodeGraph } from '../NodeGraph';
import { demoControlSchema } from '../react-flow/demoControlBody';
import { demoGraphSchema } from '../react-flow/demoNodeBody';
import type { NodeGraphHandle } from '../react-flow/graphHandle';
import { Background, Controls, reactFlowNodeSelector } from '../react-flow/xy';

import { generateBenchGraph } from './generateGraph';

const benchSeed = 1;
const benchCount = 200;

const tamaguiSchema = demoGraphSchema();

const plainSchema = demoControlSchema();

const meta: Meta<typeof NodeGraph> = {
  title: 'NodeGraph/Perf200',
  component: NodeGraph,
  parameters: {
    status: { type: 'beta' },
    layout: 'fullscreen',
    nativeGallery: { scroll: false },
    docs: {
      description: {
        component:
          'The measurement harness for design 13.2. 200 nodes and ~400 edges from a mulberry32 seed, so five runs look at the same graph. The frame sampler reads requestAnimationFrame deltas from INSIDE the canvas — the realm that paints, which on native is the WebView and not Hermes — and REFUSES to report a run where nothing moved, because a silently reset touch emulation produces perfectly plausible numbers for an idle page. Start and Stop are native siblings driving perfStart/perfStop on the imperative handle; the report comes back on the wire. Control renders the same graph with plain-div node bodies, which is how the Tamagui cost gets measured instead of assumed.',
      },
    },
  },
};
export default meta;

type Story = StoryObj<typeof NodeGraph>;

/** What automation drives. Every method reaches the canvas through `graphRef`. */
interface HandleShape {
  readonly start: (label?: string) => void;
  readonly stop: (label?: string) => void;
  readonly mark: (label: string) => void;
  /** Brackets one scripted gesture. The readout's p95 is over these frames alone. */
  readonly markStart: () => void;
  readonly markEnd: () => void;
  /** The last `{ t: "perfReport" }`, or null. `stop()` answers here, not by return. */
  readonly report: () => PerfReportWire | null;
  readonly relayout: () => void;
  readonly setCulling: (on: boolean) => void;
  readonly info: () => unknown;
  /** Five runs have to start from the same place, or the median of five is of five experiments. */
  readonly setViewport: (viewport: { x: number; y: number; zoom: number }) => void;
  /**
   * A synthetic two-finger pinch, dispatched inside the canvas's own realm.
   * Reported separately and flagged synthetic — see the handle's own note.
   */
  readonly startPinch: (options?: { readonly scale?: number; readonly steps?: number }) => void;
}

function line(stats: FrameStats): string {
  return (
    `${stats.samples} frames · p95 ${stats.p95.toFixed(1)} ms · mean ${stats.mean.toFixed(1)} ms · ` +
    `worst ${stats.worst.toFixed(1)} ms · >33.3 ${stats.over33_3}`
  );
}

/**
 * The GESTURE cell when the run bracketed one, and only then.
 *
 * Design §13.2's cell is the frames a gesture produced. The m6 iOS number was
 * the whole Start-to-Stop window, six scripted pans and every idle frame
 * between them, and it shipped with that caveat attached because there was no
 * way to subtract them. A run with no marks still prints the whole window,
 * labelled as one, rather than pretending to be something it is not.
 */
function summarize(report: PerfReportWire | null): string {
  if (!report) {
    return 'idle';
  }
  if (!report.ok) {
    const bracket = report.gesture ? ` · ${report.gesture.segments} gesture(s) marked` : '';
    return `DISCARDED (${report.reason}) — ${report.message ?? ''}${bracket}`;
  }
  const { stats } = report;
  if (!stats) {
    return 'reported, no stats';
  }
  const { gesture } = report;
  if (!gesture) {
    return `WHOLE WINDOW (no gesture marked) · ${line(stats)} · didMove true`;
  }
  const open = gesture.unclosed > 0 ? ' · 1 UNCLOSED, closed at Stop' : '';
  return (
    `GESTURE ${gesture.segments}× · ${line(gesture.stats)} · idle ${gesture.idleFrames}${open}\n` +
    `whole window · ${line(stats)} · didMove true`
  );
}

function Bench({ variant }: { readonly variant: 'tamagui' | 'control' }) {
  const [culling, setCulling] = useState(true);
  const [report, setReport] = useState<PerfReportWire | null>(null);
  const [sampling, setSampling] = useState(false);
  const [layoutRunner, setLayoutRunner] = useState('not run yet');
  /**
   * THE WIRE, counted — the instrument the m6 device pass did not have.
   *
   * Culling OFF sat on `sampling…` twice, and from the screen that could mean
   * three different things: the Stop never crossed the bridge, the Stop crossed
   * and the canvas had no run in flight, or the canvas is not there at all.
   * They are three different bugs. This counter answers the third directly and
   * the first two together — every event the canvas emits lands here, so a
   * climbing count beside a stuck `sampling…` says the canvas is alive and the
   * COMMAND is what is not arriving. `perfReport`'s `notStarted` reason splits
   * the remaining two.
   */
  const [wire, setWire] = useState({ events: 0, last: '—' });
  /**
   * Whether a gesture bracket is open, so ONE button can drive both marks.
   *
   * One button, not two, because the operator is holding a phone and a missed
   * tap is the failure mode: a button whose label says what pressing it will do
   * is drivable by the `mobile` MCP and readable in a screenshot. The segment
   * count beside it is how a missed tap is caught afterwards.
   */
  const [inGesture, setInGesture] = useState(false);
  const [marked, setMarked] = useState(0);
  const graph = useRef<NodeGraphHandle>(null);
  const lastReport = useRef<PerfReportWire | null>(null);

  const benchDocument = useMemo(() => generateBenchGraph({ count: benchCount, seed: benchSeed }), []);

  const onGraphEvent = useCallback((event: GraphEventWire) => {
    setWire((seen) => ({ events: seen.events + 1, last: event.t }));
    if (event.t === 'perfReport') {
      lastReport.current = event.report;
      setReport(event.report);
      setSampling(false);
      return;
    }
    if (event.t === 'layoutResult') {
      setLayoutRunner(event.runner);
    }
  }, []);

  const start = useCallback((label = 'run') => {
    setReport(null);
    setSampling(true);
    setInGesture(false);
    setMarked(0);
    graph.current?.perfStart(label);
  }, []);

  const stop = useCallback((label = 'run') => {
    graph.current?.perfStop(label);
  }, []);

  /**
   * The bracket, driven by a native SIBLING — which is the only place a device
   * control can live (design §9.1.1). `perfMark` was on the handle already and
   * nothing on a phone could reach it: the story's `window.__mpoPerf200` is a
   * Hermes-side global, unreachable from idb and from the `mobile` MCP.
   */
  const markGesture = useCallback(() => {
    setInGesture((open) => {
      if (open) {
        graph.current?.perfMark(gestureEndMark);
        setMarked((count) => count + 1);
        return false;
      }
      graph.current?.perfMark(gestureStartMark);
      return true;
    });
  }, []);

  useEffect(() => {
    const value: HandleShape = {
      start,
      stop,
      mark: (label) => graph.current?.perfMark(label),
      markStart: () => graph.current?.perfMark(gestureStartMark),
      markEnd: () => graph.current?.perfMark(gestureEndMark),
      report: () => lastReport.current,
      relayout: () => graph.current?.relayout(),
      setCulling,
      info: () => ({
        variant,
        culling,
        nodeCount: benchCount,
        // Reported by the canvas over the wire, so on device this is the
        // WebView's answer and not a Hermes-side guess.
        layoutRunner,
        // Through `reactFlowNodeSelector`, never the literal: the class is part
        // of @xyflow's DOM contract and `xy.ts` is the one place that contract
        // is reconciled (lint-conventions, GRAPH VARS COVERAGE).
        mounted: hasDomRealm ? globalThis.document.querySelectorAll(reactFlowNodeSelector).length : null,
      }),
      setViewport: (viewport) => graph.current?.setViewport(viewport.x, viewport.y, viewport.zoom),
      startPinch: ({ scale = 1.6, steps = 30 } = {}) => graph.current?.synthPinch(scale, steps),
    };
    (globalThis as unknown as { __mpoPerf200?: HandleShape }).__mpoPerf200 = value;
    return () => {
      delete (globalThis as unknown as { __mpoPerf200?: HandleShape }).__mpoPerf200;
    };
  }, [culling, layoutRunner, start, stop, variant]);

  return (
    <YStack
      width="100%"
      height={hasDomRealm ? 700 : undefined}
      flex={hasDomRealm ? undefined : 1}
      minHeight={0}
      padding="$3"
      gap="$2">
      <SizableText
        size="$2"
        opacity={0.7}>
        {hasDomRealm
          ? "200 nodes, ~400 edges, one seed. Start, then bracket each pan with Gesture start / Gesture end, then Stop. The readout's p95 and mean are over the BRACKETED frames only; the idle frames between pans are counted, not mixed in. A run where nothing moved is DISCARDED by the reporter and says so, rather than printing plausible numbers."
          : 'Start, mark each pan with Gesture start / end, then Stop to read the result.'}
      </SizableText>
      {/* OUTSIDE the canvas. These were children until milestone 6, which is why
          no device ever had a Start button. */}
      <XStack
        gap="$2"
        alignItems="center"
        flexWrap="wrap">
        <Button
          size="$2"
          {...(hasDomRealm ? {} : pressTargetStyle())}
          disabled={sampling}
          onPress={() => {
            start('run');
          }}>
          Start
        </Button>
        <Button
          size="$2"
          {...(hasDomRealm ? {} : pressTargetStyle())}
          disabled={!sampling}
          onPress={() => {
            stop('run');
          }}>
          Stop
        </Button>
        {/*
          Design §13.2's cell is the frames a GESTURE produced. Without this the
          window runs Start to Stop and holds every idle frame between one
          scripted pan and the next — which is exactly the caveat the m6 iOS
          number shipped with.
        */}
        <Button
          size="$2"
          {...(hasDomRealm ? {} : pressTargetStyle())}
          disabled={!sampling}
          onPress={markGesture}>
          {inGesture ? 'Gesture end' : 'Gesture start'}
        </Button>
        <Button
          size="$2"
          {...(hasDomRealm ? {} : pressTargetStyle())}
          onPress={() => graph.current?.relayout()}>
          Tidy
        </Button>
        {/*
          Disabled mid-run, not because the flip is expensive — it is a prop
          now — but because a culling change inside a sampled window silently
          changes what the window measured.
        */}
        <Button
          size="$2"
          {...(hasDomRealm ? {} : pressTargetStyle())}
          disabled={sampling}
          onPress={() => {
            setCulling((on) => !on);
          }}>
          {culling ? 'Culling ON' : 'Culling OFF'}
        </Button>
      </XStack>
      <XStack
        gap="$3"
        alignItems="center"
        flexWrap="wrap">
        <SizableText
          size="$2"
          opacity={0.7}
          fontFamily="$mono">
          {`${variant} · ${benchCount} nodes · runner ${layoutRunner}`}
        </SizableText>
        {/* A climbing count beside a stuck readout says the canvas is alive and
            the COMMAND is what never arrived. */}
        <SizableText
          size="$2"
          opacity={0.7}
          fontFamily="$mono">
          {`wire ${wire.events} · last ${wire.last}`}
        </SizableText>
        <SizableText
          size="$2"
          opacity={0.7}
          fontFamily="$mono">
          {`gestures ${marked}${inGesture ? ' · one OPEN' : ''}`}
        </SizableText>
      </XStack>
      <SizableText
        size="$2"
        fontFamily="$mono">
        {sampling ? 'sampling…' : summarize(report)}
      </SizableText>
      <YStack
        flex={1}
        minHeight={0}>
        {/*
          NO `key`. `onlyRenderVisibleElements` is an ordinary React Flow prop
          and flips in place; keying the canvas on it threw the canvas away and
          built a new one on every toggle, which on a phone is not a slow
          toggle but a lost harness — the remount discarded the frame sampler
          mid-session, reset the viewport so five runs started from five
          different states, and killed the imperative handle outright, which is
          why culling OFF sat on `sampling…` forever
          (`native/graphHandleRemount.spec.tsx`).
        */}
        <NodeGraph
          schema={variant === 'tamagui' ? tamaguiSchema : plainSchema}
          defaultDocument={benchDocument}
          onlyRenderVisibleElements={culling}
          fitView={false}
          graphRef={graph}
          onGraphEvent={onGraphEvent}>
          {hasDomRealm ? (
            <>
              <Background />
              <Controls />
            </>
          ) : null}
        </NodeGraph>
      </YStack>
    </YStack>
  );
}

/** The cell every design §13.2 web and device number is taken in. */
export const Main: Story = {
  render: () => <Bench variant="tamagui" />,
};

/**
 * The control. Same graph, same edges, same handles, plain-div bodies.
 * The delta between this and `Main` IS the Tamagui cost, measured.
 */
export const Control: Story = {
  render: () => <Bench variant="control" />,
};
