import { useResolvedKnobs } from '@repo/theme';
import { H1, H2, H3, H4, H5, H6, isWeb } from 'tamagui';

import type { HeadingProps } from '../types';

const headingComponents = {
  1: H1,
  2: H2,
  3: H3,
  4: H4,
  5: H5,
  6: H6,
} as const;

/** Tamagui default heading scale per level (medium size knob keeps these). */
const headingBaseSize = { 1: 9, 2: 8, 3: 7, 4: 6, 5: 5, 6: 4 } as const;

/** Size knob shifts the whole heading scale one step, preserving hierarchy. */
const sizeShift: Record<string, number> = { $3: -1, $4: 0, $5: 1 };

export function Heading({ level, children }: HeadingProps) {
  const Component = headingComponents[level];
  // T-HEADING: heading recipe + sizeToken-appropriate scale (spec: Heading).
  // Web resolves the heading family through the tamagui font config, so the
  // fontFamily override is native-only (same pattern as PageHeader).
  const { knobProps } = useResolvedKnobs();
  const headingFamily = isWeb ? null : { fontFamily: knobProps.heading.fontFamily };
  const size = `$${headingBaseSize[level] + (sizeShift[knobProps.sizeToken] ?? 0)}`;
  return (
    <Component
      marginTop="$3"
      marginBottom="$2"
      size={size as any}
      {...knobProps.heading}
      {...headingFamily}>
      {children}
    </Component>
  );
}
