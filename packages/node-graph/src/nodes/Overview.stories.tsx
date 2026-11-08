/**
 * `NodeGraph/Overview` — 500 nodes, and the crossover you have to watch.
 *
 * The thing to check is not that the graph looks different below zoom 0.35.
 * It is that NOTHING MOVES when it does. React Flow 12 installs a per-node
 * `ResizeObserver`, so a level of detail that changed a node's height would
 * re-measure every node on every zoom tick and drag every attached edge
 * endpoint with it (design §5). At 500 nodes that is a canvas that shivers
 * whenever a user zooms.
 *
 * So: zoom slowly through 0.35 and watch an edge endpoint. It must stay welded
 * to its port. `lod.test.tsx` asserts the CAUSE — the element tree is identical
 * across modes and the declared box does not change — because happy-dom lays
 * nothing out and cannot measure the effect. This story is where the effect is
 * checked, in a browser, on the number of nodes that makes it visible.
 *
 * The readout above each canvas prints React Flow's OWN measured handle
 * positions and node height for one node, so the check is a readable number on
 * both sides of the crossover rather than a squint at a pixel.
 */

import { Switch } from '@repo/forms';
import { Preset, Surface } from '@repo/theme';
import { useState } from 'react';
import { SizableText, View, XStack, YStack } from 'tamagui';

import type { BuiltinEdgeData } from '../edges/edge-kinds';
import type { GraphDocument } from '../model/index';
import { demoGraphSchema } from '../react-flow/demo-node-body';
import type { DemoNodeData } from '../react-flow/fixtures';
import { NodeGraphWeb } from '../react-flow/NodeGraphWeb';
import { Background, Controls, MiniMap, useStore } from '../react-flow/xy';

import { defaultOverviewZoom, lodForZoom } from './lod';

export default {
  title: 'NodeGraph/Overview',
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          "Level of detail at 500 nodes. Below overviewZoom (0.35) node children fade to opacity 0; they never unmount, so the box keeps the same height and React Flow's per-node ResizeObserver has nothing to chase. Zoom through the crossover and watch an edge endpoint: it must not move.",
      },
    },
  },
};

type Doc = GraphDocument<DemoNodeData, BuiltinEdgeData>;

/**
 * 500 nodes on a 25-wide grid, chained into a long edge list.
 *
 * Deterministic, not random: a story whose graph changes between reloads
 * cannot be compared against a screenshot from five minutes ago.
 */
const nodeData = (kind: 'source' | 'transform' | 'sink', index: number) => {
  if (kind === 'source') {
    return { table: `orders_${index}` };
  }
  if (kind === 'transform') {
    return { expression: `row => row.${index}` };
  }
  return { target: `warehouse_${index}` };
};

/** Sinks have no outgoing port, so they end a chain. */
const sourcePortOf = (kind: string) => {
  if (kind === 'source') {
    return 'rows';
  }
  if (kind === 'transform') {
    return 'ok';
  }
  return null;
};

const bigDocument = (count = 500): Doc => {
  const kinds = ['source', 'transform', 'sink'] as const;
  const perRow = 25;
  const nodes = Array.from({ length: count }, (_, index) => {
    const kind = kinds[index % kinds.length];
    const data = nodeData(kind, index);
    return {
      id: `n${index}`,
      kind,
      position: { x: (index % perRow) * 300, y: Math.floor(index / perRow) * 220 },
      data,
    } as Doc['nodes'][number];
  });

  const edgeKinds = ['flow', 'data', 'error', 'conditional'] as const;
  const edges: Doc['edges'][number][] = [];
  for (let index = 0; index + 1 < count; index += 1) {
    const from = nodes[index];
    const to = nodes[index + 1];
    const sourcePort = sourcePortOf(from.kind);
    if (!sourcePort) {
      continue;
    }
    edges.push({
      id: `${from.id}->${to.id}`,
      kind: edgeKinds[edges.length % edgeKinds.length],
      source: { node: from.id, port: sourcePort },
      target: { node: to.id, port: 'in' },
      data: {},
    } as Doc['edges'][number]);
  }
  return { version: 1, nodes, edges };
};

const bigDoc = bigDocument(500);
const schema = demoGraphSchema();

/**
 * The live zoom, the mode it resolves to, and the handle positions React Flow
 * has MEASURED for one node.
 *
 * `handleBounds` is what every edge endpoint is computed from, so reading it
 * directly is reading the thing that must not move — rather than reading a
 * pixel and hoping.
 */
