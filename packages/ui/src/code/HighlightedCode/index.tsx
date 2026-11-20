/**
 * File: /src/code/highlighted_code/index.tsx
 * Project: @repo/ui
 *
 * Universal syntax-highlighted code renderer.
 * Renders shiki tokens as Text components -- works identically on web and native.
 * No CSS classes or className parsing needed.
 */

import { useResolvedKnobs } from '@repo/theme';
import type { ReactNode } from 'react';
import type { FontSizeTokens, TextProps } from 'tamagui';
import { Text, getTokenValue, isWeb } from 'tamagui';

import { componentColors } from '../../component-colors';
import type { HighlightLine } from '../Highlighter';

/** Line-number gutter width steps with the size knob. */
const lineNumberGutterBySize = new Map<string, number>([
  ['$2', 28],
  ['$3', 32],
  ['$4', 40],
  ['$5', 48],
  ['$6', 56],
]);

// SAFETY: '$2' is a registered space token; getTokenValue's Token union is only a type-level subset of them
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the literal is not part of the generated Token union
const gutterGapToken = '$2' as Parameters<typeof getTokenValue>[0];

const NO_HIGHLIGHT_LINES: number[] = [];

/** Whether shiki's font-style bit field (1=italic, 2=bold) has the flag at `bit` set. */
const hasFontStyleBit = (fontStyle: number | undefined, bit: number): boolean =>
  fontStyle !== undefined && Math.floor(fontStyle / 2 ** bit) % 2 === 1;

export interface HighlightedCodeProps {
  /** Array of token lines from shiki */
  tokens: HighlightLine[] | null;
  /** Fallback content while tokens are loading */
  children?: ReactNode;
  /** Lines to highlight (1-indexed) */
  highlightLines?: number[];
  /** Whether to show line numbers */
  showLineNumbers?: boolean;
  /** Font size token */
  fontSize?: FontSizeTokens;
}

export const HighlightedCode = ({
  tokens,
  children,
  highlightLines = NO_HIGHLIGHT_LINES,
  showLineNumbers = false,
  fontSize,
}: HighlightedCodeProps) => {
  const { knobProps } = useResolvedKnobs();
  // Code content scales with the size knob (via sizeToken);
  // an explicit fontSize prop from the caller ejects.
  const resolvedFontSize = fontSize ?? knobProps.sizeToken;
  // Gutter width steps with the type scale so a size-knob flip restyles
  // it. $color8 line-number ink fails AA; $color11
  // (text.secondary) is the lowest ramp that stays readable on code surfaces.
  const gutterWidth = lineNumberGutterBySize.get(String(resolvedFontSize)) ?? 40;
  const gutterGap = Number(getTokenValue(gutterGapToken, 'space'));
  // While tokens are loading, show the raw children (plain text fallback)
  // — geometry rides the surrounding type scale, not a fixed catalog px.
  if (!tokens) {
    // oxlint-disable-next-line react/jsx-no-useless-fragment -- children is a ReactNode (may be a Promise); a component must return a ReactElement
    return <>{children}</>;
  }
  const highlighted = new Set(highlightLines);

  return (
    <>
      {tokens.map((line, lineIndex) => {
        const lineNumber = lineIndex + 1;
        const isHighlighted = highlighted.has(lineNumber);

        return (
          <Text
            key={lineIndex}
            {...(isHighlighted && {
              backgroundColor: componentColors.code.highlightLine,
            })}
            fontSize={resolvedFontSize}
            // Code text stays mono with normal tracking; the bodyFont /
            // fontWeight knobs never restyle code content.
            fontFamily="$mono"
            letterSpacing={0}
            data-code-font="mono">
            {showLineNumbers && (
              <Text
                color={knobProps.textAccentColor}
                fontSize={resolvedFontSize}
                width={gutterWidth + gutterGap}
                paddingInlineEnd={gutterGap}
                data-line-number=""
                display="inline-flex"
                // "end" is web-only CSS; native textAlign has no logical values
                // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- SAFETY: 'end' is a web-only CSS value that RN-typed textAlign omits; only emitted when isWeb
                textAlign={(isWeb ? 'end' : 'right') as TextProps['textAlign']}
                userSelect="none">
                {lineNumber}
              </Text>
            )}
            {line.map((token, tokenIndex) => (
              <Text
                key={tokenIndex}
                color={token.color}
                {...(hasFontStyleBit(token.fontStyle, 0) ? { fontStyle: 'italic' } : {})}
                {...(hasFontStyleBit(token.fontStyle, 1) ? { fontWeight: 'bold' } : {})}
                fontFamily="$mono"
                letterSpacing={0}
                fontSize={resolvedFontSize}>
                {token.content}
              </Text>
            ))}
            {'\n'}
          </Text>
        );
      })}
    </>
  );
};
