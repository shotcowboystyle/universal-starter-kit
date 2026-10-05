/**
 * @vitest-environment jsdom
 */

import { renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
import { cleanup } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { ScrollArrow } from './floatingList';

afterEach(cleanup);

function renderArrow(overrides?: { size?: 'small' | 'medium' | 'large'; animation?: 'none' }) {
  const scrollRef = createRef<HTMLElement | null>();
  const arrowScrollDirRef = createRef<'up' | 'down' | null>();
  const preset = overrides
    ? {
        ...(overrides.size ? { size: overrides.size } : {}),
        ...(overrides.animation ? { animation: overrides.animation } : {}),
      }
    : undefined;
  const node = <ScrollArrow direction="down" scrollRef={scrollRef} visible arrowScrollDirRef={arrowScrollDirRef} />;
  return renderWithProviders(preset ? <Preset overrides={preset}>{node}</Preset> : node);
}

describe('ScrollArrow design-law', () => {
  it('icon well follows controlIcon, not a fixed 20px', () => {
    const result = renderArrow();
    const well = result.container.querySelector('[data-mpo-scroll-arrow]') as HTMLElement | null;
    expect(well).toBeTruthy();
    expect(well?.getAttribute('data-icon-size')).toBe('16');
    expect(well?.getAttribute('style') ?? '').not.toMatch(/height:\s*28px/);
  });

  it('size knob restyles the caret', () => {
    const small = renderArrow({ size: 'small' });
    const smallSize = Number(small.container.querySelector('[data-mpo-scroll-arrow]')?.getAttribute('data-icon-size'));
    cleanup();

    const large = renderArrow({ size: 'large' });
    const largeSize = Number(large.container.querySelector('[data-mpo-scroll-arrow]')?.getAttribute('data-icon-size'));
    expect(smallSize).toBeGreaterThan(0);
    expect(largeSize).toBeGreaterThan(smallSize);
  });

  it('animation=none drops the opacity tween', () => {
    const result = renderArrow({ animation: 'none' });
    const well = result.container.querySelector('[data-mpo-scroll-arrow]') as HTMLElement | null;
    const style = well?.getAttribute('style') ?? well?.style.cssText ?? '';
    expect(style).not.toMatch(/opacity\s+[^;]*ease/);
    expect(style).not.toMatch(/160ms/);
  });
});
