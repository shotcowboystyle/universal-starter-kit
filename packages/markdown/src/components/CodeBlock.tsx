/**
 * Plain-markdown code block.
 *
 * LC-16 wrapper: tokenizing and token rendering come from the canonical
 * `@repo/ui` code family (`useShikiTokens` +
 * `HighlightedCode` — one shiki highlighter for the whole app). This file
 * only owns the markdown-specific container chrome: the block inset (rides
 * the space knob — SP-PAD, spec CodeBlock frame) and the shared markdown
 * code color ramp.
 */

import { useResolvedKnobs } from '@repo/theme';
import { Code, HighlightedCode, useShikiTokens, ScrollView } from '@repo/ui';
import { View } from 'tamagui';
import type { FontSizeTokens } from 'tamagui';

import { markdownCodeColors } from '../shared/color-ramps';
import type { CodeBlockProps } from '../types';

interface CodeBlockInternalProps extends CodeBlockProps {
  /** A shiki theme name, or 'auto' for the house syntax theme. */
  theme?: string;
}

export const CodeBlock = ({ children, lang, theme: themeProp = 'auto' }: CodeBlockInternalProps) => {
  const { knobProps } = useResolvedKnobs();
  // "auto" defers to useShikiTokens' default, the house syntax theme, whose
  // token inks follow the scheme (SB-M-1216, MPO-474).
  const tokens = useShikiTokens(children, lang ?? 'text', themeProp === 'auto' ? undefined : themeProp);

  return (
    <View
      // Full fragment spread (AGENTS.md knob rule) so the cornerSmoothing
      // class rides along with the outer radius; the fallback keeps the old
      // default when a Preset override drops the fragment.
      {...(knobProps.borderRadiusNested ?? { borderRadius: '$4' })}
      backgroundColor={markdownCodeColors.background.base}
      borderWidth={knobProps.borderRadius.borderWidth}
      borderColor={markdownCodeColors.border.base}
      // SP-PAD (spec CodeBlock frame; LC-18 / UX-P07): the block inset rides
      // the space knob through the complete panelPadding fragment —
      // components-CodeBlock parity.
      {...knobProps.panelPadding}
      marginVertical="$2"
      overflow="hidden">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}>
        <Code
          backgroundColor="transparent"
          borderWidth={0}
          padding={0}
          color={markdownCodeColors.text.base}
          fontSize={knobProps.sizeToken}>
          <HighlightedCode
            tokens={tokens}
            // SAFETY: sizeToken is always a registered size token ($1-$6), which doubles as a font-size token
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
            fontSize={knobProps.sizeToken as FontSizeTokens}>
            {children}
          </HighlightedCode>
        </Code>
      </ScrollView>
    </View>
  );
};
