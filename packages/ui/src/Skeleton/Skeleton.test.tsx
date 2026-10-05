import { renderWithProviders } from '@repo/test-utils';
/**
 * Skeleton / SkeletonText / SkeletonCircle — design-law contract.
 *
 * Locks anatomy + animation:none, the R-PILL circle, specimen a11y (one
 * announcer, decorative bones), size recipe geometry, and named-export identity.
 */
import { Preset, sizeRecipeForToken } from '@repo/theme';
import { cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import * as SkeletonExports from './index';
import { Skeleton, SkeletonCircle, SkeletonGroup, SkeletonText } from './index';

afterEach(cleanup);

function radiusClasses(el: Element): string[] {
  return String((el as HTMLElement).className || '')
    .split(' ')
    .filter((c) => c.startsWith('_btlr-'));
}

describe('Skeleton named exports', () => {
  it('serves named exports only (no default) and keeps the namespace statics', () => {
    expect('default' in SkeletonExports).toBe(false);
    expect(SkeletonExports.Skeleton).toBe(Skeleton);
    expect(SkeletonExports.SkeletonText).toBe(SkeletonText);
    expect(SkeletonExports.SkeletonCircle).toBe(SkeletonCircle);
    expect(SkeletonExports.SkeletonGroup).toBe(SkeletonGroup);
    expect(Skeleton.Text).toBe(SkeletonText);
    expect(Skeleton.Circle).toBe(SkeletonCircle);
    expect(Skeleton.Group).toBe(SkeletonGroup);
  });
});

describe('Skeleton — announcer and motion', () => {
  it('announces a root bone as a polite busy status', () => {
    const { container } = renderWithProviders(<Skeleton width={200} />);
    const bone = container.querySelector('[data-skeleton]') as HTMLElement;
    expect(bone.getAttribute('role')).toBe('status');
    expect(bone.getAttribute('aria-busy')).toBe('true');
    expect(bone.getAttribute('aria-live')).toBe('polite');
    expect(bone.getAttribute('aria-label')).toBe('Loading');
    expect(bone.getAttribute('data-skeleton-variant')).toBe('text');
    expect(bone.getAttribute('tabindex')).toBeNull();
  });

  it('pulses by default and goes static when animate=false', () => {
    const live = renderWithProviders(<Skeleton width={120} />);
    const liveBone = live.container.querySelector('[data-skeleton]') as HTMLElement;
    expect(liveBone.getAttribute('data-animate')).toBe('true');
    expect(liveBone.className).toMatch(/mp-skeleton-pulse/);
    expect(liveBone.className).not.toMatch(/mp-skeleton-static/);
    cleanup();

    const still = renderWithProviders(<Skeleton width={120} animate={false} />);
    const stillBone = still.container.querySelector('[data-skeleton]') as HTMLElement;
    expect(stillBone.getAttribute('data-animate')).toBe('false');
    expect(stillBone.className).toMatch(/mp-skeleton-static/);
    expect(stillBone.className).not.toMatch(/mp-skeleton-pulse/);
  });

  it('animation:none stops the pulse even when animate is true', () => {
    const { container } = renderWithProviders(
      <Preset overrides={{ animation: 'none' }}>
        <Skeleton width={120} animate />
      </Preset>,
    );
    const bone = container.querySelector('[data-skeleton]') as HTMLElement;
    expect(bone.getAttribute('data-animate')).toBe('false');
    expect(bone.className).toMatch(/mp-skeleton-static/);
  });

  it('never accepts pointer events', () => {
    const { container } = renderWithProviders(<Skeleton width={80} height={16} />);
    const bone = container.querySelector('[data-skeleton]') as HTMLElement;
    expect(bone.className).toMatch(/_pe-none/);
  });

  it('fillStyle does not recolour the bone (neutral chrome)', () => {
    const filled = renderWithProviders(
      <Preset overrides={{ fillStyle: 'filled' }}>
        <Skeleton width={80} />
      </Preset>,
    );
    const outlined = renderWithProviders(
      <Preset overrides={{ fillStyle: 'outlined' }}>
        <Skeleton width={80} />
      </Preset>,
    );
    const filledBg = String(filled.container.querySelector('[data-skeleton]')!.className)
      .split(' ')
      .filter((c) => c.startsWith('_bg-'))
      .sort()
      .join(' ');
    const outlinedBg = String(outlined.container.querySelector('[data-skeleton]')!.className)
      .split(' ')
      .filter((c) => c.startsWith('_bg-'))
      .sort()
      .join(' ');
    expect(filledBg).toBe(outlinedBg);
    expect(filledBg.length).toBeGreaterThan(0);
  });
});

describe('Skeleton — radius classes', () => {
  it('text bones ride DEFAULT: square at radius:none, the token at full', () => {
    const none = renderWithProviders(
      <Preset overrides={{ borderRadius: 'none' }}>
        <Skeleton variant="text" width={120} />
      </Preset>,
    );
    expect(radiusClasses(none.container.querySelector('[data-skeleton]') as Element)).toEqual(['_btlr-t-radius-0']);
    cleanup();

    const full = renderWithProviders(
      <Preset overrides={{ borderRadius: 'full' }}>
        <Skeleton variant="text" width={120} />
      </Preset>,
    );
    expect(radiusClasses(full.container.querySelector('[data-skeleton]') as Element)).toEqual(['_btlr-t-radius-12']);
  });

  it('rounded bones track the radius knob (R-SCALE)', () => {
    const none = renderWithProviders(
      <Preset overrides={{ borderRadius: 'none' }}>
        <Skeleton variant="rounded" width={80} height={32} />
      </Preset>,
    );
    expect(radiusClasses(none.container.querySelector('[data-skeleton]') as Element)).toEqual(['_btlr-t-radius-0']);
    cleanup();

    const full = renderWithProviders(
      <Preset overrides={{ borderRadius: 'full' }}>
        <Skeleton variant="rounded" width={80} height={32} />
      </Preset>,
    );
    expect(radiusClasses(full.container.querySelector('[data-skeleton]') as Element)).toEqual(['_btlr-t-radius-12']);
  });

  it('circular bones declare R-PILL and stay round at radius:none', () => {
    const { container } = renderWithProviders(
      <Preset overrides={{ borderRadius: 'none' }}>
        <Skeleton variant="circular" width={40} height={40} />
      </Preset>,
    );
    const bone = container.querySelector('[data-skeleton]') as HTMLElement;
    expect(bone.getAttribute('data-radius-class')).toBe('R-PILL');
    expect(bone.getAttribute('data-radius-part')).toBe('SkeletonCircle');
    expect(bone.getAttribute('data-skeleton-variant')).toBe('circular');
  });

  it('rectangular bones stay square (no radius class, no R-PILL)', () => {
    const { container } = renderWithProviders(
      <Preset overrides={{ borderRadius: 'full' }}>
        <Skeleton variant="rectangular" width={80} height={32} />
      </Preset>,
    );
    const bone = container.querySelector('[data-skeleton]') as HTMLElement;
    expect(bone.getAttribute('data-radius-class')).toBeNull();
    expect(radiusClasses(bone)).toEqual(['_btlr-0px']);
  });
});

describe('SkeletonText', () => {
  it('announces once; child bones are decorative', () => {
    const { container } = renderWithProviders(<SkeletonText lines={3} />);
    const stack = container.querySelector('[data-skeleton-text]') as HTMLElement;
    expect(stack.getAttribute('role')).toBe('status');
    expect(stack.getAttribute('aria-busy')).toBe('true');
    expect(stack.getAttribute('data-lines')).toBe('3');
    const bones = container.querySelectorAll('[data-skeleton]');
    expect(bones).toHaveLength(3);
    for (const bone of bones) {
      expect(bone.getAttribute('aria-hidden')).toBe('true');
      expect(bone.getAttribute('role')).toBeNull();
    }
  });

  it('renders nothing for 0 or negative lines', () => {
    expect(renderWithProviders(<SkeletonText lines={0} />).container.querySelector('[data-skeleton]')).toBeNull();
    cleanup();
    expect(renderWithProviders(<SkeletonText lines={-4} />).container.querySelector('[data-skeleton]')).toBeNull();
  });

  it('shortens only the last line when more than one line exists', () => {
    const { container } = renderWithProviders(<SkeletonText lines={3} lastLineWidth="40%" />);
    const bones = [...container.querySelectorAll('[data-skeleton]')] as HTMLElement[];
    expect(bones).toHaveLength(3);
    expect(bones[0].getAttribute('data-width')).toBe('100%');
    expect(bones[1].getAttribute('data-width')).toBe('100%');
    expect(bones[2].getAttribute('data-width')).toBe('40%');
  });

  it('space knob drives the line gap (SP-GAP)', () => {
    const small = renderWithProviders(
      <Preset overrides={{ space: 'small' }}>
        <SkeletonText lines={2} />
      </Preset>,
    );
    const large = renderWithProviders(
      <Preset overrides={{ space: 'large' }}>
        <SkeletonText lines={2} />
      </Preset>,
    );
    const smallGap = String(small.container.querySelector('[data-skeleton-text]')!.className);
    const largeGap = String(large.container.querySelector('[data-skeleton-text]')!.className);
    expect(smallGap).not.toEqual(largeGap);
  });
});

describe('SkeletonCircle', () => {
  it('stays 1:1 and scales with the size recipe when size is omitted', () => {
    const medium = renderWithProviders(<SkeletonCircle />);
    const mediumBone = medium.container.querySelector('[data-skeleton]') as HTMLElement;
    expect(mediumBone.getAttribute('data-radius-class')).toBe('R-PILL');
    expect(mediumBone.getAttribute('data-skeleton-variant')).toBe('circular');
    const mediumMax = sizeRecipeForToken('$5').height;
    expect(Number(mediumBone.getAttribute('data-diameter'))).toBe(mediumMax);
    cleanup();

    const small = renderWithProviders(
      <Preset overrides={{ size: 'small' }}>
        <SkeletonCircle />
      </Preset>,
    );
    const smallBone = small.container.querySelector('[data-skeleton]') as HTMLElement;
    const smallMax = sizeRecipeForToken('$4').height;
    const smallVal = Number(smallBone.getAttribute('data-diameter'));
    expect(smallVal).toBe(smallMax);
    expect(smallVal).toBeLessThan(mediumMax);
  });

  it('honors an explicit size and a zero diameter', () => {
    const sized = renderWithProviders(<SkeletonCircle size={64} />);
    const sizedBone = sized.container.querySelector('[data-skeleton]') as HTMLElement;
    expect(Number(sizedBone.getAttribute('data-diameter'))).toBe(64);
    cleanup();

    const zero = renderWithProviders(<SkeletonCircle size={0} />);
    const zeroBone = zero.container.querySelector('[data-skeleton]') as HTMLElement;
    expect(Number(zeroBone.getAttribute('data-diameter'))).toBe(0);
  });
});

describe('SkeletonGroup', () => {
  it('announces the group once so nested bones stay decorative', () => {
    const { container } = renderWithProviders(
      <SkeletonGroup>
        <Skeleton width={80} />
        <SkeletonText lines={2} />
      </SkeletonGroup>,
    );
    const group = container.querySelector('[data-skeleton-group]') as HTMLElement;
    expect(group.getAttribute('role')).toBe('status');
    expect(group.getAttribute('aria-busy')).toBe('true');
    expect(container.querySelectorAll('[role="status"]')).toHaveLength(1);
    for (const bone of container.querySelectorAll('[data-skeleton]')) {
      expect(bone.getAttribute('aria-hidden')).toBe('true');
    }
  });
});
