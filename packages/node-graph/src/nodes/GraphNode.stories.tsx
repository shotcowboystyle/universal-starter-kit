/**
 * `NodeGraph/GraphNode` — the node alone, off canvas (design §12.1).
 *
 * Off canvas still means inside a `ReactFlowProvider`: `useUpdateNodeInternals`
 * reads the React Flow store, and a node that cannot report a port change is
 * not the node that ships. The provider is the whole canvas this story needs.
 *
 * `FontProof` is task 2.5: design 6.3's corrupted-first-family control, live.
 */

import { Preset, Surface, fontCategoryStacks } from '@repo/theme';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { SizableText, Theme, XStack, YStack } from 'tamagui';

import { hasDomRealm } from '../native/DomOnlyStory';
import { ReactFlowProvider } from '../react-flow/xy';
import { corruptFirstFamily, probeRenderedFamily } from '../theme/faces';
import type { FaceProbe } from '../theme/faces';
import { GraphFaces } from '../theme/GraphFaces';
import type { GraphFaceStatus } from '../theme/GraphFaces';

import { GraphNode } from './GraphNode';
import type { GraphNodePort } from './node-measure';

const oneIn: GraphNodePort[] = [{ id: 'in', side: 'left', direction: 'in', label: 'source' }];

const inOut: GraphNodePort[] = [
  { id: 'in', side: 'left', direction: 'in', label: 'records' },
  { id: 'out', side: 'right', direction: 'out', label: 'result' },
];

const fourPorts: GraphNodePort[] = [
  { id: 'rows', side: 'left', direction: 'in', label: 'rows' },
  { id: 'schema', side: 'left', direction: 'in', label: 'schema' },
  { id: 'ok', side: 'right', direction: 'out', label: 'ok' },
  { id: 'err', side: 'right', direction: 'out', label: 'error' },
];

const meta: Meta<typeof GraphNode> = {
  title: 'NodeGraph/GraphNode',
  component: GraphNode,
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          'The Tamagui node body, resolved through the real useResolvedKnobs stack (Preset / Surface / Intent). Width rides the per-kind measure table rather than the control-height ladder; radius is CONTAINER-CAP so a corner never clips a child; the frame is never overflow:hidden, because handles overhang it. This is where the knob fuzz for MPO-191 runs.',
      },
    },
  },
  argTypes: {
    title: { control: 'text' },
    subtitle: { control: 'text' },
    intent: { control: 'select', options: [undefined, 'accent', 'error', 'warning', 'success'] },
    selected: { control: 'boolean' },
    dragging: { control: 'boolean' },
    coarsePointer: {
      control: 'boolean',
      description: 'Touch surface — widens the port pitch to 44',
    },
    renderMode: { control: 'inline-radio', options: ['detail', 'overview'] },
  },
  decorators: [
    (Story) => (
      <ReactFlowProvider>
        <YStack padding="$4">
          <Story />
        </YStack>
      </ReactFlowProvider>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof GraphNode>;

export const Main: Story = {
  args: {
    id: 'transform',
    title: 'Transform',
    subtitle: 'Maps each row through the mapping expression',
    ports: inOut,
  },
};

export const Intents: Story = {
  render: () => (
    <XStack
      gap="$5"
      flexWrap="wrap">
      {[undefined, 'accent', 'error', 'warning', 'success'].map((intent) => (
        <YStack
          key={intent ?? 'default'}
          gap="$2">
          <SizableText
            size="$2"
            opacity={0.6}>
            {intent ?? 'no intent'}
          </SizableText>
          <GraphNode
            id={`intent-${intent ?? 'default'}`}
            title="Validate"
            subtitle="Rejects rows that fail the schema"
            intent={intent}
            ports={inOut}
          />
        </YStack>
      ))}
    </XStack>
  ),
};

export const Ports: Story = {
  render: () => (
    <XStack
      gap="$5"
      alignItems="flex-start"
      flexWrap="wrap">
      {(
        [
          ['none', []],
          ['one in', oneIn],
          ['in and out', inOut],
          ['four, two a side', fourPorts],
        ] as const
      ).map(([label, ports]) => (
        <YStack
          key={label}
          gap="$2">
          <SizableText
            size="$2"
            opacity={0.6}>
            {label}
          </SizableText>
          <GraphNode
            id={`ports-${label}`}
            title="Join"
            ports={ports}
          />
        </YStack>
      ))}
    </XStack>
  ),
};

/**
 * §7.1 H6 made visible. The magenta marker is positioned to overhang the
 * frame the way a port's painted disc and its 44pt `::after` region will. If
 * the frame ever becomes `overflow: hidden`, half of it disappears here before
 * any spec runs.
 */
export const Overflow: Story = {
  render: () => (
    <XStack
      gap="$8"
      alignItems="flex-start">
      {(['small', 'medium', 'large', 'full'] as const).map((borderRadius) => (
        <Preset
          key={borderRadius}
          cascade={false}
          overrides={{ borderRadius }}>
          <YStack gap="$2">
            <SizableText
              size="$2"
              opacity={0.6}>
              borderRadius: {borderRadius}
            </SizableText>
            <GraphNode
              id={`overflow-${borderRadius}`}
              title="Overhang"
              ports={inOut}>
              <YStack
                position="absolute"
                left={-10}
                top={16}
                width={20}
                height={20}
                borderRadius={9999}
                backgroundColor="$color10"
              />
            </GraphNode>
          </YStack>
        </Preset>
      ))}
    </XStack>
  ),
};

/**
 * Seed `MPO-191-graphnode`, 3 combos, both schemes — the exact combos
 * `node scripts/knob-fuzz.mjs MPO-191-graphnode 3` prints, so the verdicts
 * posted on MPO-191 and this page are the same subject.
 */
const fuzzCombos = [
  {
    label: 'combo 1',
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
    label: 'combo 2',
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
    label: 'combo 3',
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
] as const;

const FuzzColumn = ({ scheme, children }: { scheme: 'light' | 'dark'; children: ReactNode }) => (
  <Theme name={scheme}>
    <YStack
      gap="$4"
      padding="$4"
      backgroundColor="$background"
      borderRadius="$4">
      <SizableText
        size="$2"
        opacity={0.6}>
        {scheme}
      </SizableText>
      {children}
    </YStack>
  </Theme>
);

export const KnobFuzz: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Seed MPO-191-graphnode, 3 combos, light and dark. Measure the GraphNode FRAME against knob-laws.md § Radius › GraphNode frame (CONTAINER-CAP), § Size › GraphNode frame (remap to the measure table) and § Elevation › GraphNode frame (declared honour). Measuring an inset against the frame's row is the false FAIL the procedure warns about.",
      },
    },
  },
  render: () => (
    <XStack
      gap="$5"
      alignItems="flex-start"
      flexWrap="wrap">
      {(['light', 'dark'] as const).map((scheme) => (
        <FuzzColumn
          key={scheme}
          scheme={scheme}>
          {fuzzCombos.map((combo) => (
            <Preset
              key={combo.label}
              cascade={false}
              overrides={combo.knobs}>
              <Surface
                size="medium"
                density="comfortable">
                <YStack gap="$2">
                  <SizableText
                    size="$1"
                    opacity={0.6}>
                    {combo.label}
                  </SizableText>
                  <GraphNode
                    id={`fuzz-${scheme}-${combo.label}`}
                    title="Aggregate"
                    subtitle="Groups rows by the key expression"
                    ports={fourPorts}
                  />
                </YStack>
              </Surface>
            </Preset>
          ))}
        </FuzzColumn>
      ))}
    </XStack>
  ),
};

