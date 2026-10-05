import { animationNames } from '../animations/index';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * The animation names a Tamagui config registers, for the panel's Animation
 * select. `createTamagui()` stores the resolved driver at `config.animations`,
 * and every driver `createAnimations()` builds keeps its named animations one
 * level down, on `driver.animations`. The driver's own members (`usePresence`,
 * `useAnimations`, `inputStyle`, ...) are API, not animations.
 */
export function extractAnimationNames(tamaguiConfig: unknown): string[] {
  const driver = isRecord(tamaguiConfig) ? tamaguiConfig.animations : undefined;
  const named = isRecord(driver) ? driver.animations : undefined;
  if (isRecord(named)) {
    const keys = Object.keys(named);
    if (keys.length > 0) {
      return keys;
    }
  }
  return [...animationNames];
}
