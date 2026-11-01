import { hairlineWidth, useResolvedKnobs } from '@repo/theme';
import { Text, XStack } from '@repo/ui';

export interface FacetBadgeProps {
  label: string;
  /** Theme hue (`"grass"`) painting the badge from its ramp. */
  tint?: string;
  /** A step smaller, for image wells and table cells. */
  compact?: boolean;
}

/**
 * One facet value as a static badge: nested density (LC-73), the tint's
 * step-4 fill, step-7 border and step-12 text (DF-04, AA in both schemes).
 */
// SAFETY: every caller passes a `$<hue><step>` theme color token, which Tamagui resolves at runtime; its color props only type the literal token union.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
const colorToken = (token: string) => token as never;

export const FacetBadge = ({ label, tint = 'gray', compact = false }: FacetBadgeProps) => {
  const { knobProps } = useResolvedKnobs({ compact: true });
  return (
    <XStack
      {...knobProps.borderRadius}
      paddingHorizontal={compact ? '$1.5' : '$2'}
      paddingVertical={compact ? '$0.5' : '$1'}
      backgroundColor={colorToken(`$${tint}4`)}
      borderColor={colorToken(`$${tint}7`)}
      borderWidth={hairlineWidth}
      alignItems="center">
      <Text
        {...knobProps.label}
        {...knobProps.body}
        textTransform="capitalize"
        fontWeight="700"
        color={colorToken(`$${tint}12`)}
        {...(compact ? { fontSize: '$1' as const } : null)}
        letterSpacing={0.3}>
        {label}
      </Text>
    </XStack>
  );
};
