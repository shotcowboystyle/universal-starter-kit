/**
 * What the native `Date` field asks the OS picker for.
 *
 * The file this covers was unreachable until it was renamed from
 * `date.native.tsx` to `index.native.tsx`, so nothing had ever exercised it.
 * These cases pin the presentation contract that rename makes live:
 *
 * - iOS `date` opens the iOS 14+ calendar (`display="inline"`), not the legacy
 *   wheel — the whole point of the change.
 * - iOS `time` keeps the wheel, which is still the correct iOS control.
 * - iOS `datetime` runs calendar → wheel across the sheet's Next button, and
 *   commits one Frappe wire string built from both halves.
 * - Android keeps `display="default"`, the Material dialog, and runs its own
 *   date-then-time sequence.
 *
 * The suite runs on web, so `react-native` resolves to `react-native-web` and
 * the two native-only edges are mocked: the picker itself (recorded rather
 * than rendered) and the platform flags.
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

// Same cold-fork budget as the sibling Date.spec.tsx: the first field-module
// import transforms the whole fields graph.
vi.setConfig({ testTimeout: 240_000 });

const mockState = vi.hoisted(() => ({
  isIos: true,
  isAndroid: false,
  /** Props of every mounted picker, newest last. */
  picks: [] as Record<string, unknown>[],
  keyboardInset: 0,
}));

vi.mock(import('../../shared/useKeyboardInset'), () => ({
  useKeyboardInset: () => mockState.keyboardInset,
}));

vi.mock(import('@react-native-community/datetimepicker'), () => ({
  default: (props: Record<string, unknown>) => {
    mockState.picks.push(props);
    return null;
  },
}));

vi.mock(import('@repo/platform'), async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  const real = actual.platform as Record<string, unknown>;
  return {
    ...actual,
    platform: new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === 'isIos') {
            return mockState.isIos;
          }
          if (prop === 'isAndroid') {
            return mockState.isAndroid;
          }
          return real[prop as string];
        },
      },
    ),
  };
});

