import { TestProviders } from '@repo/test-utils';
/**
 * useResolvedKnobs behavior specs — the resolution rules consumers feel but
 * that aren't covered by the pure resolveKnobs specs: Tamagui size-token →
 * knob-size mapping, OS reduced-motion forcing animation off, the legacy
 * addListener matchMedia branch, and the semantic-intent Button label color
 * rule (filled binds $color, outlined pins $color11).
 */
import type { ThemeName } from '@tamagui/web';
import { renderHook as renderHookBase } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { defaultKnobs } from './knobs';
import type { Preset as PresetType } from './preset.types';
import { PresetContext, type PresetContextValue } from './PresetContext';
import { useResolvedKnobs } from './useResolvedKnobs';

// These knob behavior tests hold the color scheme constant.
vi.mock(import('tamagui'), async (importOriginal) => ({
  ...(await importOriginal()),
  useThemeName: () => 'light',
}));

const renderHook: typeof renderHookBase = (hook, options) => {
  const InnerWrapper = options?.wrapper;
  return renderHookBase(hook, {
    ...options,
    wrapper: ({ children }) =>
      createElement(TestProviders, null, InnerWrapper ? createElement(InnerWrapper, null, children) : children),
  });
};

let originalMatchMedia: typeof window.matchMedia;

function stubMatchMedia(impl: (query: string) => Partial<MediaQueryList> & Record<string, unknown>) {
  window.matchMedia = vi.fn((query: string) => impl(query) as MediaQueryList) as typeof window.matchMedia;
}

function modernMq(matches: boolean) {
  return {
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
}

beforeEach(() => {
  originalMatchMedia = window.matchMedia;
  stubMatchMedia(() => modernMq(false));
});

afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

function presetWrapper(preset: PresetType) {
  const ctx: PresetContextValue = { preset };
  return ({ children }: { children: ReactNode }) => createElement(PresetContext.Provider, { value: ctx }, children);
}

function makePreset(overrides: Partial<PresetType> = {}): PresetType {
  return {
    theme: 'light' as ThemeName,
    knobs: { ...defaultKnobs },
    intents: {},
    tints: [],
    ...overrides,
  };
}

describe('size token mapping', () => {
  it.each([
    ['$1', 'small'],
    ['$3', 'small'],
    ['$4', 'medium'],
    ['$5', 'large'],
    ['$6', 'large'],
    ['$true', 'medium'],
  ] as const)('maps Tamagui size %s to knob size %s', (token, expected) => {
    const { result } = renderHook(() => useResolvedKnobs({ size: token as never }));
    expect(result.current.knobProps.size).toBe(expected);
  });

  it('keeps the knob size for unmapped tokens', () => {
    const { result } = renderHook(() => useResolvedKnobs({ size: '$11' as never }));
    expect(result.current.knobProps.size).toBe(defaultKnobs.size);
  });
});

describe('reduced motion', () => {
  it("keeps the animation knob's transition when the OS does not prefer reduced motion", () => {
    const { result } = renderHook(() => useResolvedKnobs());
    expect(result.current.knobProps.transition).toBe(defaultKnobs.animation);
  });

  it('forces the transition off when prefers-reduced-motion matches', () => {
    stubMatchMedia((query) => modernMq(query === '(prefers-reduced-motion: reduce)'));
    const { result } = renderHook(() => useResolvedKnobs());
    expect(result.current.knobProps.transition).toBeUndefined();
  });

  it('supports legacy MediaQueryList hosts exposing only addListener', () => {
    const addListener = vi.fn();
    const removeListener = vi.fn();
    stubMatchMedia(() => ({ matches: true, addListener, removeListener }));
    const { result, unmount } = renderHook(() => useResolvedKnobs());
    expect(result.current.knobProps.transition).toBeUndefined();
    expect(addListener).toHaveBeenCalledWith(expect.any(Function));
    unmount();
    expect(removeListener).toHaveBeenCalledWith(expect.any(Function));
  });
});

describe('semantic-intent Button label color', () => {
  it('binds filled error Buttons to $color (the on-fill foreground)', () => {
    // defaultIntents.error sets Button.fillStyle = "filled".
    const { result } = renderHook(() => useResolvedKnobs({ intent: 'error', component: 'Button' }));
    expect(result.current.knobProps.body.color).toBe('$color');
  });

  it('pins outlined error Buttons to $color11 (readable on page surfaces)', () => {
    const preset = makePreset({
      intents: { error: { Button: { fillStyle: 'outlined' } } },
    });
    const { result } = renderHook(() => useResolvedKnobs({ intent: 'error', component: 'Button' }), {
      wrapper: presetWrapper(preset),
    });
    expect(result.current.knobProps.body.color).toBe('$color11');
  });

  it('leaves non-semantic intents without the label override', () => {
    const { result } = renderHook(() => useResolvedKnobs({ intent: 'accent', component: 'Button' }));
    const plain = renderHook(() => useResolvedKnobs());
    expect(result.current.knobProps.body.color).toBe(plain.result.current.knobProps.body.color);
  });
});

describe('intent + component knob merging', () => {
  it('applies intent-level string overrides and component-level objects', () => {
    const preset = makePreset({
      intents: {
        error: {
          borderRadius: 'small',
          Card: { elevation: 'large' },
        },
      },
    });
    const withComponent = renderHook(() => useResolvedKnobs({ intent: 'error', component: 'Card' }), {
      wrapper: presetWrapper(preset),
    });
    const withoutComponent = renderHook(() => useResolvedKnobs({ intent: 'error' }), {
      wrapper: presetWrapper(preset),
    });
    // Component-scoped override only applies when the component matches.
    expect(withComponent.result.current.knobProps.elevation).not.toBe(
      withoutComponent.result.current.knobProps.elevation,
    );
    // Intent-level knob override applies to both.
    expect(withComponent.result.current.knobProps.borderRadius).toEqual(
      withoutComponent.result.current.knobProps.borderRadius,
    );
  });

  it('compact option does not shrink size; it shrinks gap and sets density compact', () => {
    const comfortable = renderHook(() => useResolvedKnobs());
    const compact = renderHook(() => useResolvedKnobs({ compact: true }));
    expect(comfortable.result.current.knobProps.size).toBe('medium');
    expect(compact.result.current.knobProps.size).toBe('medium');
    expect(compact.result.current.knobProps.sizeToken).toBe(comfortable.result.current.knobProps.sizeToken);
    expect(compact.result.current.knobProps.control.height).toBe(comfortable.result.current.knobProps.control.height);
    expect(compact.result.current.knobProps.density).toBe('compact');
    expect(comfortable.result.current.knobProps.gap).toEqual({ gap: '$4' });
    expect(compact.result.current.knobProps.gap).toEqual({ gap: '$2' });
  });
});
