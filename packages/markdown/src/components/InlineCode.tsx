/**
 * Plain-markdown inline code.
 *
 * LC-16 wrapper over the canonical `CodeInline` from
 * `@repo/ui` (real `<code>` semantics, shared code
 * color ramp). Markdown-specific constraint kept here: sizing uses the size
 * knob token instead of CodeInline's web-only percentage font metrics, so
 * the same source renders on native (React Native has no % font sizes).
 */

import { useResolvedKnobs } from '@repo/theme';
import { CodeInline } from '@repo/ui';

import type { InlineCodeProps } from '../types';

export const InlineCode = ({ children }: InlineCodeProps) => {
  const { knobProps } = useResolvedKnobs();
  return (
    <CodeInline
      fontSize={knobProps.sizeToken}
      lineHeight={knobProps.sizeToken}
      paddingHorizontal="$1.5"
      paddingVertical="$0.5"
      {...knobProps.body}
      {...knobProps.borderRadius}>
      {children}
    </CodeInline>
  );
};
