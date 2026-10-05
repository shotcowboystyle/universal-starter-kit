import { useResolvedKnobs } from '@repo/theme';
import type { ReactNode } from 'react';
import type { GetProps } from 'tamagui';
import { SizableText, View, XStack, YStack, styled } from 'tamagui';

import { componentColors } from '../componentColors';
import { wrapBareTextChildren } from '../shared/textRidesText';

// ── Types ─────────────────────────────────────────────────────

export interface QuoteProps extends Omit<GetProps<typeof QuoteFrame>, 'children'> {
  /** Quote body. */
  children: ReactNode;
  /** Attribution / cite line (rendered outside the quotation). */
  cite?: ReactNode;
  /** Compact padding / type. */
  compact?: boolean;
}

// ── Styled ────────────────────────────────────────────────────

const QuoteFrame = styled(XStack, {
  name: 'Quote',
  width: '100%',
  alignItems: 'stretch',
});

const QuoteRail = styled(View, {
  name: 'QuoteRail',
  flexGrow: 0,
  flexShrink: 0,
  alignSelf: 'stretch',
  backgroundColor: componentColors.indicator.track,
});

const QuoteBody = styled(YStack, {
  name: 'QuoteBody',
  flexGrow: 1,
  flexShrink: 1,
  minWidth: 0,
});

const QuoteBlock = styled(YStack, {
  name: 'QuoteBlock',
  margin: 0,
  padding: 0,
  backgroundColor: 'transparent',
});

// Primer / GitHub / GOV.UK inset-text: a start-edge rail ~0.25em at body
// size (4px). Thickness tracks the borderWidth knob (none → 0; large → 8)
// so knob totality still reaches the quote's identity mark.
function quoteRailWidth(borderWidth: number): number {
  if (borderWidth <= 0) {
    return 0;
  }
  return Math.max(4, borderWidth * 4);
}

// ── Component ─────────────────────────────────────────────────

/**
 * Standalone pull / block quote. HTML: `figure > blockquote + figcaption > cite`
 * (attribution lives outside the quotation per the spec). Chrome: flush
 * logical-start rail (XStack reverses in RTL) + SF-CARD frame.
 */
export function Quote({ children, cite, compact, ...props }: QuoteProps) {
  const { knobProps } = useResolvedKnobs(
    compact === undefined ? { component: 'Quote' } : { component: 'Quote', compact },
  );
  const railWidth = quoteRailWidth(knobProps.borderRadius.borderWidth);

  return (
    <QuoteFrame
      render="figure"
      data-density={knobProps.density}
      backgroundColor={componentColors.surface.background}
      overflow="hidden"
      // R-SCALE quote frame (Axiom 1 child-clip cap). Padding lives on the
      // content stack so the rail stays flush to the start edge.
      {...knobProps.containerRadius}
      marginVertical={knobProps.gap.gap}
      {...props}>
      {railWidth > 0 ? <QuoteRail width={railWidth} minWidth={railWidth} aria-hidden /> : null}
      <QuoteBody {...knobProps.panelPadding} {...knobProps.gap}>
        <QuoteBlock render="blockquote">
          {/* Text rides text: wrap ALL bare string/number children
              (coalesced runs), not just the singleton case. Quote body
              scales with the size knob; compact tightens layout gaps only
              (it does not step sizeToken down). */}
          {wrapBareTextChildren(children, (label, key) => (
            <SizableText key={key} {...knobProps.body} color={componentColors.text.primary} fontStyle="italic">
              {label}
            </SizableText>
          ))}
        </QuoteBlock>
        {cite != null ? (
          <View render="figcaption">
            {wrapBareTextChildren(cite, (label, key) => (
              <SizableText
                key={key}
                render="cite"
                {...knobProps.label}
                color={knobProps.textAccentColor}
                fontStyle="normal">
                — {label}
              </SizableText>
            ))}
          </View>
        ) : null}
      </QuoteBody>
    </QuoteFrame>
  );
}
