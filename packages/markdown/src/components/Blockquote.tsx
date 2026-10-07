import { useResolvedKnobs } from '@repo/theme';
import { View, getTokens, isWeb, useTheme } from 'tamagui';

import { markdownBlockquoteColors } from '../shared/colorRamps';
import type { BlockquoteProps } from '../types';

export function Blockquote({ children }: BlockquoteProps) {
  const { knobProps } = useResolvedKnobs();
  const theme = useTheme();
  const padToken = knobProps.panelPadding.padding as number | string;
  const pad = typeof padToken === 'number' ? padToken : ((getTokens().space as any)?.[padToken]?.val ?? padToken);
  const railWidth = knobProps.borderRadius.borderWidth;
  return (
    <View
      backgroundColor={markdownBlockquoteColors.background.base}
      // R-SCALE quote frame (spec Blockquote): the painted quote surface
      // rounds with the radius knob, capped at its own padding (Axiom 1 —
      // containerRadius fragment). Rail thickness rides borderWidth (0 hides).
      {...knobProps.containerRadius}
      paddingVertical={knobProps.gap.gap}
      marginVertical="$3"
      // CSS logical properties keep the border and padding on the logical
      // start side in RTL (SB-M-1215); tamagui borderStartWidth does not
      // compile to working CSS in this version. Native uses the RN logical
      // border/padding props, which flip with I18nManager.
      {...(isWeb
        ? {
            style: {
              borderInlineStartWidth: railWidth,
              borderInlineStartStyle: railWidth ? 'solid' : 'none',
              borderInlineStartColor: theme.color8?.val ?? theme.borderColor?.val,
              paddingInlineStart: pad,
            } as any,
          }
        : {
            borderStartWidth: railWidth,
            borderStartColor: markdownBlockquoteColors.border.base,
            paddingStart: knobProps.panelPadding.padding,
          })}>
      {children}
    </View>
  );
}
