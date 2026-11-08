/**
 * `NodeGraph/Lasso` — the two ways into a marquee on touch (design §7.3).
 *
 * `ToolbarMode` is the free one and it ships first: the toolbar flips
 * `interactionMode`, the canvas re-renders with `panOnDrag={false}`, and React
 * Flow's own touch guard then lets a finger start a selection instead of a pan.
 * There is no mechanism of ours in that path at all, which is the point.
 *
 * HOW TO SEE IT, and it does need touch emulation — a mouse takes a different
 * branch of the same guard and would show a marquee in either mode, proving
 * nothing:
 *
 *   1. DevTools → device toolbar (⌘⇧M), or `emulate` with a touch-capable
 *      device in the chrome-devtools MCP.
 *   2. In `pan` mode, drag across the canvas: the graph pans.
 *   3. Press `Select`, drag the same stroke: a marquee is drawn and the nodes
 *      it crosses come back selected. `SelectionMode.Partial`, so crossing is
 *      enough — you do not have to enclose them, which on a phone you cannot
 *      see well enough to do.
 *
 * WHAT MILESTONE 6 CHANGED, and why `LongPress` exists as a story again.
 *
 * `LongPress` used to call `useLassoSelect` on the HOST side and hand it a
 * `<div ref>` of its own. On device that story did not render at all — `View
 * config getter callback for component "div" must be a function` — and it could
 * not have worked if it had: the pane the interceptor must take `touchmove`
 * away from lives inside the WebView, in a different JS realm, and a host-side
 * ref can never reach it. MPO-212's 3.7 gate was recorded as CANNOT BE
 * ATTEMPTED for exactly that reason.
 *
 * So the gesture moved into the canvas, where the pane is, and the story arms
 * it with a serializable option: `longPressLasso`. `arm`, `select` and `cancel`
 * come back on the wire, which is how the readout below works on both
 * platforms from one file. `interactionMode` now crosses the bridge too — it
 * was a `NodeGraphWeb` prop that was never in the DOM options, so on device the
 * toolbar flipped its own label and `panOnDrag` inside the WebView stayed true.
 *
 * `ToolbarMode` is unchanged in mechanism and is still the shippable half.
 * Whether the long press works under a real WKWebView and a real Android
 * WebView is still the open question design §7.3 named; what changed is that it
 * can now be asked.
 */

import { Preset } from '@repo/theme';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useCallback, useState } from 'react';
import { SizableText, XStack, YStack } from 'tamagui';

import type { GraphEventWire } from '../dom/wire';
import type { NodeId } from '../model/index';
import { hasDomRealm } from '../native/DomOnlyStory';
import { GraphToolbar } from '../native/GraphToolbar';
import { NodeGraph } from '../NodeGraph';
import { demoGraphSchema } from '../react-flow/demo-node-body';
import { demoDocumentLarge } from '../react-flow/fixtures';
import { Background, Controls } from '../react-flow/xy';

import type { GraphInteractionMode } from './use-lasso-select';

const schema = demoGraphSchema();

const meta: Meta<typeof NodeGraph> = {
  title: 'NodeGraph/Lasso',
  component: NodeGraph,
  parameters: {
    status: { type: 'beta' },
    layout: 'fullscreen',
    nativeGallery: { scroll: false },
    docs: {
      description: {
        component:
          "Marquee selection on touch. Toolbar mode is upstream's own path: panOnDrag={false} is the only value that opens React Flow's touch guard at Pane/index.tsx:146, so the mode toggle is the whole mechanism. The long press is ours, and since milestone 6 it runs INSIDE the canvas's realm — the pane it intercepts exists only there, which is why the previous host-side version could not mount on native at all. Needs DevTools touch emulation to tell apart from a mouse drag, which passes a different arm of the same guard.",
      },
    },
  },
};
export default meta;

type Story = StoryObj<typeof NodeGraph>;

/** React Flow's own chrome. A legitimate child on web, nothing on native. */
const Chrome = () => {
  if (!hasDomRealm) {
    return null;
  }
  return (
    <>
      <Background />
      <Controls />
    </>
  );
};

