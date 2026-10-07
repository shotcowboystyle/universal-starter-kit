/**
 * What a DOM-only story draws on Hermes (milestone 6, task 6.8).
 *
 * Some stories in this package are about the DOM and nothing else: a `<span>`
 * with a corrupted font stack, a `<style>` element, a React Flow `Handle` — a
 * `div` — mounted OUTSIDE a canvas so the port can be seen off it. React Native
 * answers a lowercase intrinsic it does not know with `View config getter
 * callback for component "div" must be a function` and takes the whole tree
 * down, so on the Kitchen Sink those stories were a red box. Measured on the
 * iPhone 16e at MPO-211 and again on MPO-212's device pass.
 *
 * A red box is the worst of the three possible outcomes. It looks like a defect
 * in the thing being demonstrated, it hides which stories actually work, and it
 * teaches a reader nothing about where the answer IS. `FontProof` had already
 * solved this by hand — it draws a sentence naming `NodeGraph → Diagnostics →
 * Live`, where the probe that ran inside the WebView is rendered. This is that
 * guard, extracted, so the next DOM-only story costs one decorator instead of
 * twenty lines.
 *
 * `hasDomRealm` is a `document` check and not a `Platform.OS` check on purpose:
 * `react-native` is an OPTIONAL peer of this package, and a story file must not
 * be the thing that makes it required. It is also the more honest question —
 * what these stories need is a DOM, and a DOM is exactly what is being tested
 * for.
 */

import { useResolvedKnobs } from '@repo/theme';
import { SizableText, YStack } from 'tamagui';

/** True in a browser and inside the canvas's WebView; false on Hermes. */
export const hasDomRealm = globalThis.document !== undefined;

export interface DomOnlyStoryProps {
  /** What this story needs a DOM for, in a clause. */
  readonly needs: string;
  /** Where the same thing CAN be read on device. A story title, not a URL. */
  readonly readInstead?: string;
}

/**
 * One line, not an error.
 *
 * Every style is a whole `knobProps.*` fragment spread (AGENTS.md); nothing here
 * cherry-picks a resolved token and nothing here is a literal.
 */
export function DomOnlyStory({ needs, readInstead }: DomOnlyStoryProps) {
  const { knobProps } = useResolvedKnobs();
  return (
    <YStack
      {...knobProps.gap}
      {...knobProps.panelPadding}>
      <SizableText
        {...knobProps.body}
        {...knobProps.label}>
        {`Web only — this story ${needs}, and there is no DOM on this side of the bridge.`}
      </SizableText>
      {readInstead ? (
        <SizableText
          {...knobProps.body}
          {...knobProps.label}
          opacity={0.75}>
          {`On device, read ${readInstead} instead.`}
        </SizableText>
      ) : null}
    </YStack>
  );
}

/**
 * A Storybook decorator, so guarding a whole file is one line in its `meta`.
 *
 * It replaces the story rather than wrapping it: the point is that the tree
 * below must never be constructed, and a wrapper that rendered its child and
 * then apologised would still have thrown on the way.
 */
export function domOnlyStoryDecorator(props: DomOnlyStoryProps) {
  return (Story: () => React.ReactElement) => (hasDomRealm ? <Story /> : <DomOnlyStory {...props} />);
}
