import { useResolvedKnobs } from '@repo/theme';

/**
 * Shared R-OUTER table chrome for MarkdownTable, MDXTable, and
 * MarkdownSimpleTable (spec: Table renderer, MDX Table, and SimpleTable).
 * Spread complete surface + borderRadiusOuter fragments; inner cells stay square.
 */
export function useMarkdownTableKnobs() {
  const { knobProps } = useResolvedKnobs();
  const cellPad = {
    paddingHorizontal: knobProps.gap.gap,
    paddingVertical: knobProps.gap.gap,
    borderRadius: 0 as const,
  };
  return {
    knobProps,
    frameProps: {
      ...knobProps.surface,
      ...knobProps.borderRadiusOuter,
      overflow: 'hidden' as const,
      'data-markdown-table-frame': 'true',
      'data-border-width': String(knobProps.surface.borderWidth),
    },
    headerTextProps: {
      size: knobProps.sizeToken as any,
      ...knobProps.heading,
    },
    cellTextProps: {
      size: knobProps.sizeToken as any,
      ...knobProps.body,
    },
    cellPad,
    headRule: {
      borderBottomWidth: knobProps.surface.borderWidth,
      borderBottomColor: '$borderColor' as const,
    },
  };
}
