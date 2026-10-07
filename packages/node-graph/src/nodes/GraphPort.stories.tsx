/**
 * `NodeGraph/GraphPort` — four sides, and a crowded node.
 *
 * The `.mp-graph` wrapper matters: every rule in `css/graph.css` is scoped
 * under the canvas root, so a port rendered outside it gets the inline
 * fallbacks (a round dot at the painted size) but NOT the `::after` hit
 * region. Wrapping here is what makes the debug toggle below tell the truth.
 *
 * EXPECTED in this page's console, once per port:
 *
 *   [React Flow]: Handle: No node id found. Make sure to only use a Handle
 *   inside a custom Node.
 *
 * `useNodeId()` returns null outside a mounted canvas, and these stories show
 * the port off canvas on purpose — that is the whole subject. The warning is
 * React Flow telling the truth about the setup, not a defect in GraphPort, and
 * it goes away in `NodeGraph/NodeGraph` (task 1.11) where the same ports render
 * inside real nodes. Do not silence it with a fake node context: that would
 * hide the same warning when it is real.
 */

// React Flow's own sheet FIRST: it carries `.react-flow__handle-left/right/
// top/bottom`, the rules that translate a handle onto the node edge, and
// nothing in this package reproduces them. Without it a port renders at its
// static position and lands on top of its own label. Task 1.11 does this once
// inside `NodeGraphWeb`; a story that renders ports off canvas has to do it
// itself or it shows a layout the product never has.
import '@xyflow/react/dist/style.css';
import '../../css/graph.css';

import { Switch } from '@repo/forms';
import { Preset, Surface } from '@repo/theme';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useState } from 'react';
import { SizableText, XStack, YStack } from 'tamagui';

import { domOnlyStoryDecorator } from '../native/DomOnlyStory';
import { getHandlePosition, Position, ReactFlowProvider } from '../react-flow/xy';
import type { HandleBounds, InternalNodeBase } from '../react-flow/xy';

import { GraphNode } from './GraphNode';
import { GraphPort } from './GraphPort';
import { paintedPortSize, portGeometry, portHitSize } from './handleGeometry';
import type { GraphNodePort, GraphNodeSizeKnob, GraphPortSide } from './nodeMeasure';

const sides: GraphPortSide[] = ['left', 'right', 'top', 'bottom'];

const crowded: GraphNodePort[] = [
  { id: 'rows', side: 'left', direction: 'in', label: 'rows' },
  { id: 'schema', side: 'left', direction: 'in', label: 'schema' },
  { id: 'opts', side: 'left', direction: 'in', label: 'options' },
  { id: 'ok', side: 'right', direction: 'out', label: 'ok' },
  { id: 'warn', side: 'right', direction: 'out', label: 'warning' },
  { id: 'err', side: 'right', direction: 'out', label: 'error' },
];

