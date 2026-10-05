import { describe, expect, it } from 'vitest';

import { transitionProps } from './transitionProps';

describe('transitionProps (web)', () => {
  it('keeps the transition key at animation none so a live knob flip adds no hooks', () => {
    const atNone = transitionProps(undefined);
    expect('transition' in atNone).toBe(true);
    expect(atNone.transition).toBeUndefined();
  });

  it('passes a knob token through unchanged', () => {
    expect(transitionProps('bouncy')).toEqual({ transition: 'bouncy' });
  });
});
