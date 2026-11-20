/**
 * `NodeGraph/AutoLayout` — design §8, and the place tasks 4.3 and 4.4 are
 * carried out by hand.
 *
 * MILESTONE 6 REBUILT IT AS A SIBLING. Every control on this page used to be a
 * `children` of `<NodeGraph>` — Tidy, Undo, Redo, the runner readout — and
 * `NodeGraph.native.tsx` accepts children and IGNORES them by written contract.
 * So on the iPhone 16e simulator and both emulators this story painted twelve
 * scrambled nodes and offered no way to lay them out, `layoutRunner` read
 * `none` on every host, and MPO-213's device criterion could not be attempted
 * at all. Nothing threw; the canvas looked fine.
 *
 * The toolbar is now OUTSIDE the canvas and drives it through `graphRef`, which
 * is design §9.1's imperative handle and the same eleven commands on both
 * platforms. The runner and the engine milliseconds come back on the wire as
 * `{ t: "layoutResult" }` rather than being read out of a context that only
 * exists inside the canvas.
 *
 *  - `Main` prints the RESOLVED RUNNER and the engine ms. On web that must read
 *    `worker-blob`, and inside the Kitchen Sink's WebView it must read
 *    `worker-blob` TOO — see the correction below. An `inline` reading on a
 *    platform that has `Worker` is a FAILURE, not a slower pass (design §13.2),
 *    and the readout paints it as one rather than showing a word nobody looks
 *    twice at. A relayout that REJECTS is painted as a failure as well, because
 *    before milestone 6's device pass it was painted as nothing at all.
 *  - `Undo` is task 4.4: tidy, undo, and the graph returns exactly. The
 *    positions are printed as a checksum so "exactly" is checkable instead of
 *    eyeballed. WEB ONLY, because the checksum reads every node's CSS transform
 *    and the nodes are inside the WebView; the device half of 4.4 is the Undo
 *    button working at all, which the toolbar now allows.
 *  - `Large200` is the 200-node graph the "a relayout never blocks a frame"
 *    measurement is taken on. It parks a `window.__mpoAutoLayout` handle for
 *    browser automation to drive.
 *
 * The handle is story-only. Nothing in the package reads it.
 */

import { Button } from '@repo/forms';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SizableText, XStack, YStack } from 'tamagui';

import type { GraphEventWire } from '../dom/wire';
import type { BuiltinEdgeData } from '../edges/edge-kinds';
import type { GraphInteractionMode } from '../interaction/use-lasso-select';
import type { GraphDocument } from '../model/index';
import { hasDomRealm } from '../native/DomOnlyStory';
import { GraphToolbar } from '../native/GraphToolbar';
import { NodeGraph } from '../NodeGraph';
import { demoGraphSchema } from '../react-flow/demo-node-body';
import type { DemoNodeData } from '../react-flow/fixtures';
import type { NodeGraphHandle } from '../react-flow/graph-handle';
import { Background, Controls, reactFlowNodeSelector } from '../react-flow/xy';

type Doc = GraphDocument<DemoNodeData, BuiltinEdgeData>;

const schema = demoGraphSchema();

const meta: Meta<typeof NodeGraph> = {
  title: 'NodeGraph/AutoLayout',
  component: NodeGraph,
  parameters: {
    status: { type: 'beta' },
    layout: 'fullscreen',
    nativeGallery: { scroll: false },
    docs: {
      description: {
        component:
          'Off-thread auto-layout (design 8). dagre is bundled into a committed string and instantiated as a classic blob-URL Worker whose liveness is PROBED with a ping and a 500 ms timeout. The device answer is worker-blob, not hermes-inline: milestone 6 moved relayout onto the imperative handle, which is implemented inside the canvas, and on native the canvas paints in a WebView — which has a real Worker. hermes-inline stays a first-class runner for a caller on the Hermes side; nothing here is one. The arriving positions land as ONE setPositions command inside startTransition, so one undo restores the whole prior arrangement. The toolbar is a SIBLING of the canvas driving it through the imperative handle, because native drops children — which is why layoutRunner read `none` on every device until milestone 6. elkjs is not here: decision D2 is unruled.',
      },
    },
  },
};
export default meta;

