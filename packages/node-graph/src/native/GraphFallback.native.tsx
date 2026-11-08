/**
 * What the user sees instead of a blank rectangle.
 *
 * Design 9.4 layer 4. The WebView failed, and the one thing worth knowing is
 * HOW FAR it got: `script` means the bundle parsed and nothing else ran,
 * `module` means the tree failed to evaluate, `flow` means React Flow mounted
 * and never painted. Each sends a reader to a different layer, and a spinner
 * that never resolves sends them nowhere.
 *
 * Built from `tamagui` and the real `useResolvedKnobs`, deliberately NOT from
 * `@repo/ui`' `EmptyState`: components is an OPTIONAL
 * peer, and a fallback that cannot render because its own dependency is absent
 * is not a fallback. The rest of the native shell — toolbar, sheet, inspector —
 * may use components freely.
 *
 * Every style comes from a whole `knobProps.*` fragment spread (AGENTS.md);
 * nothing here cherry-picks a resolved token and nothing here is a literal.
 */

import { useResolvedKnobs } from '@repo/theme';
import { Button, SizableText, YStack } from 'tamagui';

import type { BootStage } from '../dom/boot';

export type GraphFallbackReason = 'no-ready' | 'no-dom-entry' | 'module' | 'render' | 'runtime';

export interface GraphFallbackProps {
  /** Whether ANY event arrived from the canvas. A stage-less failure reads differently either way. */
  readonly started?: boolean;
  readonly reason: GraphFallbackReason;
  /** The last stage the WebView stamped, or `null` if it never stamped one. */
  readonly stage?: BootStage | null;
  readonly message?: string;
  /** The watchdog budget that ran out, so the reader knows what "did not finish" cost. */
  readonly waitedMs?: number;
  readonly onRetry?: () => void;
}

const reasonTitles: Record<GraphFallbackReason, string> = {
  'no-ready': 'The graph did not finish loading',
  // Not a failure of the canvas — the canvas was never started. Design §9.3:
  // the `'use dom'` entry is app-owned, and no app supplied one.
  'no-dom-entry': 'The graph has no DOM entry',
  module: 'The graph failed to load',
  render: 'The graph could not be drawn',
  runtime: 'The graph stopped',
};

/**
 * `stage: null` gets its own sentence rather than the word "null".
 *
 * Nothing stamped at all means the script never executed, which is what a
 * parse error looks like from out here — a different problem from stopping AT
 * `script`, and the two must not read the same.
 */
export const graphFallbackDetail = (
  stage: BootStage | null | undefined,
  started = false,
  reason?: GraphFallbackReason,
  waitedMs?: number,
): string => {
  // This one is not about how far boot got, because boot never began: no
  // WebView was created at all. Saying "it never started" here would be true
  // and useless, and would send the reader looking for a parse error.
  if (reason === 'no-dom-entry') {
    return "No `'use dom'` entry was supplied, so no WebView was created.";
  }
  const waited = waitedMs !== undefined && waitedMs > 0 ? ` after ${waitedMs} ms` : '';
  if (stage) {
    return `It reached "${stage}" and stopped there${waited}.`;
  }
  // Measured on the iPhone 16e simulator, and the reason this took an argument:
  // the canvas reported a render error over the bridge — so it plainly HAD
  // started — and this line still read "it never started", which sent the next
  // reader looking for a parse error that was not there. The host only learns a
  // stage from `ready`, so an error before that leaves the stage null while
  // proving the script ran.
  if (started) {
    return `It started and reported a problem before it finished loading${waited}.`;
  }
  // WHY THIS NO LONGER NAMES A PARSE ERROR (MPO-211). It used to read "It never
  // started, which usually means the bundle failed to parse." On emulator-5590,
  // rebooted fresh, that is exactly what a reader saw — and nothing had failed
  // to parse: the WebView was still starting, and Retry rendered the canvas at
  // once. A watchdog cannot tell "dead" from "slow", so the line now says only
  // what it knows and names the likelier of the two first.
  return (
    `Nothing came back from the WebView${waited}. ` +
    'A slow cold start is the usual cause — Retry is often enough. ' +
    'A bundle that fails to parse looks identical from out here, and would ' +
    'still be silent on a retry.'
  );
};

export const GraphFallback = ({ message, onRetry, reason, stage, started, waitedMs }: GraphFallbackProps) => {
  const { knobProps } = useResolvedKnobs();

  return (
    <YStack
      accessibilityRole="alert"
      alignItems="center"
      flex={1}
      justifyContent="center"
      {...knobProps.gap}
      {...knobProps.panelPadding}>
      <SizableText
        {...knobProps.label}
        textAlign="center">
        {reasonTitles[reason]}
      </SizableText>
      <SizableText
        {...knobProps.body}
        {...knobProps.label}
        textAlign="center">
        {graphFallbackDetail(stage, started, reason, waitedMs)}
      </SizableText>
      {message !== undefined && message !== '' ? (
        <SizableText
          {...knobProps.body}
          {...knobProps.label}
          opacity={0.75}
          textAlign="center">
          {message}
        </SizableText>
      ) : null}
      {onRetry ? <Button onPress={onRetry}>Retry</Button> : null}
    </YStack>
  );
};
