/**
 * `NodeGraph/NodeGraph` — the whole editor (design §12.1).
 *
 * Every story mounts the same `demoGraphSchema()` the two task-1.11 specs
 * mount, so a story that renders and a spec that passes are looking at one
 * tree. The canvas brings its own `ReactFlowProvider` and both stylesheets, so
 * a story is exactly what a consumer writes.
 *
 * `AutoLayout` is milestone 4's and is not here yet.
 */

import { Preset } from '@repo/theme';
import type { Knobs } from '@repo/theme';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useState } from 'react';
import { SizableText, Theme, XStack, YStack } from 'tamagui';

import type { BuiltinEdgeData } from '../edges/edgeKinds';
import type { GraphDocument } from '../model/index';
import { NodeGraph } from '../NodeGraph';

import { demoGraphSchema } from './demoNodeBody';
import type { DemoNodeData } from './fixtures';
import { demoDocument, demoDocumentLarge } from './fixtures';
import { Background, Controls, MiniMap } from './xy';

type Doc = GraphDocument<DemoNodeData, BuiltinEdgeData>;

const schema = demoGraphSchema();

const meta: Meta<typeof NodeGraph> = {
  title: 'NodeGraph/NodeGraph',
  component: NodeGraph,
  parameters: {
    status: { type: 'beta' },
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The web editor: GraphVars writes the --xy-* token layer, KnobEnvelopeProvider rebuilds the Preset/Surface/Intent stack, and one registered node type and one registered edge type switch on the model kind internally. Nodes are Tamagui bodies resolved through the real useResolvedKnobs; culling is on by default, which is measured (node drag 25.71ms to 10.58ms at 200 nodes).',
      },
    },
  },
  argTypes: {
    readOnly: { control: 'boolean' },
    coarsePointer: { control: 'boolean', description: 'Touch surface — widens the port pitch' },
    onlyRenderVisibleElements: { control: 'boolean' },
  },
};
export default meta;

type Story = StoryObj<typeof NodeGraph>;

