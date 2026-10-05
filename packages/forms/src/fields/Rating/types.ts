import type { ComponentType } from 'react';
import type { TransitionProp } from 'tamagui';

/**
 * The swappable star glyph contract (`RatingProps.starIcon`). Kept to exactly
 * these three props: anything the ink layer needs must be solved WITHOUT
 * asking the icon to cooperate, or every custom icon silently breaks.
 */
export type StarIconType = ComponentType<{
  size: number;
  weight: 'fill' | 'regular';
  color: string;
}>;

export interface StarInkProps {
  StarIcon: StarIconType;
  size: number;
  filled: boolean;
  filledColor: string;
  emptyColor: string;
  /**
   * Knob motion token (Axiom 4). `undefined` means NO motion, and it is
   * `undefined` in exactly two places: `animation="none"` — which is where
   * `prefers-reduced-motion` lands — and for the duration of a pointer scrub,
   * which must track the finger 1:1 rather than lag by a token.
   */
  transition?: TransitionProp;
}
