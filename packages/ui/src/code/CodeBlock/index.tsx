/**
 * File: /src/code/code_block/index.tsx
 * Project: @repo/ui
 *
 * Standalone code block with shiki syntax highlighting.
 * No longer requires MDX compilation -- renders directly using shiki tokens.
 */

import { ClipboardIcon } from '@phosphor-icons/react';
import { Button, Input, zIndex } from '@repo/forms';
import {
  MIN_PRESS_TARGET,
  useTouchSurface,
  pressTargetHitSlop,
  sizeRecipeForToken,
  useResolvedKnobs,
  transitionProps,
} from '@repo/theme';
import { LinearGradient } from '@tamagui/linear-gradient';
import { useEffect, useRef, useState } from 'react';
import type { TamaguiElement } from 'tamagui';
import { Spacer, XStack, YStack } from 'tamagui';

import { settleMs } from '../../AnimateHeight';
import { ErrorBoundary } from '../../ErrorBoundary';
import { useCopyFeedback } from '../../feedback/copy';
import { NotifyRegion } from '../../feedback/NotifyHost';
import { ScrollView } from '../../ScrollView';
import { useTranslation } from '../../shared/i18n';
import { Code } from '../Code';
import { HighlightedCode } from '../HighlightedCode';
import { useShikiTokens } from '../Highlighter';
import { Pre } from '../Pre';

/** Visible lines before the "show more" clamp (content constraint). */
const VISIBLE_LINES = 22;

/** Code line-height px per size-token stop — clamp/fade derive from this. */
const lineHeightBySize: Record<string, number> = {
  $2: 16,
  $3: 16,
  $4: 18,
  $5: 20,
  $6: 22,
};

function clampHeightForSize(sizeToken: string): number {
  return VISIBLE_LINES * (lineHeightBySize[sizeToken] ?? 18);
}

export interface CodeBlockProps {
  /** The code to highlight */
  children?: string;
  /** Programming language (e.g. "tsx", "bash", "json") */
  language?: string;
  /** Shiki theme name */
  theme?: string;
  /** Whether to show line numbers */
  showLineNumbers?: boolean;
  /** Lines to highlight (1-indexed, e.g. [1, 3, 5]) */
  highlightLines?: number[];
  /** Whether copy button is disabled */
  disableCopy?: boolean;
  /** Font size token */
  size?: string;
}

export function CodeBlock({
  children = '',
  language = 'tsx',
  theme,
  showLineNumbers: propShowLineNumbers,
  highlightLines = [],
  disableCopy,
  size,
}: CodeBlockProps) {
  const { region, copy } = useCopyFeedback();
  const { t } = useTranslation();
  const { knobProps } = useResolvedKnobs();
  const touch = useTouchSurface();
  // Content type scale follows the size knob (via sizeToken);
  // an explicit size prop ejects.
  const codeSize = (size ?? knobProps.sizeToken) as any;
  const codeText = children.trim();
  const tokens = useShikiTokens(codeText, language, theme);
  const clampHeight = clampHeightForSize(String(codeSize));
  const fadeHeight = Math.round(clampHeight / 2);

  const lines = tokens?.length ?? codeText.split('\n').length;
  const showLineNumbers = propShowLineNumbers ?? lines > 10;
  const isLong = lines > VISIBLE_LINES;
  const [isCutoff, setIsCutoff] = useState(isLong);
  // Reveal tween: "Show more" measures the clamped wrapper's full content
  // height and tweens maxHeight (size-derived) → measured px on the knob
  // transition (revealing to intrinsic height cannot tween — the
  // AnimationLab auto-height defect), then releases the clamp once settled.
  const [expandTarget, setExpandTarget] = useState<number | null>(null);
  const clampRef = useRef<TamaguiElement | null>(null);
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (revealTimerRef.current != null) {
        clearTimeout(revealTimerRef.current);
      }
    },
    [],
  );
  const transition = knobProps.transition;
  const revealAll = () => {
    const node = clampRef.current as unknown as HTMLElement | null;
    const fullHeight = typeof node?.scrollHeight === 'number' ? node.scrollHeight : null;
    // No tween possible (reduced motion / animation=none, native — the RN
    // driver applies layout props directly — or nothing to grow): reveal now.
    if (!transition || fullHeight == null || fullHeight <= clampHeight) {
      setIsCutoff(false);
      return;
    }
    setExpandTarget(fullHeight);
    revealTimerRef.current = setTimeout(() => {
      revealTimerRef.current = null;
      // content height equals the clamp by now — removing it is invisible
      setExpandTarget(null);
      setIsCutoff(false);
    }, settleMs(transition));
  };
  const clamped = isCutoff || expandTarget != null;
  // Copy is the same Input.Button glyph-ring cap the CopyField/Password
  // slot uses; confirm is notify() and the glyph does not flip
  // (this replaces TooltipSimple + icon-swap).
  const showCopy = Boolean(codeText) && !disableCopy;
  const activateCopy = () => {
    void copy(codeText);
  };
  const capSquare = sizeRecipeForToken(String(codeSize), { touch }).height;

  return (
    <YStack position="relative" marginBottom="$4">
      <ErrorBoundary>
        <YStack
          ref={clampRef}
          position="relative"
          {...transitionProps(transition)}
          {...(clamped && {
            maxHeight: expandTarget ?? clampHeight,
            overflow: 'hidden' as const,
            ...knobProps.borderRadius,
          })}>
          {isCutoff && expandTarget == null && (
            <LinearGradient
              position="absolute"
              bottom={0}
              left={0}
              right={0}
              height={fadeHeight}
              colors={['$backgroundTransparent', '$background']}
              zIndex={zIndex.localTop}>
              <Spacer flex={1} />
              <Button onPress={revealAll} alignSelf="center">
                {t('Show more')}
              </Button>
              <Spacer size="$4" />
            </LinearGradient>
          )}
          <Pre {...knobProps.borderRadius} padding={0} marginBottom={0}>
            <ScrollView
              style={{ width: '100%' }}
              contentContainerStyle={{ minWidth: '100%' }}
              horizontal
              showsHorizontalScrollIndicator={false}>
              <Code
                backgroundColor="transparent"
                flex={1}
                borderWidth={0}
                {...knobProps.panelPadding}
                size={codeSize}
                data-register="code">
                <HighlightedCode
                  tokens={tokens}
                  highlightLines={highlightLines}
                  showLineNumbers={showLineNumbers}
                  fontSize={codeSize}>
                  {codeText}
                </HighlightedCode>
              </Code>
            </ScrollView>
          </Pre>
          {showCopy && (
            <XStack position="absolute" top={0} insetInlineEnd={0} zIndex={zIndex.localTop}>
              <Input.Button
                glyphRing
                size={codeSize}
                type="button"
                aria-label="Copy to clipboard"
                data-press-min={MIN_PRESS_TARGET}
                hitSlop={capSquare < MIN_PRESS_TARGET ? pressTargetHitSlop(capSquare) : undefined}
                onPress={activateCopy}
                onKeyDown={
                  ((e: KeyboardEvent) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.stopPropagation();
                      activateCopy();
                    }
                  }) as unknown as () => void
                }>
                <Input.Icon aria-hidden>
                  <ClipboardIcon />
                </Input.Icon>
              </Input.Button>
            </XStack>
          )}
        </YStack>
      </ErrorBoundary>
      <NotifyRegion scope="field" region={region} compact />
    </YStack>
  );
}
