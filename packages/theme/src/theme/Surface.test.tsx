import { TestProviders } from '@repo/test-utils';
/**
 * Surface context — nested size/density step-down.
 */
import { render, renderHook } from '@testing-library/react';
import { createElement } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Surface } from './Surface';
import { SurfaceContext, clampSurfaceDensity, clampSurfaceSize } from './surface-context';
import type { SurfaceIntent } from './surface-context';
import { useResolvedKnobs } from './use-resolved-knobs';

// These structural context tests hold the color scheme constant.
vi.mock(import('tamagui'), async (importOriginal) => ({
  ...(await importOriginal()),
  useThemeName: () => 'light',
}));

const surfaceWrapper = (surfaceProps: ComponentProps<typeof Surface>) =>
  function SurfaceWrapper({ children }: { children: ReactNode }) {
    return createElement(TestProviders, null, createElement(Surface, surfaceProps, children));
  };

const Probe = ({ onRead }: { onRead: (intent: SurfaceIntent) => void }) => {
  onRead(SurfaceContext.useStyledContext());
  return null;
};

const renderNested = (
  outer: { size?: 'small' | 'medium' | 'large'; density?: 'compact' | 'comfortable' },
  inner: { size?: 'small' | 'medium' | 'large'; density?: 'compact' | 'comfortable' },
): SurfaceIntent => {
  let intent: SurfaceIntent | undefined;
  render(
    createElement(
      Surface,
      outer,
      createElement(Surface, inner, createElement(Probe, { onRead: (value) => (intent = value) })),
    ),
  );
  if (!intent) {
    throw new Error('Surface probe did not render');
  }
  return intent;
};

describe(Surface, () => {
  let originalMatchMedia: typeof window.matchMedia;

  beforeEach(() => {
    originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn<() => MediaQueryList>(
      () =>
        ({
          matches: false,
          addEventListener: vi.fn<() => void>(),
          removeEventListener: vi.fn<() => void>(),
        }) as unknown as MediaQueryList,
    ) as typeof window.matchMedia;
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  describe(clampSurfaceSize, () => {
    it('unset parent is no ceiling', () => {
      expect(clampSurfaceSize('large', 'unset')).toBe('large');
      expect(clampSurfaceSize('unset', 'unset')).toBe('unset');
    });

    it('unset requested inherits parent', () => {
      expect(clampSurfaceSize('unset', 'small')).toBe('small');
      expect(clampSurfaceSize('unset', 'large')).toBe('large');
    });

    it('never exceeds parent', () => {
      expect(clampSurfaceSize('large', 'small')).toBe('small');
      expect(clampSurfaceSize('medium', 'small')).toBe('small');
      expect(clampSurfaceSize('large', 'medium')).toBe('medium');
    });

    it('tighter than parent is allowed', () => {
      expect(clampSurfaceSize('small', 'large')).toBe('small');
      expect(clampSurfaceSize('medium', 'large')).toBe('medium');
      expect(clampSurfaceSize('small', 'medium')).toBe('small');
    });
  });

  describe(clampSurfaceDensity, () => {
    it('unset parent is no ceiling', () => {
      expect(clampSurfaceDensity('comfortable', 'unset')).toBe('comfortable');
    });

    it('unset requested inherits parent', () => {
      expect(clampSurfaceDensity('unset', 'compact')).toBe('compact');
    });

    it('never exceeds parent; tighter is allowed', () => {
      expect(clampSurfaceDensity('comfortable', 'compact')).toBe('compact');
      expect(clampSurfaceDensity('compact', 'comfortable')).toBe('compact');
    });
  });

  describe('Surface nesting', () => {
    it('nested Surface size large inside small resolves small', () => {
      expect(renderNested({ size: 'small' }, { size: 'large' }).size).toBe('small');
    });

    it('nested comfortable inside compact resolves compact', () => {
      expect(renderNested({ density: 'compact' }, { density: 'comfortable' }).density).toBe('compact');
    });

    it('nested small inside large resolves small (tighter allowed)', () => {
      expect(renderNested({ size: 'large' }, { size: 'small' }).size).toBe('small');
    });
  });

  describe('useResolvedKnobs inside Surface', () => {
    it('size=small density=compact → sizeToken $3, compact gap, small desktop control height', () => {
      const wrapper = surfaceWrapper({ size: 'small', density: 'compact' });
      const { result } = renderHook(() => useResolvedKnobs(), { wrapper });
      expect(result.current.knobProps.size).toBe('small');
      expect(result.current.knobProps.sizeToken).toBe('$3');
      expect(result.current.knobProps.density).toBe('compact');
      expect(result.current.knobProps.gap).toStrictEqual({ gap: '$2' });
      expect(result.current.knobProps.control.height).toBe(36);
    });

    it('a large size request inside a medium Surface resolves medium', () => {
      const wrapper = surfaceWrapper({ size: 'medium' });
      const { result } = renderHook(() => useResolvedKnobs({ size: '$5' }), { wrapper });
      expect(result.current.knobProps.size).toBe('medium');
      expect(result.current.knobProps.sizeToken).toBe('$4');
    });

    it('Surface size is inherited as the subtree default (lg over global medium)', () => {
      const wrapper = surfaceWrapper({ size: 'lg' });
      const { result } = renderHook(() => useResolvedKnobs(), { wrapper });
      expect(result.current.knobProps.size).toBe('large');
      expect(result.current.knobProps.sizeToken).toBe('$5');
    });

    it('compact:false inside a compact Surface stays compact and still steps space', () => {
      const wrapper = surfaceWrapper({ density: 'compact' });
      const { result } = renderHook(() => useResolvedKnobs({ compact: false }), { wrapper });
      expect(result.current.knobProps.density).toBe('compact');
      expect(result.current.knobProps.gap).toStrictEqual({ gap: '$2' });
    });
  });
});
