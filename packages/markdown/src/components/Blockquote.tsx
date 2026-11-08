import { useResolvedKnobs } from '@repo/theme';
import { View, getTokens, isWeb, useTheme } from 'tamagui';
import type { Variable } from 'tamagui';

import { markdownBlockquoteColors } from '../shared/color-ramps';
import type { BlockquoteProps } from '../types';

export const Blockquote = ({ children }: BlockquoteProps) => {
  const { knobProps } = useResolvedKnobs();
  const theme = useTheme();
  const padToken = knobProps.panelPadding.padding;
  const spaceTokens: Partial<Record<string, Variable<number | string>>> = getTokens().space;
  const pad = spaceTokens[padToken]?.val ?? padToken;
  const railWidth = knobProps.borderRadius.borderWidth;
  // Tamagui types a theme variable's resolved value as `any`; it is only forwarded into a DOM style.
  const railColor: unknown = theme.color8?.val ?? theme.borderColor?.val;
  const webRailStyle = {
    borderInlineStartWidth: railWidth,
    borderInlineStartStyle: railWidth ? 'solid' : 'none',
    borderInlineStartColor: railColor,
    paddingInlineStart: pad,
  };
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
            // SAFETY: web-only branch; CSS logical properties are valid DOM styles but absent from React Native's style type.
            // oxlint-disable-next-line typescript/no-explicit-any, typescript/no-unsafe-assignment, typescript/no-unsafe-type-assertion -- see SAFETY above
            style: webRailStyle as any,
          }
        : {
            borderStartWidth: railWidth,
            borderStartColor: markdownBlockquoteColors.border.base,
            paddingStart: knobProps.panelPadding.padding,
          })}>
      {children}
    </View>
  );
};