type Story = StoryObj<typeof NodeGraph>;

/**
 * A graph nobody would keep. Every node is on a diagonal with the edges
 * crossing, so a tidy that did nothing would be obvious at a glance.
 */
const scrambledData = (kind: 'source' | 'transform' | 'sink', index: number) => {
  if (kind === 'source') {
    return { table: `orders_${index}` };
  }
  if (kind === 'transform') {
    return { expression: `row => row.${index}` };
  }
  return { target: `warehouse_${index}` };
};

const sourcePortOf = (kind: string): string | null => {
  if (kind === 'source') {
    return 'rows';
  }
  return kind === 'transform' ? 'ok' : null;
};

const scrambled = (count: number): Doc => {
  const kinds = ['source', 'transform', 'sink'] as const;
  const nodes = Array.from({ length: count }, (_, index) => {
    const kind = kinds[index % kinds.length];
    const data = scrambledData(kind, index);
    return {
      id: `n${index}`,
      kind,
      // A deterministic scatter: no Math.random, so two sessions compare.
      position: { x: ((index * 137) % 900) - 200, y: ((index * 211) % 700) - 150 },
      data,
    };
  }) as Doc['nodes'];

  const edges: Doc['edges'][number][] = [];
  for (let index = 0; index + 1 < count; index += 1) {
    const from = nodes[index];
    const to = nodes[index + 1];
    const sourcePort = sourcePortOf(from.kind);
    if (sourcePort === null) {
      continue;
    }
    edges.push({
      id: `${from.id}->${to.id}`,
      kind: (['flow', 'data', 'error', 'conditional'] as const)[edges.length % 4],
      source: { node: from.id, port: sourcePort },
      target: { node: to.id, port: 'in' },
      data: {},
    } as Doc['edges'][number]);
  }
  return { version: 1, nodes, edges };
};

/** What the last `{ t: "layoutResult" }` said. */
interface LayoutReading {
  readonly runner: string;
  readonly ms: number;
  readonly nodeCount: number;
  /** Set when the engine REJECTED — see the `layoutResult` note in `wire.ts`. */
  readonly error?: string;
}

/**
 * The whole page: a sibling toolbar, a readout fed by the wire, and a canvas.
 *
 * `hasWorker` is read on the HOST side, which is the right side: the claim
 * design §13.2 makes is about the platform the canvas runs on, and on native
 * the host and the WebView disagree — Hermes has no `Worker` and the WebView
 * does. So the failing case is stated per platform rather than as one boolean:
 * `inline` is a failure when the realm that produced it had a `Worker` to use,
 * and `hermes-inline` is a first-class pass.
 *
 * THE DEVICE ANSWER IS `worker-blob`, corrected after the m6 device pass. This
 * story used to say `hermes-inline`, and that was a reading of design §8's
 * "native runs inline on the Hermes JS thread" — true of the realm it names,
 * and never tested, because until milestone 6 nothing on a phone could ask for
 * a layout at all and `layoutRunner` read `none` everywhere. Milestone 6 put
 * `relayout` on the imperative handle, which is implemented inside the canvas,
 * and on native the canvas paints in a WebView: a WebView has a real `Worker`,
 * so the probe resolves `worker-blob`. Measured on the iPhone 16e:
 * `worker-blob · engine 6.0 ms` at 12 nodes, `31.8 ms` at 200. The probe did
 * its job; the failing case §13.2 guards against is `inline` WITH a `Worker`,
 * which did not occur.
 */
