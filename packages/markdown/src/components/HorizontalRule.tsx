import { useResolvedKnobs } from '@repo/theme';
import { View } from 'tamagui';

import type { HorizontalRuleProps } from '../types';

/**
 * Semantic divider. House paint is a filled 1px rule (R9 G10 — weight is
 * not a knob). `borderWidth=none` hides the rule without leaving a 1px gap.
 */
export function HorizontalRule(_props: HorizontalRuleProps) {
  const { knobProps } = useResolvedKnobs();
  if (knobProps.borderRadius.borderWidth === 0) {
    return null;
  }
  return (
    <View
      role="separator"
      height={1}
      backgroundColor="$borderColor"
      alignSelf="stretch"
      flexGrow={0}
      flexShrink={0}
      marginVertical="$4"
    />
  );
}
