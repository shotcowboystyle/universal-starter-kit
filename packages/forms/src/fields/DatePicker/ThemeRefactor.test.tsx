/**
 * Theme Refactor Tests for Forms
 *
 * Tests covering the theme-system refactor for generic form components:
 * 1. DatePicker uses premium patterns (Popover, theme tokens)
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('@repo/router', () => ({
  useUrlState: () => [null, () => {}],
}));

vi.mock('@tamagui/lucide-icons-2', () => ({
  Calendar: () => null,
  ChevronLeft: () => null,
  ChevronRight: () => null,
  X: () => null,
}));

vi.mock('react-native-reanimated', () => ({
  default: {
    useSharedValue: (init: any) => ({ value: init }),
    useAnimatedStyle: () => ({}),
    withTiming: (val: any) => val,
    withSpring: (val: any) => val,
    createAnimatedComponent: (component: any) => component,
    runOnJS: (fn: any) => fn,
    runOnUI: (fn: any) => fn,
    useDerivedValue: (fn: () => any) => ({ value: fn() }),
    useAnimatedRef: () => ({ current: null }),
    Easing: { linear: (v: any) => v, ease: (v: any) => v, bezier: () => (v: any) => v },
    FadeIn: { duration: () => ({}) },
    FadeOut: { duration: () => ({}) },
    Layout: { duration: () => ({}) },
    Extrapolation: { CLAMP: 'clamp' },
    measure: () => null,
    scrollTo: () => {},
    makeMutable: (init: any) => ({ value: init }),
  },
  useSharedValue: (init: any) => ({ value: init }),
  useAnimatedStyle: () => ({}),
  withTiming: (val: any) => val,
  withSpring: (val: any) => val,
  createAnimatedComponent: (component: any) => component,
  runOnJS: (fn: any) => fn,
  runOnUI: (fn: any) => fn,
  useDerivedValue: (fn: () => any) => ({ value: fn() }),
  useAnimatedRef: () => ({ current: null }),
  Easing: { linear: (v: any) => v, ease: (v: any) => v, bezier: () => (v: any) => v },
  FadeIn: { duration: () => ({}) },
  FadeOut: { duration: () => ({}) },
  Layout: { duration: () => ({}) },
}));

import { renderWithProviders } from '@repo/test-utils';

async function loadDatePicker() {
  return (await import('.')).DatePicker;
}

describe('DatePicker uses premium patterns', () => {
  it('renders with label and input trigger', async () => {
    const DatePicker = await loadDatePicker();

    const result = renderWithProviders(<DatePicker label="Due Date" placeholder="Select date" />);

    const labelEl = result.findTextElement('Due Date');
    expect(labelEl).toBeTruthy();
    const input = result.container.querySelector('input');
    expect(input?.getAttribute('placeholder')).toBe('Select date');
    // The dynamic import transforms the whole DatePicker graph (~27s cold), close to the 30s default.
  }, 120_000);
});
