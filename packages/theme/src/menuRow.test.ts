import { describe, expect, it } from 'vitest';

import { menuRowFrame } from './menuRow';

describe('menuRowFrame (shared menu-row geometry)', () => {
  it('spans the overlay edge-to-edge with its own horizontal padding (SP-EDGE)', () => {
    expect(menuRowFrame.width).toBe('100%');
    expect(menuRowFrame.paddingHorizontal).toBe('$3');
  });

  it('keeps flat corners — the overlay container clips to the radius knob', () => {
    expect(menuRowFrame.borderRadius).toBe(0);
  });

  it('does not delete the focus ring (fill and ring are orthogonal)', () => {
    expect(menuRowFrame).not.toHaveProperty('outlineStyle');
  });

  it('is a centered row with a transparent base surface', () => {
    expect(menuRowFrame.flexDirection).toBe('row');
    expect(menuRowFrame.alignItems).toBe('center');
    expect(menuRowFrame.backgroundColor).toBe('transparent');
    expect(menuRowFrame.userSelect).toBe('none');
  });

  it('leaves ramp/cursor/gap/vertical sizing to consumers (not in the recipe)', () => {
    expect(menuRowFrame).not.toHaveProperty('cursor');
    expect(menuRowFrame).not.toHaveProperty('gap');
    expect(menuRowFrame).not.toHaveProperty('hoverStyle');
    expect(menuRowFrame).not.toHaveProperty('height');
    expect(menuRowFrame).not.toHaveProperty('paddingVertical');
  });
});
