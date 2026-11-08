/**
 * `NodeGraph/Diagnostics` — the panel, and the toggle that breaks the bundle
 * for real (design §12.1, §9.5).
 *
 * The `Break` control is not a flag that selects an error branch. It swaps the
 * dynamic `import()` for one that resolves to a module whose EVALUATION throws,
 * which is the actual failure design §9.4 layer 3 exists to catch: under Metro
 * a dynamic import compiles to a require, so a module-eval throw is catchable
 * and reportable rather than the blank rectangle an `import.meta` parse error
 * produces. Flipping it here walks the same stamp → import → catch → record
 * path the DOM entry walks, and the panel then names the stage and the phase.
 */

import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useEffect, useState } from 'react';
import { SizableText, YStack } from 'tamagui';

import { resetBoot, stampBootStage } from '../dom/boot';
import type { BootStage } from '../dom/boot';

import { GraphDiagnostics } from './GraphDiagnostics';
import { recordGraphError, resetGraphError } from './last-error';
import { LiveGraphDiagnostics } from './LiveGraphDiagnostics';
import { useGraphDiagnostics } from './use-graph-diagnostics';

/**
 * Walks the DOM entry's boot sequence, optionally against a module that throws.
 *
 * `stopAt` is how far a healthy boot gets before the import runs — `faces`,
 * because that is the stage `NodeGraphDomInner` stamps immediately before the
 * tree it dynamic-imports would take over.
 */
const BootHarness = ({ broken, stopAt }: { broken: boolean; stopAt: BootStage }) => {
  const [loaded, setLoaded] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    resetBoot();
    resetGraphError();
    // oxlint-disable-next-line react/set-state-in-effect -- the harness re-runs a whole boot when its args change, so it must reset to not-loaded first
    setLoaded(false);
    for (const stage of ['script', 'module', 'faces'] as const) {
      stampBootStage(stage);
      if (stage === stopAt) {
        break;
      }
    }
    void (async () => {
      try {
        if (broken) {
          // A REAL thrown module import, not a simulated one.
          // oxlint-disable-next-line react/todo -- React Compiler cannot lower import(); a REAL module-eval throw is the point of this story
          await import('./deliberate-break');
        }
        if (cancelled) {
          return;
        }
        stampBootStage('provider');
        stampBootStage('flow');
        stampBootStage('ready');
        setLoaded(true);
      } catch (error) {
        if (cancelled) {
          return;
        }
        recordGraphError({
          phase: 'module',
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
      if (!cancelled) {
        setTick((n) => n + 1);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [broken, stopAt]);

  /**
   * NO NODE COUNTS HERE, and that is the point of the `Live` story below.
   *
   * This harness used to pass `nodesMounted: loaded ? 12 : 0` — a literal, in
   * the one story whose job was to make "12 nodes" readable off a device
   * screenshot. It proved nothing and read exactly like a measurement. There is
   * no canvas in this harness, so the honest numbers are zeroes, and the panel
   * is here to show the BOOT half: the stage, the phase and the thrown message.
   */
  const diagnostics = useGraphDiagnostics({
    renderer: 'react-flow-dom',
    nodesMounted: 0,
    nodesInDocument: 0,
    culling: true,
    renderMode: 'detail',
    scheme: 'light',
  });

  return (
    <YStack
      gap="$3"
      padding="$4"
      maxWidth={640}>
      <SizableText
        size="$2"
        opacity={0.6}>
        {broken
          ? 'Break ON — the dynamic import resolves to a module that throws on evaluation'
          : 'Break OFF — boot runs through to ready'}
      </SizableText>
      <SizableText
        size="$1"
        opacity={0.5}>
        {loaded ? 'boot reached ready' : 'boot has not reached ready'} · no canvas is mounted here, so the node counts
        are zero. `Live` is the story that measures them.
      </SizableText>
      <GraphDiagnostics
        diagnostics={diagnostics}
        show
      />
    </YStack>
  );
};

/**
 * The meta is typed on the HARNESS, not on `GraphDiagnostics`.
 *
 * The story's controls drive boot — break it, and how far it got first — and
 * neither is a prop of the panel. Typing the meta on the panel and casting the
 * args is how a control silently stops matching what the render reads.
 */
const meta: Meta<typeof BootHarness> = {
  title: 'NodeGraph/Diagnostics',
  component: BootHarness,
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          "Design 9.5's record, rendered so a device screenshot is a diagnosis rather than a photograph of a blank rectangle. The Break control performs a real dynamic import of a module that throws when evaluated, so the fallback path is a story rather than a hope.",
      },
    },
  },
};
export default meta;

type Story = StoryObj<typeof BootHarness>;

export const Main: Story = {
  argTypes: {
    broken: { control: 'boolean', name: 'Break the bundle' },
    stopAt: {
      control: 'inline-radio',
      options: ['script', 'module', 'faces'],
      name: 'Stage reached before the import',
    },
  },
  args: { broken: false, stopAt: 'faces' },
  parameters: {
    docs: {
      description: {
        story:
          "Flip Break on and the panel leads with `boot failed at stage faces . phase module` and the thrown message, instead of rendering nothing. Move the stage control and the banner names the new stage, which is how a reader tells which of design 9.4's five layers let a failure through.",
      },
    },
  },
  render: (args) => (
    <BootHarness
      broken={args.broken}
      stopAt={args.stopAt}
    />
  ),
};

export const Healthy: Story = {
  parameters: {
    docs: {
      description: {
        story: 'The record a WebView that came up correctly reports back through the ready event.',
      },
    },
  },
  render: () => (
    <BootHarness
      broken={false}
      stopAt="faces"
    />
  ),
};

export const ModuleFailure: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'The same panel after a real thrown module import. This is the state design 9.4 layer 3 converts a blank rectangle into.',
      },
    },
  },
  render: () => (
    <BootHarness
      broken
      stopAt="faces"
    />
  ),
};

/**
 * The measured story: a real `<NodeGraph>` with the panel reading ITS numbers.
 *
 * On web the panel is built from `useGraphDiagnostics` over the live node
 * census and a font probe against a rendered node title. On native the same
 * component mounts the DOM host and renders the diagnostics that arrive on the
 * `ready` event — the only place either number is knowable on device, because
 * the canvas lives in a WebView the Hermes side cannot measure.
 *
 * This is where AC 2.7 and 2.8's node count and AC-3's DOM half get read off a
 * device screenshot.
 */
export const Live: StoryObj<typeof LiveGraphDiagnostics> = {
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        story:
          "A real canvas with design 9.5's panel under it. nodesInDocument is the document's twelve; nodesMounted is what React Flow actually rendered, which is fewer while culling is on, and the panel says so on the row. faces is the corrupted-first-family control run against a rendered node title, and faceDelivery says which of 6.3's two mechanisms carried each face — the asset URL on web, the base64 inside the WebView.",
      },
    },
  },
  render: () => <LiveGraphDiagnostics />,
};