// Mock react-native-reanimated to prevent ESM module resolution failures
// (same shim as tests/fieldRenderers.spec.tsx).
vi.mock(import('react-native-reanimated'), () => ({
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
import { act, cleanup, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

async function loadNativeDateField() {
  return (await import('./index.native')).Date;
}

/** Intl puts a narrow no-break space before the meridiem; the test should not care. */
const norm = (value: string) => value.replaceAll(/\s+/gu, ' ').trim();

/**
 * Press whatever pressable carries this text, once it exists. The wait is the
 * point: the first paint of this graph can take a while on a loaded machine,
 * and a bare query races it.
 */
async function press(root: ParentNode, text: string) {
  let target: Element | null = null;
  await waitFor(
    () => {
      const node = [...root.querySelectorAll('*')].find(
        (el) => el.children.length === 0 && norm(el.textContent ?? '') === norm(text),
      );
      if (!node) {
        throw new Error(`no element with text "${text}"`);
      }
      target = node.closest('button, [role="button"]') ?? node;
    },
    { timeout: 30_000 },
  );
  fireEvent.click(target!);
}

const lastPick = () => mockState.picks.at(-1);
const waitForPick = async (predicate: () => void) => {
  await waitFor(predicate, { timeout: 30_000 });
};

// Warm the graph here, not inside the first `it`: the transform is setup cost
// (110-155s quiet, past 240s under load), and charging it to an assertion made
// whichever case ran first time out.
beforeAll(async () => {
  await loadNativeDateField();
}, 900_000);

beforeEach(() => {
  // The iOS sheet is a portal, so a previous case's chrome would otherwise
  // still be in the document when the next one asserts on it.
  cleanup();
  mockState.picks.length = 0;
  mockState.isIos = true;
  mockState.isAndroid = false;
  mockState.keyboardInset = 0;
});

describe('native Date field — iOS presentation', () => {
  it('a date opens the calendar, not the legacy wheel', async () => {
    const DateField = await loadNativeDateField();
    const result = renderWithProviders(
      <DateField
        label="Due Date"
        value="2026-03-15"
        onChange={vi.fn()}
        type="date"
      />,
    );

    await press(result.container, 'Mar 15, 2026');

    await waitForPick(() => {
      expect(mockState.picks.length).toBeGreaterThan(0);
    });
    expect(lastPick().mode).toBe('date');
    expect(lastPick().display).toBe('inline');
    // `spinner` for a date is the pre-iOS-14 wheel this change removes.
    expect(lastPick().display).not.toBe('spinner');
    // The one styling channel an OS control exposes is still driven.
    expect(['light', 'dark']).toContain(lastPick().themeVariant);
  });

  it('shrinks the calendar when the keyboard is up so the sheet can sit above it', async () => {
    mockState.keyboardInset = 420;
    const DateField = await loadNativeDateField();
    const result = renderWithProviders(
      <DateField
        label="Due Date"
        value="2026-03-15"
        onChange={vi.fn()}
        type="date"
      />,
    );

    await press(result.container, 'Mar 15, 2026');

    await waitForPick(() => {
      expect(mockState.picks.length).toBeGreaterThan(0);
    });
    const style = lastPick().style as { height: number };
    expect(style.height).toBeLessThan(360);
  });

  it('a time keeps the wheel', async () => {
    const DateField = await loadNativeDateField();
    const result = renderWithProviders(
      <DateField
        label="Reminder"
        value="09:00:00"
        onChange={vi.fn()}
        type="time"
      />,
    );

    await press(result.container, '9:00 AM');

    await waitForPick(() => {
      expect(mockState.picks.length).toBeGreaterThan(0);
    });
    expect(lastPick().mode).toBe('time');
    expect(lastPick().display).toBe('spinner');
  });

  it('a datetime runs calendar then wheel, and commits both halves', async () => {
    const DateField = await loadNativeDateField();
    const onChange = vi.fn();
    const result = renderWithProviders(
      <DateField
        label="Starts On"
        value="2026-03-15 14:30:00"
        onChange={onChange}
        type="datetime"
      />,
    );

    await press(result.container, 'Mar 15, 2026, 2:30 PM');
    await waitForPick(() => {
      expect(mockState.picks.length).toBeGreaterThan(0);
    });
    expect(lastPick().mode).toBe('date');
    expect(lastPick().display).toBe('inline');

    await press(document.body, 'Next');
    await waitForPick(() => {
      expect(lastPick().mode).toBe('time');
    });
    expect(lastPick().display).toBe('spinner');

    await press(document.body, 'Done');
    // Untouched, the sheet commits the value it opened on — the point is the
    // wire shape, which carries both halves and no UTC rendering.
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith('2026-03-15 14:30:00');
  });
});

describe('native Date field — Android presentation', () => {
  it('keeps the Material dialog and mounts inline, without the iOS sheet', async () => {
    mockState.isIos = false;
    mockState.isAndroid = true;

    const DateField = await loadNativeDateField();
    const result = renderWithProviders(
      <DateField
        label="Due Date"
        value="2026-03-15"
        onChange={vi.fn()}
        type="date"
      />,
    );

    await press(result.container, 'Mar 15, 2026');

    await waitForPick(() => {
      expect(mockState.picks.length).toBeGreaterThan(0);
    });
    expect(lastPick().mode).toBe('date');
    expect(lastPick().display).toBe('default');
    // No sheet on Android: the dialog is its own window, so there is no Done.
    expect(result.container.textContent).not.toContain('Done');
  });

  it('a datetime advances from date to time after the first commit', async () => {
    mockState.isIos = false;
    mockState.isAndroid = true;

    const DateField = await loadNativeDateField();
    const onChange = vi.fn();
    const result = renderWithProviders(
      <DateField
        label="Starts On"
        value="2026-03-15 14:30:00"
        onChange={onChange}
        type="datetime"
      />,
    );

    await press(result.container, 'Mar 15, 2026, 2:30 PM');
    await waitForPick(() => {
      expect(mockState.picks.length).toBeGreaterThan(0);
    });
    expect(lastPick().mode).toBe('date');

    const onPickerChange = lastPick().onChange as (event: unknown, date?: Date) => void;
    await act(async () => {
      onPickerChange({ type: 'set' }, new Date(2026, 2, 20, 0, 0));
    });
    await waitForPick(() => {
      expect(lastPick().mode).toBe('time');
    });
    expect(onChange).not.toHaveBeenCalled();

    const onTimeChange = lastPick().onChange as (event: unknown, date?: Date) => void;
    await act(async () => {
      onTimeChange({ type: 'set' }, new Date(2026, 0, 1, 9, 45));
    });
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith('2026-03-20 09:45:00');
  });
});
