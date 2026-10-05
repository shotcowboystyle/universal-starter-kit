import { describe, expect, it } from 'vitest';

import { animationNames, animations } from '../animations/css';

import { extractAnimationNames } from './animationOptions';

describe('extractAnimationNames', () => {
  it("lists the registered animations of a createTamagui config, not the driver's API", () => {
    const names = extractAnimationNames({ animations });
    expect(names).toEqual([...animationNames]);
    for (const member of [
      'usePresence',
      'ResetPresence',
      'inputStyle',
      'outputStyle',
      'useAnimatedNumber',
      'useAnimations',
    ]) {
      expect(names).not.toContain(member);
    }
  });

  it('offers exactly the house names on the house driver', () => {
    expect(extractAnimationNames({ animations })).toEqual([
      'bouncy',
      'lazy',
      'slow',
      'medium',
      'quick',
      'tooltip',
      'snappy',
      'gentle',
    ]);
  });

  it("reads an app's own driver names when it registers different ones", () => {
    const driver = { ...animations, animations: { fast: 'ease-in 50ms', calm: 'ease-in 900ms' } };
    expect(extractAnimationNames({ animations: driver })).toEqual(['fast', 'calm']);
  });

  it('falls back to the house names without a config or without named animations', () => {
    expect(extractAnimationNames(undefined)).toEqual([...animationNames]);
    expect(extractAnimationNames({})).toEqual([...animationNames]);
    expect(extractAnimationNames({ animations: { animations: {} } })).toEqual([...animationNames]);
  });
});
