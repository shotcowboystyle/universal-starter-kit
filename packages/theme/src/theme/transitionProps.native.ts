import type { TransitionProp } from 'tamagui';

/**
 * Native twin of `transitionProps.ts`.
 *
 * The React Native driver resolves an undefined `transition` to an empty
 * config and animates with a default spring, so keeping the key at
 * animation `none` would put motion on every part that is meant to be still.
 * Native keeps omitting it until the driver has an instant token to pass.
 */
export function transitionProps(transition: TransitionProp | undefined): {
  transition?: TransitionProp;
} {
  return transition ? { transition } : {};
}