const ToolbarModeStory = () => {
  const [mode, setMode] = useState<GraphInteractionMode>('pan');
  const [selected, setSelected] = useState<readonly NodeId[]>([]);

  const onGraphEvent = useCallback((event: GraphEventWire) => {
    if (event.t === 'selection') {
      setSelected(event.ids);
    }
  }, []);

  return (
    <YStack
      width="100%"
      height={hasDomRealm ? 560 : undefined}
      flex={hasDomRealm ? undefined : 1}
      minHeight={0}
      padding="$3"
      gap="$3">
      <XStack
        alignItems="center"
        gap="$3"
        flexWrap="wrap">
        <GraphToolbar
          mode={mode}
          onModeChange={setMode}
        />
        <SizableText
          fontFamily="$mono"
          size="$2">
          {`mode: ${mode} · panOnDrag: ${String(mode !== 'select')} · selected: ${
            selected.length ? selected.join(', ') : 'none'
          }`}
        </SizableText>
      </XStack>
      <YStack
        flex={1}
        minHeight={0}>
        <NodeGraph
          schema={schema}
          defaultDocument={demoDocumentLarge(12)}
          interactionMode={mode}
          coarsePointer
          onGraphEvent={onGraphEvent}>
          <Chrome />
        </NodeGraph>
      </YStack>
    </YStack>
  );
};

export const ToolbarMode: Story = {
  // Cascades on purpose — see the note on `NodeGraph/Overview → Main`. A
  // `cascade={false}` with no `overrides` would discard every Storybook global
  // and make this page look like a component that ignores its knobs.
  render: () => (
    <Preset>
      <ToolbarModeStory />
    </Preset>
  ),
};

const LongPressStory = () => {
  const [mode, setMode] = useState<GraphInteractionMode>('pan');
  const [selected, setSelected] = useState<readonly NodeId[]>([]);
  const [armed, setArmed] = useState(false);
  const [arms, setArms] = useState(0);
  const [cancels, setCancels] = useState(0);
  const [haptics, setHaptics] = useState(0);

  /**
   * The whole readout, off ONE channel. It is the same union on web and across
   * the bridge, which is why this story file is not two story files.
   */
  const onGraphEvent = useCallback((event: GraphEventWire) => {
    if (event.t !== 'lasso') {
      return;
    }
    if (event.haptic) {
      setHaptics((count) => count + 1);
    }
    if (event.phase === 'arm') {
      setArmed(true);
      setArms((count) => count + 1);
      return;
    }
    setArmed(false);
    if (event.phase === 'select') {
      setSelected(event.ids);
    } else {
      setCancels((count) => count + 1);
    }
  }, []);

  return (
    <YStack
      width="100%"
      height={hasDomRealm ? 560 : undefined}
      flex={hasDomRealm ? undefined : 1}
      minHeight={0}
      padding="$3"
      gap="$3">
      <XStack
        alignItems="center"
        gap="$3"
        flexWrap="wrap">
        <GraphToolbar
          mode={mode}
          onModeChange={setMode}
        />
        <SizableText
          fontFamily="$mono"
          size="$2">
          {`armed: ${String(armed)} · arms: ${arms} · cancels: ${cancels} · haptics: ${haptics}`}
        </SizableText>
      </XStack>
      <SizableText
        fontFamily="$mono"
        size="$2"
        opacity={0.75}>
        {`selected: ${selected.length ? selected.join(', ') : 'none'}`}
      </SizableText>
      <SizableText
        size="$2"
        opacity={0.7}>
        {hasDomRealm
          ? "Hold for 350 ms without moving more than 10 px, then drag. The interceptor takes the move stream away from d3-zoom inside the canvas's own realm, so the marquee draws and the graph underneath does not pan. A second finger cancels: a pinch is not a lasso."
          : 'Hold briefly, then drag to select. A second finger cancels the selection gesture.'}
      </SizableText>
      <YStack
        flex={1}
        minHeight={0}>
        <NodeGraph
          schema={schema}
          defaultDocument={demoDocumentLarge(12)}
          interactionMode={mode}
          coarsePointer
          // The whole of task 6.4, as one serializable boolean. It used to be a
          // hook the story called against a ref in the wrong realm.
          longPressLasso
          onGraphEvent={onGraphEvent}>
          <Chrome />
        </NodeGraph>
      </YStack>
    </YStack>
  );
};

export const LongPress: Story = {
  render: () => (
    <Preset>
      <LongPressStory />
    </Preset>
  ),
};
