import { useResolvedKnobs } from '@repo/theme';
import { Paragraph as TamaguiParagraph } from 'tamagui';
import type { FontSizeTokens } from 'tamagui';

import type { ParagraphProps } from '../types';

export const Paragraph = ({ children }: ParagraphProps) => {
  // Prose is T-VALUE: body recipe (family/weight) + size-knob body scale
  // (spec: markdown Paragraph binds `body`; LC-18). The size prop carries
  // the paired lineHeight, replacing the old fixed $6.
  const { knobProps } = useResolvedKnobs();
  return (
    <TamaguiParagraph
      marginBottom="$2"
      // SAFETY: knobs resolve sizeToken to a `$`-prefixed size key, which every font-size scale shares.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
      size={knobProps.sizeToken as FontSizeTokens}
      {...knobProps.body}>
      {children}
    </TamaguiParagraph>
  );
};
