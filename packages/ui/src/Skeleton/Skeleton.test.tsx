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

import { Skeleton, SkeletonCircle, SkeletonGroup, SkeletonText } from './index';

const radiusClasses = (el: Element): string[] => el.className.split(' ').filter((c) => c.startsWith('_btlr-'));

describe('Skeleton named exports', () => {
  afterEach(cleanup);

  it('serves named exports only (no default) and keeps the namespace statics', async () => {
    const SkeletonExports = await import('./index');
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
  afterEach(cleanup);

  it('announces a root bone as a polite busy status', () => {
    const { container } = renderWithProviders(<Skeleton width={200} />);
    const bone = container.querySelector<HTMLElement>('[data-skeleton]')!;
    expect(bone.getAttribute('role')).toBe('status');
    expect(bone.getAttribute('aria-busy')).toBe('true');
    expect(bone.getAttribute('aria-live')).toBe('polite');
    expect(bone.getAttribute('aria-label')).toBe('Loading');
    expect(bone.dataset.skeletonVariant).toBe('text');
    expect(bone.getAttribute('tabindex')).toBeNull();
  });

  it('pulses by default and goes static when animate=false', () => {
    const live = renderWithProviders(<Skeleton width={120} />);
    const liveBone = live.container.querySelector<HTMLElement>('[data-skeleton]')!;
    expect(liveBone.dataset.animate).toBe('true');
    expect(liveBone.className).toMatch(/mp-skeleton-pulse/u);
    expect(liveBone.className).not.toMatch(/mp-skeleton-static/u);
    cleanup();

    const still = renderWithProviders(
      <Skeleton
        width={120}
        animate={false}
      />,
    );
    const stillBone = still.container.querySelector<HTMLElement>('[data-skeleton]')!;
    expect(stillBone.dataset.animate).toBe('false');
    expect(stillBone.className).toMatch(/mp-skeleton-static/u);
    expect(stillBone.className).not.toMatch(/mp-skeleton-pulse/u);
  });

  it('animation:none stops the pulse even when animate is true', () => {
    const { container } = renderWithProviders(
      <Preset overrides={{ animation: 'none' }}>
        <Skeleton
          width={120}
          animate
        />
      </Preset>,
    );
    const bone = container.querySelector<HTMLElement>('[data-skeleton]')!;
    expect(bone.dataset.animate).toBe('false');
    expect(bone.className).toMatch(/mp-skeleton-static/u);
  });

  it('never accepts pointer events', () => {
    const { container } = renderWithProviders(
      <Skeleton
        width={80}
        height={16}
      />,
    );
    const bone = container.querySelector<HTMLElement>('[data-skeleton]')!;
    expect(bone.className).toMatch(/_pe-none/u);
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
    const filledBg = filled.container
      .querySelector('[data-skeleton]')!
      .className.split(' ')
      .filter((c) => c.startsWith('_bg-'))
      .toSorted()
      .join(' ');
    const outlinedBg = outlined.container
      .querySelector('[data-skeleton]')!
      .className.split(' ')
      .filter((c) => c.startsWith('_bg-'))
      .toSorted()
      .join(' ');
    expect(filledBg).toBe(outlinedBg);
    expect(filledBg.length).toBeGreaterThan(0);
  });
});

describe('Skeleton — radius classes', () => {
  afterEach(cleanup);

  it('text bones ride DEFAULT: square at radius:none, the token at full', () => {
    const none = renderWithProviders(
      <Preset overrides={{ borderRadius: 'none' }}>
        <Skeleton
          variant="text"
          width={120}
        />
      </Preset>,
    );
    expect(radiusClasses(none.container.querySelector('[data-skeleton]')!)).toStrictEqual(['_btlr-t-radius-0']);
    cleanup();

    const full = renderWithProviders(
      <Preset overrides={{ borderRadius: 'full' }}>
        <Skeleton
          variant="text"
          width={120}
        />
      </Preset>,
    );
    expect(radiusClasses(full.container.querySelector('[data-skeleton]')!)).toStrictEqual(['_btlr-t-radius-12']);
  });

  it('rounded bones track the radius knob (R-SCALE)', () => {
    const none = renderWithProviders(
      <Preset overrides={{ borderRadius: 'none' }}>
        <Skeleton
          variant="rounded"
          width={80}
          height={32}
        />
      </Preset>,
    );
    expect(radiusClasses(none.container.querySelector('[data-skeleton]')!)).toStrictEqual(['_btlr-t-radius-0']);
    cleanup();

    const full = renderWithProviders(
      <Preset overrides={{ borderRadius: 'full' }}>
        <Skeleton
          variant="rounded"
          width={80}
          height={32}
        />
      </Preset>,
    );
    expect(radiusClasses(full.container.querySelector('[data-skeleton]')!)).toStrictEqual(['_btlr-t-radius-12']);
  });

  it('circular bones declare R-PILL and stay round at radius:none', () => {
    const { container } = renderWithProviders(
      <Preset overrides={{ borderRadius: 'none' }}>
        <Skeleton
          variant="circular"
          width={40}
          height={40}
        />
      </Preset>,
    );
    const bone = container.querySelector<HTMLElement>('[data-skeleton]')!;
    expect(bone.dataset.radiusClass).toBe('R-PILL');
    expect(bone.dataset.radiusPart).toBe('SkeletonCircle');
    expect(bone.dataset.skeletonVariant).toBe('circular');
  });

  it('rectangular bones stay square (no radius class, no R-PILL)', () => {
    const { container } = renderWithProviders(
      <Preset overrides={{ borderRadius: 'full' }}>
        <Skeleton
          variant="rectangular"
          width={80}
          height={32}
        />
      </Preset>,
    );
    const bone = container.querySelector<HTMLElement>('[data-skeleton]')!;
    expect(bone.dataset.radiusClass).toBeUndefined();
    expect(radiusClasses(bone)).toStrictEqual(['_btlr-0px']);
  });
});

describe(SkeletonText, () => {
  afterEach(cleanup);

  it('announces once; child bones are decorative', () => {
    const { container } = renderWithProviders(<SkeletonText lines={3} />);
    const stack = container.querySelector<HTMLElement>('[data-skeleton-text]')!;
    expect(stack.getAttribute('role')).toBe('status');
    expect(stack.getAttribute('aria-busy')).toBe('true');
    expect(stack.dataset.lines).toBe('3');
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
    const { container } = renderWithProviders(
      <SkeletonText
        lines={3}
        lastLineWidth="40%"
      />,
    );
    const bones = [...container.querySelectorAll('[data-skeleton]')] as HTMLElement[];
    expect(bones).toHaveLength(3);
    expect(bones[0].dataset.width).toBe('100%');
    expect(bones[1].dataset.width).toBe('100%');
    expect(bones[2].dataset.width).toBe('40%');
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
    const smallGap = small.container.querySelector('[data-skeleton-text]')!.className;
    const largeGap = large.container.querySelector('[data-skeleton-text]')!.className;
    expect(smallGap).not.toStrictEqual(largeGap);
  });
});

describe(SkeletonCircle, () => {
  afterEach(cleanup);

  it('stays 1:1 and scales with the size recipe when size is omitted', () => {
    const medium = renderWithProviders(<SkeletonCircle />);
    const mediumBone = medium.container.querySelector<HTMLElement>('[data-skeleton]')!;
    expect(mediumBone.dataset.radiusClass).toBe('R-PILL');
    expect(mediumBone.dataset.skeletonVariant).toBe('circular');
    const mediumMax = sizeRecipeForToken('$5').height;
    expect(Number(mediumBone.dataset.diameter)).toBe(mediumMax);
    cleanup();

    const small = renderWithProviders(
      <Preset overrides={{ size: 'small' }}>
        <SkeletonCircle />
      </Preset>,
    );
    const smallBone = small.container.querySelector<HTMLElement>('[data-skeleton]')!;
    const smallMax = sizeRecipeForToken('$4').height;
    const smallVal = Number(smallBone.dataset.diameter);
    expect(smallVal).toBe(smallMax);
    expect(smallVal).toBeLessThan(mediumMax);
  });

  it('honors an explicit size and a zero diameter', () => {
    const sized = renderWithProviders(<SkeletonCircle size={64} />);
    const sizedBone = sized.container.querySelector<HTMLElement>('[data-skeleton]')!;
    expect(Number(sizedBone.dataset.diameter)).toBe(64);
    cleanup();

    const zero = renderWithProviders(<SkeletonCircle size={0} />);
    const zeroBone = zero.container.querySelector<HTMLElement>('[data-skeleton]')!;
    expect(Number(zeroBone.dataset.diameter)).toBe(0);
  });
});

describe(SkeletonGroup, () => {
  afterEach(cleanup);

  it('announces the group once so nested bones stay decorative', () => {
    const { container } = renderWithProviders(
      <SkeletonGroup>
        <Skeleton width={80} />
        <SkeletonText lines={2} />
      </SkeletonGroup>,
    );
    const group = container.querySelector<HTMLElement>('[data-skeleton-group]')!;
    expect(group.getAttribute('role')).toBe('status');
    expect(group.getAttribute('aria-busy')).toBe('true');
    expect(container.querySelectorAll('[role="status"]')).toHaveLength(1);
    for (const bone of container.querySelectorAll('[data-skeleton]')) {
      expect(bone.getAttribute('aria-hidden')).toBe('true');
    }
  });
});
