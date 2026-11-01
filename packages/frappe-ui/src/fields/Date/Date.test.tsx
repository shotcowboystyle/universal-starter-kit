/**
 * Date wrapper value contract (late-value display fix):
 *
 * The wrapper used to fold the controlled `value` into the forms DatePicker's
 * mount-only `defaultValue` and DROP `onChange` — so a doc value arriving
 * after first paint (create-mode engine seeding on /backoffice/todo/new)
 * never displayed, and picks never reached the consumer doc. It now passes
 * `value` through controlled and converts picked Dates back to the Frappe
 * wire shape. Programmatic value application must not emit onChange (LC-14:
 * a seeded value is not a user edit).
 */

import { renderWithProviders } from '@repo/test-utils';
import { act, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, it, expect, vi, beforeAll } from 'vitest';

// The first field-module import in a cold fork transforms the whole fields
// graph (same budget as tests/fieldRenderers.spec.tsx).
vi.setConfig({ testTimeout: 240_000 });

// Mock react-native-reanimated to prevent ESM module resolution failures
// (same shim as tests/fieldRenderers.spec.tsx).
// oxlint-disable-next-line vitest/prefer-import-in-mock -- the reanimated stub is partial; the real module type rejects it in a typed factory
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

const loadDateField = async () => {
  const mod = await import('.');
  return mod.Date;
};

const getDisplayInput = (container: ParentNode) => container.querySelector('input');

/** Enabled day-cell buttons inside the (portaled) calendar popover. */
const getDayButton = (root: ParentNode, day: number): HTMLButtonElement | undefined => {
  const allButtons = [...root.querySelectorAll('button, [role="button"]')] as HTMLButtonElement[];
  return allButtons.find((btn) => {
    const text = btn.textContent?.trim() ?? '';
    const disabled =
      btn.hasAttribute('disabled') ||
      btn.getAttribute('aria-disabled') === 'true' ||
      Object.hasOwn(btn.dataset, 'disabled');
    return text === String(day) && !disabled;
  });
};

// Warm the graph here, not inside the first `it`: the transform is setup cost
// (110-155s quiet, past 240s under load), and charging it to an assertion made
// whichever case ran first time out.
// oxlint-disable-next-line vitest/require-top-level-describe -- the warm-up must precede every suite in this file
beforeAll(async () => {
  await loadDateField();
}, 900_000);

describe('Date wrapper — late-arriving value display', () => {
  it('a value arriving after mount displays, without onChange', async () => {
    const DateField = await loadDateField();
    const onChange = vi.fn<(value: string) => void>();
    const result = renderWithProviders(
      <DateField
        label="Due Date"
        value=""
        onChange={onChange}
        type="date"
      />,
    );
    expect(getDisplayInput(result.container)?.value ?? '').toBe('');

    // Late seed: the engine applies create defaults once meta loads.
    result.rerender(
      <DateField
        label="Due Date"
        value="2026-03-05"
        onChange={onChange}
        type="date"
      />,
    );
    await waitFor(() => {
      expect(getDisplayInput(result.container)?.value).toBe('Mar 5, 2026');
    });
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('Date wrapper — pick emits the Frappe wire string', () => {
  it('emits YYYY-MM-DD once for a Date field pick', async () => {
    const DateField = await loadDateField();
    const onChange = vi.fn<(value: string) => void>();
    const result = renderWithProviders(
      <DateField
        label="Due Date"
        value="2026-03-05"
        onChange={onChange}
        type="date"
      />,
    );
    const trigger = getDisplayInput(result.container);
    expect(trigger).toBeTruthy();
    await act(async () => {
      if (trigger) {
        fireEvent.click(trigger);
      }
    });
    await waitFor(() => {
      expect(getDayButton(document.body, 15)).toBeTruthy();
    });
    await act(async () => {
      fireEvent.click(getDayButton(document.body, 15)!);
    });
    expect(onChange).toHaveBeenCalledExactlyOnceWith('2026-03-15');
  });

  it('preserves the existing time part for a Datetime field pick', async () => {
    const DateField = await loadDateField();
    const onChange = vi.fn<(value: string) => void>();
    const result = renderWithProviders(
      <DateField
        label="Starts On"
        value="2026-03-05 14:30:00"
        onChange={onChange}
        type="datetime"
      />,
    );
    const trigger = getDisplayInput(result.container);
    expect(trigger).toBeTruthy();
    await act(async () => {
      if (trigger) {
        fireEvent.click(trigger);
      }
    });
    await waitFor(() => {
      expect(getDayButton(document.body, 20)).toBeTruthy();
    });
    await act(async () => {
      fireEvent.click(getDayButton(document.body, 20)!);
    });
    expect(onChange).toHaveBeenCalledExactlyOnceWith('2026-03-20 14:30:00');
  });
});