/** Every story needs a real box: React Flow measures its parent, not the window. */
function Canvas({ children, height = 560 }: { children: React.ReactNode; height?: number }) {
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
 * The controls are named one by one rather than spread from `args`. A
 * `{...args}` spread pins `NodeGraph`'s kind parameters to their defaults
 * before `schema` can infer them, and the demo document then stops type-checking
 * against its own schema — inference through a spread is worth nothing here.
 */
export const Main: Story = {
  render: (args) => (
    <Canvas>
      <NodeGraph
        schema={schema}
        defaultDocument={demoDocumentLarge(12)}
        readOnly={args.readOnly}
        coarsePointer={args.coarsePointer}
        onlyRenderVisibleElements={args.onlyRenderVisibleElements}>
        <Background />
        <Controls />
      </NodeGraph>
    </Canvas>
  ),
};

/**
 * The four edge kinds on one canvas. `NodeGraph/Edges` shows them isolated;
 * this is the same table under real Tamagui nodes, which is where a stroke that
 * disappears against the node fill actually shows up.
 */
export const TypedEdges: Story = {
  render: () => (
    <Canvas>
      <NodeGraph
        schema={schema}
        defaultDocument={demoDocumentLarge(8)}>
        <Background />
      </NodeGraph>
    </Canvas>
  ),
};

/**
 * Two hundred nodes. This is where `onlyRenderVisibleElements` earns its
 * default: count `.react-flow__node` in the inspector against the 200 in the
 * document, then flip the control off and count again.
 */
export const Large200: Story = {
  render: () => (
    <Canvas height={640}>
      <NodeGraph
        schema={schema}
        defaultDocument={demoDocumentLarge(200)}>
        <Background />
        <Controls />
        <MiniMap
          pannable
          zoomable
        />
      </NodeGraph>
    </Canvas>
  ),
};

export const Empty: Story = {
  render: () => (
    <Canvas height={320}>
      <NodeGraph
        schema={schema}
        defaultDocument={{ version: 1, nodes: [], edges: [] }}>
        <Background />
      </NodeGraph>
    </Canvas>
  ),
};

export const ReadOnly: Story = {
  render: () => (
    <Canvas>
      <NodeGraph
        schema={schema}
        defaultDocument={demoDocument()}
        readOnly>
        <Background />
      </NodeGraph>
    </Canvas>
  ),
};

/**
 * Controlled: the story owns the document and writes it back on every change.
 * The counter is the proof a 30-frame drag is ONE change, not thirty.
 */
export const Controlled: Story = {
  render: () => {
    const [document, setDocument] = useState<Doc>(() => demoDocument());
    const [changes, setChanges] = useState(0);
    return (
      <Canvas>
        <XStack
          gap="$3"
          alignItems="center"
          paddingBottom="$2">
          <SizableText size="$2">{`onDocumentChange calls: ${changes}`}</SizableText>
          <SizableText
            size="$2"
            opacity={0.6}>
            {`node a at ${Math.round(document.nodes[0]?.position.x ?? 0)}, ${Math.round(
              document.nodes[0]?.position.y ?? 0,
            )}`}
          </SizableText>
        </XStack>
        <YStack flex={1}>
          <NodeGraph
            schema={schema}
            document={document}
            onDocumentChange={(next) => {
              setDocument(next);
              setChanges((count) => count + 1);
            }}>
            <Background />
          </NodeGraph>
        </YStack>
      </Canvas>
    );
  },
};

/**
 * The knob fuzz, WITH EDGES (design §11). `node scripts/knob-fuzz.mjs
 * MPO-191-graphnode 3` prints these three combos; they are transcribed here
 * rather than generated, so the story shows the same thing on every machine.
 *
 * Combo 1 has `borderWidth: none` and `elevation: none`, which paints a node
 * with no visible frame at all. That is the knobs OBEYING, not a defect — the
 * canvas background differs from the node fill, which is exactly what a graph
 * on a real canvas looks like and why this combo is fuzzed with edges.
 */
const fuzzCombos: readonly { readonly label: string; readonly knobs: Partial<Knobs> }[] = [
  {
    label: 'combo 1 · radius medium · borderWidth none · elevation none',
    knobs: {
      fillStyle: 'filled',
      borderRadius: 'medium',
      borderWidth: 'none',
      elevation: 'none',
      space: 'large',
      size: 'medium',
      textAccent: 'medium',
      headingFont: 'geometric',
      bodyFont: 'sans-serif',
      fontWeight: 'bold',
      animation: 'tooltip',
    },
  },
  {
    label: 'combo 2 · radius none · size small · animation none',
    knobs: {
      fillStyle: 'filled',
      borderRadius: 'none',
      borderWidth: 'none',
      elevation: 'small',
      space: 'small',
      size: 'small',
      textAccent: 'medium',
      headingFont: 'rounded',
      bodyFont: 'cursive',
      fontWeight: 'regular',
      animation: 'none',
    },
  },
  {
    label: 'combo 3 · radius full · size large · elevation large',
    knobs: {
      fillStyle: 'filled',
      borderRadius: 'full',
      borderWidth: 'small',
      elevation: 'large',
      space: 'medium',
      size: 'large',
      textAccent: 'high',
      headingFont: 'mono',
      bodyFont: 'serif',
      fontWeight: 'bold',
      animation: 'bouncy',
    },
  },
];

export const KnobFuzz: Story = {
  render: () => (
    <YStack
      padding="$3"
      gap="$5">
      {(['light', 'dark'] as const).map((scheme) => (
        <Theme
          key={scheme}
          name={scheme}>
          <YStack
            gap="$3"
            padding="$3"
            backgroundColor="$background">
            <SizableText
              size="$3"
              fontWeight="600">
              {scheme}
            </SizableText>
            {fuzzCombos.map((combo) => (
              <YStack
                key={combo.label}
                gap="$2">
                <SizableText
                  size="$2"
                  opacity={0.7}>
                  {combo.label}
                </SizableText>
                <YStack height={280}>
                  <Preset
                    cascade={false}
                    overrides={combo.knobs}>
                    <NodeGraph
                      schema={schema}
                      defaultDocument={demoDocumentLarge(6)}>
                      <Background />
                    </NodeGraph>
                  </Preset>
                </YStack>
              </YStack>
            ))}
          </YStack>
        </Theme>
      ))}
    </YStack>
  ),
};