// ── FontProof (task 2.5) ─────────────────────────────────────────────────────

/**
 * One probe row: what was measured, and whether the first family painted.
 *
 * Rendered as text on purpose. This story is read off a SCREENSHOT — on the
 * iOS simulator and an Android emulator at tasks 2.7 and 2.8, where there is no
 * console to open — so every number the control produces has to be legible in
 * the picture.
 */
const ProbeRow = ({ label, probe }: { label: string; probe: FaceProbe | null }) => {
  if (!probe) {
    return (
      <SizableText
        size="$2"
        fontFamily="$mono">
        {label}: measuring…
      </SizableText>
    );
  }
  const matchVerdict = probe.matched ? 'MATCHED — first family painted' : 'MISS — first family never painted';
  const verdict = probe.conclusive ? matchVerdict : 'INCONCLUSIVE';
  return (
    <YStack gap="$1">
      <SizableText
        size="$2"
        fontFamily="$mono">
        {label}: {verdict}
      </SizableText>
      <SizableText
        size="$1"
        fontFamily="$mono"
        opacity={0.7}>
        stack {probe.widthStack.toFixed(2)}px · first-corrupted {probe.widthFirstCorrupted.toFixed(2)}px
      </SizableText>
      <SizableText
        size="$1"
        fontFamily="$mono"
        opacity={0.5}>
        {probe.stack}
      </SizableText>
    </YStack>
  );
};

/**
 * The corrupted-first-family control, live, with its own negative case beside
 * it.
 *
 * Two targets, and the second is the point. A single MATCHED row proves nothing
 * on its own — the gate's probe produced one of those while Inter had not
 * rendered at all. So the story also probes a span whose first family is
 * ALREADY absent, and shows the control reporting MISS for it. Two rows,
 * opposite verdicts, same probe: that is the evidence.
 *
 * `assetUris` points at the URLs `apps/storybook` serves from
 * `apps/storybook/public/fonts` (`staticDirs: ["../public"]`), so the web run
 * exercises design §6.3's PRIMARY mechanism and the face table below says
 * `asset` rather than `inline`. The preview head registers Inter from the same
 * file, which is why the real cascade matches here even before `GraphFaces`
 * mounts; the device runs at 2.7/2.8 are where the base64 path carries it
 * alone.
 */
/**
 * Whether this story is running somewhere the probe can run at all.
 *
 * A module constant, not a per-render check: it is the PLATFORM, and a value
 * that could change between renders would put the hooks below in danger.
 */
