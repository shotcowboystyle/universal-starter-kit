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
export function FacetBadge({ label, tint = 'gray', compact = false }: FacetBadgeProps) {
  const { knobProps } = useResolvedKnobs({ compact: true });
  return (
    <XStack
      {...knobProps.borderRadius}
      paddingHorizontal={compact ? '$1.5' : '$2'}
      paddingVertical={compact ? '$0.5' : '$1'}
      backgroundColor={`$${tint}4` as never}
      borderColor={`$${tint}7` as never}
      borderWidth={hairlineWidth}
      alignItems="center">
      <Text
        {...knobProps.label}
        {...knobProps.body}
        textTransform="capitalize"
        fontWeight="700"
        color={`$${tint}12` as never}
        {...(compact ? { fontSize: '$1' as const } : null)}
        letterSpacing={0.3}>
        {label}
      </Text>
    </XStack>
  );
}
