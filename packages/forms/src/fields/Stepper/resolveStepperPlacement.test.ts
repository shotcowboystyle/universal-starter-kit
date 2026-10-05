import { describe, expect, it } from 'vitest';

import { resolveStepperPlacement } from './resolveStepperPlacement';

describe('resolveStepperPlacement', () => {
  it('defaults to both', () => {
    expect(resolveStepperPlacement(undefined, false)).toBe('both');
    expect(resolveStepperPlacement(undefined, true)).toBe('both');
  });

  it('keeps an explicit left/right on fine pointer', () => {
    expect(resolveStepperPlacement('left', false)).toBe('left');
    expect(resolveStepperPlacement('right', false)).toBe('right');
    expect(resolveStepperPlacement('both', false)).toBe('both');
  });

  it('coerces left/right to both on touch', () => {
    expect(resolveStepperPlacement('left', true)).toBe('both');
    expect(resolveStepperPlacement('right', true)).toBe('both');
    expect(resolveStepperPlacement('both', true)).toBe('both');
  });
});
