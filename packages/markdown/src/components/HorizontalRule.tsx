import { useResolvedKnobs } from '@repo/theme';
import { View } from 'tamagui';

import type { HorizontalRuleProps } from '../types';

/**
 * Semantic divider. House paint is a filled 1px rule (R9 G10 — weight is
 * not a knob). `borderWidth=none` hides the rule without leaving a 1px gap.
 */
export const HorizontalRule = (_props: HorizontalRuleProps) => {
  const { knobProps } = useResolvedKnobs();
  if (knobProps.borderRadius.borderWidth === 0) {
    return null;
  }
  return (
    <View
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- cross-platform Tamagui View (no <hr> on native); the role gives separator semantics on web
      role="separator"
      height={1}
      backgroundColor="$borderColor"
      alignSelf="stretch"
      flexGrow={0}
      flexShrink={0}
      marginVertical="$4"
    />
  );
};
