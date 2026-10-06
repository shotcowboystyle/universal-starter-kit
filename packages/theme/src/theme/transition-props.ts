import type { TransitionProp } from 'tamagui';

/**
 * Spreadable `transition` for a part that rides the animation knob.
 *
 * Tamagui decides whether a component runs its animation hooks from
 * `"transition" in props`, so a part that drops the key at animation `none`
 * throws "Rendered more hooks than during the previous render" the moment the
 * knob flips to any other stop. On web the key therefore stays, and
 * an undefined value paints no CSS transition. The native twin differs.
 */
export function transitionProps(transition: TransitionProp | undefined): {
  transition?: TransitionProp;
} {
  return { transition };
}
