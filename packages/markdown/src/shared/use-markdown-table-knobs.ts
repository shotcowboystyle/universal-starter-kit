import { useResolvedKnobs } from '@repo/theme';
import type { FontSizeTokens } from 'tamagui';

/**
 * Shared R-OUTER table chrome for MarkdownTable, MDXTable, and
 * MarkdownSimpleTable (spec: Table renderer, MDX Table, and SimpleTable).
 * Spread complete surface + borderRadiusNested fragments; inner cells stay square.
 */
export const useMarkdownTableKnobs = () => {
  const { knobProps } = useResolvedKnobs();
  // SAFETY: KnobProps types sizeToken as a plain string, but resolveKnobs only ever sets it to '$3' | '$4' | '$5', all font size tokens
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
  const textSize = knobProps.sizeToken as FontSizeTokens;
  const cellPad = {
    paddingHorizontal: knobProps.gap.gap,
    paddingVertical: knobProps.gap.gap,
    borderRadius: 0 as const,
  };
  return {
    knobProps,
    frameProps: {
      ...knobProps.surface,
      ...knobProps.borderRadiusNested,
      overflow: 'hidden' as const,
      'data-markdown-table-frame': 'true',
      'data-border-width': String(knobProps.surface.borderWidth),
    },
    headerTextProps: {
      size: textSize,
      ...knobProps.heading,
    },
    cellTextProps: {
      size: textSize,
      ...knobProps.body,
    },
    cellPad,
    headRule: {
      borderBottomWidth: knobProps.surface.borderWidth,
      borderBottomColor: '$borderColor' as const,
    },
  };
};