const Readout = ({ nodeId }: { nodeId: string }) => {
  const zoom = useStore((state) => state.transform[2]);
  const bounds = useStore((state) => {
    const node = state.nodeLookup.get(nodeId);
    const handles = [...(node?.internals.handleBounds?.source ?? []), ...(node?.internals.handleBounds?.target ?? [])];
    return handles.map((handle) => `${handle.id ?? '?'} ${Math.round(handle.x)},${Math.round(handle.y)}`).join('  |  ');
  });
  const height = useStore((state) => state.nodeLookup.get(nodeId)?.measured?.height ?? 0);
  return (
    // Pinned as a panel rather than left to flow: as a bare row it rendered
    // over the canvas at the top-left and the handle numbers — the whole point
    // of the readout — were clipped off the right edge.
    <XStack
      position="absolute"
      top={0}
      left={0}
      right={0}
      zIndex={6}
      gap="$5"
      padding="$2"
      alignItems="center"
      flexWrap="wrap"
      backgroundColor="$background"
      borderBottomWidth={1}
      borderColor="$borderColor"
      pointerEvents="none">
      <SizableText
        size="$2"
        fontWeight="600">
        zoom {zoom.toFixed(3)}
      </SizableText>
      <SizableText
        size="$2"
        fontWeight="600">
        mode {lodForZoom(zoom, defaultOverviewZoom)}
      </SizableText>
      <SizableText size="$2">
        {nodeId} height {Math.round(height)}
      </SizableText>
      <SizableText
        size="$2"
        opacity={0.7}>
        handles {bounds || 'not measured yet'}
      </SizableText>
    </XStack>
  );
};

/**
 * 500 nodes, culling on, the readout pinned above the canvas.
 *
 * Zoom out past 0.35 and back. `height` and `handles` must print the same
 * numbers on both sides of the crossover; `mode` is the only line that changes.
 */
export const main = {
  name: 'Main',
  // The Preset CASCADES. `cascade={false}` starts from `defaultKnobs` and merges
  // only `overrides`, so on a story that passes none it replaces the whole knob
  // set and discards every Storybook global — the page then paints one fixed
  // signature at every stop, which reads exactly like a component ignoring its
  // knobs. The milestone-1 fuzz found that on `GraphPort → Crowded`. A fuzz PAGE
  // may pin, because it passes `overrides` and the page is the evidence; an
  // ordinary story may not. `Surface size="medium"` stays: it is the size
  // AUTHORITY over the knob (LC-68), which is what keeps the readout comparable
  // between reloads, and it is why `size` is not fuzzable here.
  render: () => (
    <Preset>
      <Surface
        size="medium"
        density="comfortable">
        <YStack
          gap="$3"
          padding="$3">
          <View
            width="100%"
            height={620}>
            <NodeGraphWeb
              schema={schema}
              defaultDocument={bigDoc}>
              <Readout nodeId="n1" />
              <Background />
              <Controls />
              <MiniMap
                pannable
                zoomable
              />
            </NodeGraphWeb>
          </View>
          <SizableText
            size="$2"
            opacity={0.7}>
            500 nodes, 333 edges. Zoom through 0.35 with the controls or a pinch and watch the handle numbers: they must
            not move. The bodies fade; the boxes do not resize.
          </SizableText>
        </YStack>
      </Surface>
    </Preset>
  ),
};

const CrossoverStory = () => {
  const [high, setHigh] = useState(false);
  return (
    <Preset>
      <Surface
        size="medium"
        density="comfortable">
        <YStack
          gap="$3"
          padding="$3">
          <Switch
            id="overview-zoom"
            size="$2"
            checked={high}
            onChange={setHigh}
            label={`overviewZoom 1 (everything is overview) instead of ${defaultOverviewZoom}`}
          />
          <View
            width="100%"
            height={560}>
            <NodeGraphWeb
              schema={schema}
              defaultDocument={bigDoc}
              overviewZoom={high ? 1 : defaultOverviewZoom}>
              <Readout nodeId="n1" />
              <Controls />
            </NodeGraphWeb>
          </View>
          <SizableText
            size="$2"
            opacity={0.7}>
            Flip the switch and read the height. The node fades to a plain box and the number does not change — that is
            the invariant, and it is why the children fade instead of unmounting.
          </SizableText>
        </YStack>
      </Surface>
    </Preset>
  );
};

/**
 * The crossover with the threshold under your thumb.
 *
 * Raising `overviewZoom` to 1 puts the whole canvas in overview at ordinary
 * zoom, which is the cheapest way to see the fade without pinching — and the
 * readout still has to print the same height.
 */
export const crossover = {
  name: 'Crossover',
  render: () => <CrossoverStory />,
};
