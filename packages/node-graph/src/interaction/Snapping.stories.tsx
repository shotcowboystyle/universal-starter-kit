/**
 * `NodeGraph/Snapping` — design §12.1, and the place task 3.3's verify line is
 * carried out: drag at zoom 0.5 and at zoom 2 and the pull has to feel the same.
 *
 * The three stories map to the rules that cannot be seen in a unit test:
 *
 *  - `Main` — one node against two neighbours, and the guides that appear.
 *  - `MultiSelect` — S6. Shift-click two nodes and drag; the SELECTION's box
 *    snaps and the two nodes keep their spacing. A per-node snapper deforms the
 *    pair here, visibly.
 *  - `ZoomThreshold` — S2. The readout prints the live zoom and the threshold
 *    in flow units, so "the pull feels the same" is checkable instead of felt:
 *    at 0.5x the flow threshold doubles and at 2x it halves, which is what
 *    keeps the SCREEN distance fixed.
 *
 * Every node starts a few units off its neighbour's line on purpose. A graph
 * laid out on a grid is already aligned, and a snap that fires on the first
 * pixel of a drag shows nothing.
 */

import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { SizableText, XStack, YStack } from 'tamagui';

import type { BuiltinEdgeData } from '../edges/edgeKinds';
import type { GraphDocument } from '../model/index';
import { NodeGraph } from '../NodeGraph';
import { demoGraphSchema } from '../react-flow/demoNodeBody';
import type { DemoNodeData } from '../react-flow/fixtures';
import { Background, Controls, useStore } from '../react-flow/xy';

import { defaultSnapThresholdPx } from './snapAlignment';

type Doc = GraphDocument<DemoNodeData, BuiltinEdgeData>;

const schema = demoGraphSchema();

const meta: Meta<typeof NodeGraph> = {
  title: 'NodeGraph/Snapping',
  component: NodeGraph,
  parameters: {
    status: { type: 'beta' },
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          "Alignment snapping (design 7.2). A drag is snapped to a neighbour's left, centre or right line and to its top, middle or bottom line, nearest per axis independently, with the threshold measured in SCREEN pixels and divided by the zoom. Guides are one svg with at most two lines, inside the viewport transform. The end of a drag is never snapped: that frame is the one the document commits.",
      },
    },
  },
  argTypes: {
    coarsePointer: { control: 'boolean', description: 'Touch surface — a 12 px pull, not 8' },
  },
};
export default meta;

type Story = StoryObj<typeof NodeGraph>;

/** Deliberately 3 to 6 units off every line the neighbours offer. */
function unalignedDocument(): Doc {
  return {
    version: 1,
    nodes: [
      { id: 'anchorA', kind: 'source', position: { x: 0, y: 0 }, data: { table: 'orders' } },
      { id: 'anchorB', kind: 'sink', position: { x: 560, y: 320 }, data: { target: 'warehouse' } },
      {
        id: 'drag-me',
        kind: 'transform',
        position: { x: 274, y: 166 },
        data: { expression: 'drag me at either zoom' },
      },
    ],
    edges: [
      {
        id: 'anchorA->drag-me',
        kind: 'flow',
        source: { node: 'anchorA', port: 'rows' },
        target: { node: 'drag-me', port: 'in' },
        data: {},
      },
    ],
  };
}

/** Two nodes 200 apart, five units off the anchor's lines. Drag them together. */
function pairDocument(): Doc {
  return {
    version: 1,
    nodes: [
      { id: 'anchor', kind: 'sink', position: { x: 0, y: 340 }, data: { target: 'warehouse' } },
      { id: 'pair-1', kind: 'source', position: { x: 5, y: 40 }, data: { table: 'orders_1' } },
      { id: 'pair-2', kind: 'source', position: { x: 325, y: 40 }, data: { table: 'orders_2' } },
    ],
    edges: [],
  };
}

function Canvas({ children, height = 520 }: { children: React.ReactNode; height?: number }) {
  return (
    <YStack
      width="100%"
      height={height}
      padding="$3">
      {children}
    </YStack>
  );
}

/**
 * Lives INSIDE the canvas, because the zoom is store state and the store only
 * exists under the provider the editor mounts for you.
 */
function ZoomReadout({ coarsePointer = false }: { coarsePointer?: boolean }) {
  const zoom = useStore((state) => state.transform[2]);
  const screenPx = coarsePointer ? defaultSnapThresholdPx.coarse : defaultSnapThresholdPx.fine;
  return (
    <XStack
      position="absolute"
      top="$2"
      left="$2"
      gap="$3"
      padding="$2"
      borderRadius="$3"
      backgroundColor="$background"
      opacity={0.9}
      zIndex={10}>
      <SizableText size="$2">{`zoom ${zoom.toFixed(2)}x`}</SizableText>
      <SizableText
        size="$2"
        opacity={0.7}>
        {`pull ${screenPx} screen px = ${(screenPx / zoom).toFixed(1)} flow units`}
      </SizableText>
    </XStack>
  );
}

export const Main: Story = {
  render: (args) => (
    <Canvas>
      <SizableText
        size="$2"
        opacity={0.7}
        paddingBottom="$2">
        Drag `drag-me`. A vertical guide means its left, centre or right lined up with a neighbour's; a horizontal one
        means the same on the other axis. Let go and the guides clear.
      </SizableText>
      <YStack flex={1}>
        <NodeGraph
          schema={schema}
          defaultDocument={unalignedDocument()}
          coarsePointer={args.coarsePointer}>
          <Background />
          <Controls />
        </NodeGraph>
      </YStack>
    </Canvas>
  ),
};

export const MultiSelect: Story = {
  render: () => (
    <Canvas>
      <SizableText
        size="$2"
        opacity={0.7}
        paddingBottom="$2">
        Shift-click both `pair-*` nodes, then drag either one. The 320 units between them never changes: the SELECTION's
        bounding box is what snaps, and one delta moves both (S6).
      </SizableText>
      <YStack flex={1}>
        <NodeGraph
          schema={schema}
          defaultDocument={pairDocument()}>
          <Background />
          <Controls />
        </NodeGraph>
      </YStack>
    </Canvas>
  ),
};

export const ZoomThreshold: Story = {
  render: (args) => (
    <Canvas height={560}>
      <SizableText
        size="$2"
        opacity={0.7}
        paddingBottom="$2">
        Zoom to 0.50x, drag `drag-me` until a guide fires, and note how far off it was. Zoom to 2.00x and do it again.
        The flow-unit number in the readout changes by 4x; the distance your cursor travels does not. That is S2.
      </SizableText>
      <YStack flex={1}>
        <NodeGraph
          schema={schema}
          defaultDocument={unalignedDocument()}
          coarsePointer={args.coarsePointer}>
          <Background />
          <Controls />
          <ZoomReadout coarsePointer={args.coarsePointer} />
        </NodeGraph>
      </YStack>
    </Canvas>
  ),
};