/**
 * The same check `DomOnlyStory` exports, imported rather than restated (task
 * 6.8). It was declared here first, and a second copy is how two stories end up
 * disagreeing about what "has a DOM" means.
 */
const hasDom = hasDomRealm;

const FontProofPanel = () => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [real, setReal] = useState<FaceProbe | null>(null);
  const [absent, setAbsent] = useState<FaceProbe | null>(null);
  const [statuses, setStatuses] = useState<readonly GraphFaceStatus[]>([]);

  useEffect(() => {
    if (!hasDom) {
      return;
    }
    let live = true;
    const run = async () => {
      // The faces have to be resolved before a width means anything.
      await document.fonts.ready;
      if (!live) {
        return;
      }
      const host = hostRef.current;
      if (!host) {
        return;
      }
      const title = host.querySelector('[data-graph-node-title]');
      const control = host.querySelector('[data-font-proof-absent]');
      if (title) {
        setReal(probeRenderedFamily(title));
      }
      if (control) {
        setAbsent(probeRenderedFamily(control));
      }
    };
    void run();
    // oxlint-disable-next-line typescript/consistent-return -- an effect returns a cleanup only when it started something
    return () => {
      live = false;
    };
  }, []);

  const controlStack = corruptFirstFamily(fontCategoryStacks['sans-serif']);

  /**
   * NATIVE STOPS HERE, and it is not a limitation of the story — it is the
   * measurement being meaningless (MPO-211).
   *
   * Two things below are DOM and nothing else: the `<span>` negative control,
   * and `probeRenderedFamily`, which measures on a `<canvas>` context against
   * an element's computed style. React Native answers a lowercase intrinsic it
   * does not know with `View config getter callback for component "span" must
   * be a function` and takes the whole tree down — measured on the iPhone 16e,
   * where the Kitchen Sink showed a red box for this story.
   *
   * Guarding it would be pointless if the answer were simply unavailable on
   * device, and it is not: the probe runs INSIDE the WebView, on the canvas's
   * way to `ready`, and `NodeGraph/Diagnostics` → `Live` renders the result.
   * That is the story AC-3's DOM half is read from, so this one says so
   * instead of pretending.
   */
  if (!hasDom) {
    return (
      <YStack
        gap="$4"
        maxWidth={560}>
        <GraphNode
          id="font-proof"
          title="Transform"
          subtitle="Maps each row through the mapping expression"
          ports={inOut}
        />
        <YStack
          gap="$2"
          padding="$3"
          backgroundColor="$background"
          borderRadius="$4">
          <SizableText
            size="$2"
            fontFamily="$mono">
            probe not run — there is no DOM here
          </SizableText>
          <SizableText
            size="$1"
            opacity={0.7}>
            The node above is the real Tamagui body, resolved through the real knob stack. The corrupted-first-family
            control needs a document and a canvas measurer, so on device it runs inside the WebView instead and its
            result arrives on the canvas&apos;s ready event.
          </SizableText>
          <SizableText
            size="$1"
            opacity={0.7}>
            Read it at NodeGraph → Diagnostics → Live.
          </SizableText>
        </YStack>
      </YStack>
    );
  }

  return (
    <YStack
      ref={hostRef as never}
      gap="$4">
      <GraphFaces
        assetUris={{
          'inter-400': '/fonts/inter-400.woff2',
          'inter-700': '/fonts/inter-700.woff2',
        }}
        onStatus={setStatuses}
      />
      <GraphNode
        id="font-proof"
        title="Transform"
        subtitle="Maps each row through the mapping expression"
        ports={inOut}
      />
      {/* The negative control. Its first family is absent by construction. */}
      <span
        data-font-proof-absent=""
        style={{ fontFamily: controlStack, fontSize: 16 }}>
        AaBbGgQqRrWw0123456789
      </span>
      <YStack
        gap="$3"
        padding="$3"
        backgroundColor="$background"
        borderRadius="$4">
        <ProbeRow
          label="GraphNode title (real cascade)"
          probe={real}
        />
        <ProbeRow
          label="control, first family absent"
          probe={absent}
        />
        <YStack gap="$1">
          {statuses.map((status) => (
            <SizableText
              key={status.id}
              size="$1"
              fontFamily="$mono"
              opacity={0.7}>
              {status.id} · {status.family} {status.weight} · delivered by {status.source}
            </SizableText>
          ))}
        </YStack>
      </YStack>
    </YStack>
  );
};

export const FontProof: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Design 6.3's corrupted-first-family control, live. The first row probes the GraphNode title through the real knob cascade and must read MATCHED; the second probes a span whose first family is already absent and must read MISS. Equal widths mean the first family never rendered — the gate's probe compared against a wholly bogus family and could not tell that apart from the second family rendering. The face table says which of the two mechanisms of 6.3 delivered each face. WEB ONLY: the control is a span and a canvas measurer, so on device this story says where the on-device probe is read instead — NodeGraph → Diagnostics → Live, which renders the probe the canvas ran inside its own WebView.",
      },
    },
  },
  render: () => <FontProofPanel />,
};
