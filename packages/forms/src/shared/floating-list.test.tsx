// @vitest-environment jsdom

import { renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
import { cleanup } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { ScrollArrow } from './floating-list';

interface ArrowOverrides {
  size?: 'small' | 'medium' | 'large';
  animation?: 'none';
}

const buildPreset = (overrides: ArrowOverrides): ArrowOverrides => {
  const preset: ArrowOverrides = {};
  if (overrides.size !== undefined) {
    preset.size = overrides.size;
  }
  if (overrides.animation !== undefined) {
    preset.animation = overrides.animation;
  }
  return preset;
};

const renderArrow = (overrides?: ArrowOverrides) => {
  const scrollRef = createRef<HTMLElement | null>();
  const arrowScrollDirRef = createRef<'up' | 'down' | null>();
  const preset = overrides === undefined ? undefined : buildPreset(overrides);
  const node = (
    <ScrollArrow
      direction="down"
      scrollRef={scrollRef}
      visible
      arrowScrollDirRef={arrowScrollDirRef}
    />
  );
  return renderWithProviders(preset ? <Preset overrides={preset}>{node}</Preset> : node);
};

describe('ScrollArrow design-law', () => {
  afterEach(cleanup);

  it('icon well follows controlIcon, not a fixed 20px', () => {
    const result = renderArrow();
    const well = result.container.querySelector<HTMLElement>('[data-mpo-scroll-arrow]');
    expect(well).toBeTruthy();
    expect(well?.dataset.iconSize).toBe('16');
    expect(well?.getAttribute('style') ?? '').not.toMatch(/height:\s*28px/u);
  });

  it('size knob restyles the caret', () => {
    const small = renderArrow({ size: 'small' });
    const smallSize = Number(small.container.querySelector<HTMLElement>('[data-mpo-scroll-arrow]')?.dataset.iconSize);
    cleanup();

    const large = renderArrow({ size: 'large' });
    const largeSize = Number(large.container.querySelector<HTMLElement>('[data-mpo-scroll-arrow]')?.dataset.iconSize);
    expect(smallSize).toBeGreaterThan(0);
    expect(largeSize).toBeGreaterThan(smallSize);
  });

  it('animation=none drops the opacity tween', () => {
    const result = renderArrow({ animation: 'none' });
    const well = result.container.querySelector<HTMLElement>('[data-mpo-scroll-arrow]');
    const style = well?.getAttribute('style') ?? well?.style.cssText ?? '';
    expect(style).not.toMatch(/opacity\s[^;]*ease/u);
    expect(style).not.toMatch(/160ms/u);
  });
});
