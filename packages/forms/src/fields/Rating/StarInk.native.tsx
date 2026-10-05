import { View } from 'tamagui';
import type { TransitionKeys, TransitionProp } from 'tamagui';

import type { StarInkProps } from './types';

/**
 * Motion props for one ink layer.
 *
 * Axiom 4: the token comes from the knob, never a hardcoded duration, and it
 * is scoped to `opacity` so the layer carries no collateral motion.
 *
 * Axiom 3: `transition` is undefined in exactly two places —
 * `animation="none"` (where `prefers-reduced-motion` lands) and mid-scrub —
 * and both mean NO motion. The prop is then omitted entirely rather than set
 * to `"none"`: `"none"` is not a registered token on the RN driver, so it
 * resolves to `{}` and falls back to a DEFAULT SPRING, which is
 * motion wearing the name of silence.
 */
export function inkMotionProps(transition: TransitionProp | undefined) {
  // `TransitionProp` is the whole union (token, per-property map, tuple), but
  // the per-property SLOT only accepts the token form. The knob always
  // resolves to a token name — `resolveKnobs` sets `transition` straight from
  // the `animation` knob — so this narrows rather than widens.
  return transition ? { transition: { opacity: transition as TransitionKeys } } : {};
}

/**
 * Native ink layer (star fill).
 *
 * The web fix arms the tween with a descendant stylesheet, reaching the glyph
 * without the icon cooperating. Native has no cascade to borrow, and the
 * property that actually changes is not reachable any other way either: the
 * star's ink is the `fill`/`stroke` PROP of a `react-native-svg` shape, while
 * the RN driver only interpolates the style keys in its own table
 * (`animatedStyleKey` = `transform`, `opacity`, plus a fixed colour set in
 * `colorStyleKey`). An SVG paint prop is in neither, so NO `transition` on any
 * wrapper — however it is spelled — can ever reach it. That is why the native
 * star jumped while the web star tweened.
 *
 * What this component does own is the layer stack. Both glyph states stay
 * mounted and their `opacity` cross-fades, so the ink change rides a key the
 * driver actually animates while `starIcon` still only ever sees
 * `{ size, weight, color }`. Opacity is not a layout property, so it animates
 * on the native driver rather than being partitioned out.
 *
 * Settled states are pixel-identical to the un-animated render: the visible
 * layer sits at opacity 1 and the other at 0, so only the transit itself is
 * new. Mid-transit the two layers composite to ~0.75 alpha at the crossover —
 * the usual cross-fade dip, and the price of not being able to interpolate
 * the paint itself.
 */
export function StarInk({ StarIcon, size, filled, filledColor, emptyColor, transition }: StarInkProps) {
  const motion = inkMotionProps(transition);
  return (
    <View width={size} height={size}>
      <View data-rating-ink="empty" opacity={filled ? 0 : 1} {...motion}>
        <StarIcon size={size} weight="regular" color={emptyColor} />
      </View>
      <View data-rating-ink="filled" position="absolute" top={0} left={0} opacity={filled ? 1 : 0} {...motion}>
        <StarIcon size={size} weight="fill" color={filledColor} />
      </View>
    </View>
  );
}
