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
import { Text, getTokenValue, isWeb } from 'tamagui';

import { componentColors } from '../../componentColors';
import type { HighlightLine } from '../Highlighter';

/** Line-number gutter width steps with the size knob. */
const lineNumberGutterBySize: Record<string, number> = {
  $2: 28,
  $3: 32,
  $4: 40,
  $5: 48,
  $6: 56,
};

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
  fontSize?: any;
}

export function HighlightedCode({
  tokens,
  children,
  highlightLines = [],
  showLineNumbers = false,
  fontSize,
}: HighlightedCodeProps) {
  const { knobProps } = useResolvedKnobs();
  // Code content scales with the size knob (via sizeToken);
  // an explicit fontSize prop from the caller ejects.
  const resolvedFontSize = fontSize ?? knobProps.sizeToken;
  // Gutter width steps with the type scale so a size-knob flip restyles
  // it. $color8 line-number ink fails AA; $color11
  // (text.secondary) is the lowest ramp that stays readable on code surfaces.
  const gutterWidth = lineNumberGutterBySize[String(resolvedFontSize)] ?? 40;
  const gutterGap = getTokenValue('$2' as Parameters<typeof getTokenValue>[0], 'space') as number;
  // While tokens are loading, show the raw children (plain text fallback)
  // — geometry rides the surrounding type scale, not a fixed catalog px.
  if (!tokens) {
    return <>{children}</>;
  }

  return (
    <>
      {tokens.map((line, lineIndex) => {
        const lineNumber = lineIndex + 1;
        const isHighlighted = highlightLines.includes(lineNumber);

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
                textAlign={(isWeb ? 'end' : 'right') as any}
                userSelect="none">
                {lineNumber}
              </Text>
            )}
            {line.map((token, tokenIndex) => (
              <Text
                key={tokenIndex}
                color={token.color}
                {...(token.fontStyle && token.fontStyle & 1 ? { fontStyle: 'italic' } : {})}
                {...(token.fontStyle && token.fontStyle & 2 ? { fontWeight: 'bold' } : {})}
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
}