// oxlint-disable-next-line eslint/complexity -- a story page: the branches are independent readout rows, not intertwined logic
const AutoLayoutPage = ({
  count,
  showChecksum = false,
  parkHandle = false,
  fitView = false,
}: {
  readonly count: number;
  readonly showChecksum?: boolean;
  readonly parkHandle?: boolean;
  readonly fitView?: boolean;
}) => {
  const graph = useRef<NodeGraphHandle>(null);
  const [mode, setMode] = useState<GraphInteractionMode>('pan');
  const [reading, setReading] = useState<LayoutReading | null>(null);
  const [pending, setPending] = useState(false);
  const [checksum, setChecksum] = useState<string | null>(null);
  const document = useMemo(() => scrambled(count), [count]);

  const onGraphEvent = useCallback((event: GraphEventWire) => {
    if (event.t !== 'layoutResult') {
      return;
    }
    setPending(false);
    setReading({
      runner: event.runner,
      ms: event.ms,
      nodeCount: event.nodeCount,
      error: event.error,
    });
    // A rejected relayout laid nothing out, so there is nothing to fit and the
    // fit would only hide the failure by moving the graph.
    if (event.error !== undefined && event.error !== '') {
      return;
    }
    /*
      Re-fit once a tidy has settled — STORY behavior, not package behavior.

      The engine deliberately anchors the tidied box where the old one was
      (design §8: a tidy that teleports the graph reads as a crash), so a graph
      that was scattered over 900 units comes back tidy and half off-screen. In
      a real editor that is right, because the user is looking at a place they
      chose. In a story nobody chose anything, so the demo fits the result — and
      it does it through the same handle the buttons use, which is the only door
      a native sibling has.
    */
    graph.current?.fitView();
  }, []);

  const tidy = useCallback(() => {
    setPending(true);
    graph.current?.relayout();
  }, []);

  /**
   * React Flow places a node with a CSS TRANSFORM, never with a layout offset.
   * The first version of this read `offsetLeft` / `offsetTop`, which are 0 for
   * every node at every arrangement — so the checksum was constant and the
   * story "passed" without measuring anything. Caught in Chrome, not here.
   *
   * WEB ONLY, and honestly so: on device the nodes are inside the WebView and a
   * Hermes-side `querySelectorAll` has nothing to walk.
   */
  const stamp = useCallback(() => {
    if (!hasDomRealm) {
      setChecksum('no DOM on this side of the bridge');
      return;
    }
    const nodes = globalThis.document.querySelectorAll<HTMLElement>(reactFlowNodeSelector);
    let total = 0;
    for (const node of nodes) {
      const match = /translate\((?<x>[-\d.]+)px,\s*(?<y>[-\d.]+)px\)/u.exec(node.style.transform ?? '');
      if (!match?.groups) {
        continue;
      }
      total += Number(match.groups.x) + Number(match.groups.y) * 3;
    }
    setChecksum(`${nodes.length} nodes / ${Math.round(total)}`);
  }, []);

  /**
   * The handle browser automation drives for the §13.2 measurement.
   *
   * A story-only escape hatch, and it is here rather than in the package
   * because nothing in the package should be reachable from `window`. It now
   * hangs off `graphRef`, so it reaches the canvas the same way the buttons do.
   */
  useEffect(() => {
    if (!parkHandle) {
      return;
    }
    (globalThis as unknown as { __mpoAutoLayout?: unknown }).__mpoAutoLayout = {
      relayout: () => graph.current?.relayout(),
      fitView: () => graph.current?.fitView(),
      reading: () => reading,
    };
    // oxlint-disable-next-line typescript/consistent-return -- an effect returns a cleanup only when it installed something
    return () => {
      delete (globalThis as unknown as { __mpoAutoLayout?: unknown }).__mpoAutoLayout;
    };
  }, [parkHandle, reading]);

  // `inline` where a `Worker` exists is a failed measurement, not a slow one.
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- `Worker` may be an undeclared global on this realm
  const wrongRunner = reading?.runner === 'inline' && typeof globalThis.Worker === 'function';

  return (
    <YStack
      width="100%"
      height={hasDomRealm ? 640 : undefined}
      flex={hasDomRealm ? undefined : 1}
      minHeight={0}
      padding="$3"
      gap="$2">
      <SizableText
        size="$2"
        opacity={0.7}>
        {hasDomRealm
          ? 'Press Tidy. The readout is the assertion: `worker-blob` on web AND on device — the relayout runs inside the canvas, and on native the canvas is a WebView, which has a real Worker. `inline` on a platform that has Worker is a failed run, not a slow one.'
          : 'Tidy rearranges the graph. Undo restores its previous layout.'}
      </SizableText>
      {/* OUTSIDE the canvas. On native a child of <NodeGraph> is dropped, which
          is why this page had no Tidy button on any device until milestone 6. */}
      <XStack
        gap="$3"
        alignItems="center"
        flexWrap="wrap">
        <GraphToolbar
          mode={mode}
          onModeChange={setMode}
          onFitView={() => graph.current?.fitView()}
          onTidy={tidy}
          onUndo={() => graph.current?.undo()}
          onRedo={() => graph.current?.redo()}
          busy={pending}
        />
        {showChecksum && hasDomRealm ? (
          <>
            <Button onPress={stamp}>Stamp positions</Button>
            <SizableText
              size="$2"
              opacity={0.7}>
              {checksum === null ? 'no stamp yet' : `checksum ${checksum}`}
            </SizableText>
          </>
        ) : null}
      </XStack>
      <XStack
        gap="$3"
        alignItems="center"
        flexWrap="wrap">
        <SizableText
          size="$2"
          theme={wrongRunner ? 'red' : undefined}
          fontFamily="$mono">
          {`runner ${reading?.runner ?? 'not run yet'}`}
        </SizableText>
        {wrongRunner ? (
          <SizableText
            size="$2"
            theme="red">
            FAILED — this platform has Worker, so `inline` is not a valid measurement
          </SizableText>
        ) : null}
        {/*
          A REJECTED relayout, which until the m6 device pass answered with
          nothing at all: the readout sat on "laying out…" forever and that was
          indistinguishable from a Tidy that never reached the canvas.
        */}
        {reading?.error !== undefined && reading.error !== '' ? (
          <SizableText
            size="$2"
            theme="red">
            {`FAILED — the engine rejected: ${reading.error}`}
          </SizableText>
        ) : null}
        <SizableText
          size="$2"
          opacity={0.7}
          fontFamily="$mono">
          {reading === null ? 'engine —' : `engine ${reading.ms.toFixed(1)} ms`}
        </SizableText>
        <SizableText
          size="$2"
          opacity={0.7}
          fontFamily="$mono">
          {`${reading?.nodeCount ?? count} nodes`}
        </SizableText>
        {pending ? (
          <SizableText
            size="$2"
            opacity={0.7}>
            laying out…
          </SizableText>
        ) : null}
      </XStack>
      <YStack
        flex={1}
        minHeight={0}>
        <NodeGraph
          schema={schema}
          defaultDocument={document}
          fitView={fitView}
          interactionMode={mode}
          graphRef={graph}
          onGraphEvent={onGraphEvent}>
          {/*
            React Flow's own chrome, and the ONE thing that is still legitimately
            a child: `Background` and `Controls` are React Flow components, they
            paint inside the pane, and on native the canvas mounts its own chrome
            from options. Rendered as `null` there rather than passed and dropped,
            so the milestone-6 warning stays meaningful — a warning that fired on
            correct code is a warning people learn to ignore.
          */}
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
};

export const Main: Story = {
  render: () => <AutoLayoutPage count={12} />,
};

export const Undo: Story = {
  render: () => (
    <AutoLayoutPage
      count={12}
      showChecksum
    />
  ),
};

export const Large200: Story = {
  render: () => (
    <AutoLayoutPage
      count={200}
      parkHandle
      fitView
    />
  ),
};
