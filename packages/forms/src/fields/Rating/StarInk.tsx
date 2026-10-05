import type { StarInkProps } from './types';

/**
 * Web ink layer: the glyph the contract renders, and nothing else.
 *
 * The tween is armed from OUTSIDE, by the `mp1-rating-ink-<token>` descendant
 * stylesheet in `index.tsx` (`svg * { transition: fill …, stroke … }`). A
 * descendant selector reaches the shape without the icon having to expose a
 * `style`/`className` slot, so there is nothing to declare here — adding a
 * wrapper would only put a node between the class and the glyph.
 *
 * The native counterpart has no cascade to borrow and owns its own layer
 * stack instead; see `StarInk.native.tsx`.
 */
export function StarInk({ StarIcon, size, filled, filledColor, emptyColor }: StarInkProps) {
  return <StarIcon size={size} weight={filled ? 'fill' : 'regular'} color={filled ? filledColor : emptyColor} />;
}
