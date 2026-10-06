import { isObject } from '../../type-guards';
import { animationNames } from '../animations/index';

/** The slice of a Tamagui config this module reads: the driver `createTamagui()` stores at `animations`. */
export interface AnimationConfigSource {
  animations?: { animations?: object | null } | null;
}

/**
 * The animation names a Tamagui config registers, for the panel's Animation
 * select. `createTamagui()` stores the resolved driver at `config.animations`,
 * and every driver `createAnimations()` builds keeps its named animations one
 * level down, on `driver.animations`. The driver's own members (`usePresence`,
 * `useAnimations`, `inputStyle`, ...) are API, not animations.
 */
export const extractAnimationNames = (tamaguiConfig?: AnimationConfigSource): string[] => {
  const named = tamaguiConfig?.animations?.animations;
  if (isObject(named)) {
    const keys = Object.keys(named);
    if (keys.length > 0) {
      return keys;
    }
  }
  return [...animationNames];
};
