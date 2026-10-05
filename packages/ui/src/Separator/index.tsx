/**
 * House Separator — the catalog rule.
 *
 * The raw tamagui Separator rode the curated re-export as a "layout primitive
 * with no house replacement". Two measured reasons it may not:
 *
 * - A bare name a house barrel exports is a catalog part, and
 *   this one resolved to a raw primitive.
 * - The raw primitive declares `flex: 1`
 *   (@tamagui/separator@2.7.6 Separator.tsx), so the rule is CAPABLE of
 *   absorbing free space — exactly the defect.
 *
 * The paint recipe is lifted from DropdownMenu's proven private
 * SeparatorLine: a FILLED line rather than a border, because Blink floors
 * sub-1px border widths and a filled fractional height is crisp in every
 * engine.
 *
 * MEASUREMENT CORRECTION (2026-09-01). The original report's headline — "96 of 96
 * separators paint nothing: height 1px, background rgba(0,0,0,0),
 * border-top-width 0px" — was a PROBE ARTEFACT, not a defect. The gallery
 * probe computed `paints = backgroundColor.alpha > 0 || borderTopWidth > 0`,
 * while tamagui's Separator paints with borderBOTTOMWidth (horizontal) and
 * borderRIGHTWidth (vertical), so the expression was structurally blind to
 * the one primitive it audited. The shots that reading produced carry the
 * painted 1px $borderColor rules in their own pixels, in both schemes; a
 * pixel audit of all 52 action-and-feedback shots finds at least as many
 * painted 1px $borderColor rules as the sidecar called blank, on every
 * board. The raw rule did paint. It was still the wrong thing behind a
 * catalog name, and it could still flex-grow — which is why this component
 * stands.
 *
 * Measured law:
 * - 1 CSS px, never 0.5px. Vertical separators are 1px wide.
 * - Colour `$borderColor` in both schemes.
 * - Quiet variants dim with `opacity: 0.5`, never a lighter colour.
 *
 * A separator is never leftover space — the painted edge has an
 * explicit, non-flexible size (`flexGrow/flexShrink: 0`), so no equal-
 * specificity `flex: 1` can turn the rule into a viewport-dependent gap
 * (the raw primitive was a `flex: 1` item, exactly that defect).
 *
 * Knob story: no knob channel maps to a 1px rule, and none will. By design
 * there is no separator-weight knob, the rule is
 * 1px and the quiet rule is opacity 0.5. Consumer `{...props}` stay the
 * explicit eject (STD-EJECT-LAST).
 */
import type { GetProps } from 'tamagui';
import { View, isWeb, styled } from 'tamagui';

const SeparatorFrame = styled(View, {
  name: 'Separator',
  // The painting edge: a filled 1px line in the control-frame colour.
  height: 1,
  backgroundColor: '$borderColor',
  // Fill the cross axis of the stack that owns the rule.
  alignSelf: 'stretch',
  // Provably incapable of absorbing free space.
  flexGrow: 0,
  flexShrink: 0,

  variants: {
    /** Vertical rule: 1px wide, stretches to the row's height. */
    vertical: {
      true: {
        height: 'auto',
        width: 1,
      },
    },
    /** Quiet rule: same colour at half opacity — never a lighter colour. */
    quiet: {
      true: {
        opacity: 0.5,
      },
    },
  } as const,
});

export interface SeparatorProps extends GetProps<typeof SeparatorFrame> {}

export function Separator({ vertical, ...props }: SeparatorProps) {
  return (
    <SeparatorFrame
      role="separator"
      vertical={vertical}
      // role="separator" is horizontal by default; only vertical must say so.
      // Web-only: RN has no aria-orientation (boundary discipline).
      {...(isWeb && vertical ? { 'aria-orientation': 'vertical' as const } : undefined)}
      {...props}
    />
  );
}
