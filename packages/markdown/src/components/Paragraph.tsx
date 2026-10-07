import { useResolvedKnobs } from '@repo/theme';
import { Paragraph as TamaguiParagraph } from 'tamagui';

import type { ParagraphProps } from '../types';

export function Paragraph({ children }: ParagraphProps) {
  // Prose is T-VALUE: body recipe (family/weight) + size-knob body scale
  // (spec: markdown Paragraph binds `body`; LC-18). The size prop carries
  // the paired lineHeight, replacing the old fixed $6.
  const { knobProps } = useResolvedKnobs();
  return (
    <TamaguiParagraph
      marginBottom="$2"
      size={knobProps.sizeToken as any}
      {...knobProps.body}>
      {children}
    </TamaguiParagraph>
  );
}