const meta: Meta<typeof GraphPort> = {
  title: 'NodeGraph/GraphPort',
  component: GraphPort,
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          'A port is painted only — it draws a dot and declares a hit region, and decides nothing about whether a connection is legal. The painted dot is 8/10/12 by the size knob and NEVER 44 (H1); the 44pt target is a ::after pseudo-element that grows outward (H2), so the rendered edge endpoint stays where the 8px dot put it. The circle survives borderRadius:none, because a square port reads as a resize grip.',
      },
    },
  },
  argTypes: {
    side: { control: 'inline-radio', options: sides },
    direction: { control: 'inline-radio', options: ['in', 'out'] },
    coarsePointer: { control: 'boolean', description: 'Touch surface — hit becomes 44' },
  },
  decorators: [
    /*
      NATIVE STOPS HERE (task 6.8). Every story on this page mounts a React Flow
      `Handle` — a `div` — OUTSIDE a canvas, which is the whole subject: the
      port is shown off canvas so the two rectangles can be told apart. On
      Hermes a lowercase intrinsic React Native does not know throws `View
      config getter callback for component "div" must be a function` and takes
      the tree down, and the Kitchen Sink showed a red box.

      The port itself is not web-only. It renders on device inside the canvas's
      WebView, which is where `NodeGraph → NodeGraph` shows it.
    */
    domOnlyStoryDecorator({
      needs: 'mounts a React Flow handle outside a canvas',
      readInstead: 'NodeGraph → NodeGraph, where the same ports render inside real nodes',
    }),
    (Story) => (
      <ReactFlowProvider>
        <YStack
          className="mp-graph"
          padding="$6">
          <Story />
        </YStack>
      </ReactFlowProvider>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof GraphPort>;

/**
 * Four sides, three size stops, both pointer kinds. The numbers under each dot
 * are the two that must never be conflated: painted, then hit.
 */
export const Main: Story = {
  render: () => (
    <YStack gap="$7">
      {([true, false] as const).map((coarsePointer) => (
        <YStack
          key={String(coarsePointer)}
          gap="$4">
          <SizableText
            size="$3"
            fontWeight="600">
            {coarsePointer ? 'coarse pointer (touch)' : 'fine pointer (mouse)'}
          </SizableText>
          {(['small', 'medium', 'large'] as const satisfies readonly GraphNodeSizeKnob[]).map((size) => (
            <Surface
              key={size}
              size={size}
              density="comfortable">
              <XStack
                gap="$8"
                alignItems="center">
                <SizableText
                  size="$2"
                  opacity={0.6}
                  width={70}>
                  size {size}
                </SizableText>
                {sides.map((side) => (
                  <YStack
                    key={side}
                    gap="$2"
                    alignItems="center"
                    width={90}>
                    <YStack
                      width={48}
                      height={48}
                      position="relative"
                      alignItems="center"
                      justifyContent="center"
                      borderWidth={1}
                      borderColor="$borderColor"
                      borderStyle="dashed"
                      borderRadius="$3">
                      <GraphPort
                        id={`${size}-${side}`}
                        side={side}
                        direction={side === 'left' || side === 'top' ? 'in' : 'out'}
                        coarsePointer={coarsePointer}
                      />
                    </YStack>
                    <SizableText
                      size="$1"
                      opacity={0.6}>
                      {side}
                    </SizableText>
                    <SizableText
                      size="$1"
                      opacity={0.45}>
                      {paintedPortSize(size)} / {portHitSize({ size, coarsePointer })}
                    </SizableText>
                  </YStack>
                ))}
              </XStack>
            </Surface>
          ))}
        </YStack>
      ))}
    </YStack>
  ),
};

/**
 * Six ports, three a side. H4's floor is what keeps this node tall enough for
 * six real targets; without it the discs would overlap and the wrong port
 * would win the drop. The radius toggle proves the circle is immune to the
 * knob at `none`, where a square dot would read as a resize grip.
 */
export const Crowded: Story = {
  render: () => {
    const [coarsePointer, setCoarsePointer] = useState(true);
    const [squareKnob, setSquareKnob] = useState(false);
    return (
      <YStack gap="$5">
        <XStack
          gap="$6"
          alignItems="center">
          <Switch
            id="coarse"
            size="$2"
            checked={coarsePointer}
            onChange={setCoarsePointer}
            label="coarse pointer (44pt pitch)"
          />
          <Switch
            id="square"
            size="$2"
            checked={squareKnob}
            onChange={setSquareKnob}
            label="borderRadius: none — the port stays round anyway"
          />
        </XStack>
        {/*
          CASCADES, on purpose. `cascade={false}` starts from `defaultKnobs` and
          merges only the overrides, so it REPLACES the whole knob set — which
          silently discarded every Storybook global and made this page
          unfuzzable: the MPO-191 sweep measured a 10px dot and a 1px ring at
          every size and borderWidth stop, because the toggle's own Preset had
          reset them. Cascading merges the toggle onto the ambient knobs
          instead, which is what a demo of ONE override should do.
        */}
        <Preset overrides={squareKnob ? { borderRadius: 'none' } : undefined}>
          <XStack
            gap="$9"
            alignItems="flex-start">
            <GraphNode
              id="crowded"
              title="Validate"
              subtitle="Three in, three out"
              ports={crowded}
              coarsePointer={coarsePointer}
              renderPort={(port) => (
                <GraphPort
                  id={port.id}
                  side={port.side}
                  direction={port.direction}
                  coarsePointer={coarsePointer}
                />
              )}
            />
            <GraphNode
              id="sparse"
              title="Passthrough"
              subtitle="One in, one out"
              ports={[
                { id: 'in', side: 'left', direction: 'in', label: 'in' },
                { id: 'out', side: 'right', direction: 'out', label: 'out' },
              ]}
              coarsePointer={coarsePointer}
              renderPort={(port) => (
                <GraphPort
                  id={port.id}
                  side={port.side}
                  direction={port.direction}
                  coarsePointer={coarsePointer}
                />
              )}
            />
          </XStack>
        </Preset>
      </YStack>
    );
  },
};

/**
 * The 44pt region made visible, and the endpoint law made checkable by eye.
 *
 * Two things a unit spec cannot do. jsdom and happy-dom cannot resolve a
 * pseudo-element at all — `getComputedStyle(el, "::after")` returns an empty
 * declaration — so `GraphPort.spec.tsx` reads the RULE TEXT and says so. Here
 * the browser resolves it for real: the debug toggle paints the `::after`
 * itself, so what you see outlined is the element the finger will hit, not a
 * div drawn beside it.
 *
 * The readout underneath is the same `getHandlePosition` call the spec makes,
 * run in the browser, at hit 8 and at hit 44. The two rows must print the same
 * point. Under element growth they would differ by 18 on x — which is the
 * number design §7.1 gives for why the region is a pseudo-element.
 */
const hitDebugClass = 'mp-graph-hit-debug';

/**
 * Story-local, and it touches no `.react-flow__` selector — `mp-graph-port` is
 * this package's own class, so `checkGraphVarsCoverage()` stays satisfied and
 * the debug paint cannot leak into the shipped sheet.
 */
const hitDebugCss = `
.${hitDebugClass} .mp-graph-port::after {
  background: currentColor;
  opacity: 0.14;
  outline: 1px dashed var(--mpo-graph-guide-color, currentColor);
}
`;

function EndpointRow({ label, painted, hit }: { label: string; painted: number; hit: number }) {
  const geometry = portGeometry({
    painted,
    hit,
    side: 'left',
    nodeWidth: 190,
    nodeHeight: 72,
    offset: 36,
  });
  const node = {
    id: 'n1',
    position: { x: 300, y: 120 },
    data: {},
    measured: { width: 190, height: 72 },
    internals: { positionAbsolute: { x: 300, y: 120 } },
  } as unknown as InternalNodeBase;
  const handle = {
    id: 'p1',
    type: 'source',
    nodeId: 'n1',
    position: Position.Left,
    ...geometry.box,
  } as unknown as HandleBounds;
  const point = getHandlePosition(node, handle, Position.Left);
  return (
    <XStack
      gap="$5"
      alignItems="center">
      <SizableText
        size="$2"
        width={190}>
        {label}
      </SizableText>
      <SizableText
        size="$2"
        opacity={0.6}
        width={110}>
        box {geometry.box.width}
      </SizableText>
      <SizableText
        size="$2"
        opacity={0.6}
        width={110}>
        region {geometry.region.width}
      </SizableText>
      <SizableText
        size="$2"
        fontWeight="600"
        width={190}>
        endpoint {point.x} , {point.y}
      </SizableText>
    </XStack>
  );
}

export const HitTarget: Story = {
  render: () => {
    const [debug, setDebug] = useState(true);
    return (
      <YStack gap="$6">
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: story-local debug paint */}
        <style dangerouslySetInnerHTML={{ __html: hitDebugCss }} />
        <Switch
          id="hit-debug"
          size="$2"
          checked={debug}
          onChange={setDebug}
          label="paint the ::after hit region"
        />

        <YStack
          className={debug ? hitDebugClass : undefined}
          gap="$5">
          {([true, false] as const).map((coarsePointer) => (
            <YStack
              key={String(coarsePointer)}
              gap="$3">
              <SizableText
                size="$3"
                fontWeight="600">
                {coarsePointer ? 'coarse — 44pt press floor' : 'fine — max(painted, 24)'}
              </SizableText>
              <XStack
                gap="$9"
                alignItems="center">
                {(['small', 'medium', 'large'] as const satisfies readonly GraphNodeSizeKnob[]).map((size) => (
                  <Surface
                    key={size}
                    size={size}
                    density="comfortable">
                    <YStack
                      gap="$3"
                      alignItems="center"
                      width={120}>
                      {/*
                          64 square so a 44 px region has room to paint without
                          being clipped by its own demo cell — a cell that
                          cropped the region would understate the target and
                          make the toggle lie.
                        */}
                      <YStack
                        width={64}
                        height={64}
                        position="relative"
                        alignItems="center"
                        justifyContent="center"
                        borderWidth={1}
                        borderColor="$borderColor"
                        borderStyle="dashed"
                        borderRadius="$3"
                        overflow="visible">
                        <GraphPort
                          id={`hit-${size}-${String(coarsePointer)}`}
                          side="right"
                          direction="out"
                          coarsePointer={coarsePointer}
                        />
                      </YStack>
                      <SizableText
                        size="$1"
                        opacity={0.6}>
                        {size}
                      </SizableText>
                      <SizableText
                        size="$1"
                        opacity={0.45}>
                        {paintedPortSize(size)} painted / {portHitSize({ size, coarsePointer })} hit
                      </SizableText>
                    </YStack>
                  </Surface>
                ))}
              </XStack>
            </YStack>
          ))}
        </YStack>

        <YStack gap="$2">
          <SizableText
            size="$3"
            fontWeight="600">
            getHandlePosition, center defaulting to false — both rows print the same point
          </SizableText>
          <EndpointRow
            label="8 px dot, 8 px hit"
            painted={8}
            hit={8}
          />
          <EndpointRow
            label="8 px dot, 44 px ::after"
            painted={8}
            hit={44}
          />
          <EndpointRow
            label="44 px ELEMENT — the refused mechanism"
            painted={44}
            hit={44}
          />
          <SizableText
            size="$2"
            opacity={0.6}>
            The third row is what element growth would do: x moves 18 outward, and every edge on an LR graph moves with
            it.
          </SizableText>
        </YStack>
      </YStack>
    );
  },
};
