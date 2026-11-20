/**
 * The web half honors all three Frappe date fieldtypes, and both halves
 * persist the same bytes for the same pick.
 *
 * The web field used to render ONE date-only calendar whatever the type
 * (SB-M-617): a `Datetime` dropped its time component from the picker, and a
 * `Time` rendered EMPTY, because the calendar adopts its value through
 * `coerceToDate` and `new Date("09:00")` is an Invalid Date. Native, meanwhile,
 * had just been activated with all three implemented. These cases pin the
 * three web controls — display, edit, and the exact wire string — and then
 * drive the SAME pick through both platform halves and assert the emitted
 * strings are byte-identical, which is the only reason one `wire.ts` body is
 * worth sharing.
 *
 * The suite runs on web, so the native half's two native-only edges are mocked
 * exactly as `nativePresentation.spec.tsx` mocks them: the OS picker (recorded
 * rather than rendered) and the platform flags. The web half imports neither.
 */

import { setTimeout as delay } from 'node:timers/promises';

import { renderWithProviders } from '@repo/test-utils';
import { act, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

// Same cold-fork budget as the sibling Date specs: the first field-module
// import transforms the whole fields graph.
vi.setConfig({ testTimeout: 240_000 });

/** The slice of the OS picker's props these cases read and drive. */
interface RecordedPick {
  mode?: string;
  onChange?: (event: { type: string }, date?: Date) => void;
}

const mockState = vi.hoisted(() => ({
  isIos: true,
  isAndroid: false,
  /** Props of every mounted OS picker, newest last. */
  picks: [] as RecordedPick[],
}));

const lastPick = (): RecordedPick => {
  const pick = mockState.picks.at(-1);
  if (pick === undefined) {
    throw new Error('no OS picker has mounted');
  }
  return pick;
};

// oxlint-disable-next-line vitest/prefer-import-in-mock -- the recorder reads only RecordedPick; the real props union rejects it in a typed factory
vi.mock('@react-native-community/datetimepicker', () => ({
  default: (props: RecordedPick) => {
    mockState.picks.push(props);
    return null;
  },
}));

vi.mock(import('@repo/platform'), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    // Live flags: each case flips mockState before mounting.
    platform: {
      ...actual.platform,
      get isIos() {
        return mockState.isIos;
      },
      get isAndroid() {
        return mockState.isAndroid;
      },
    },
  };
});

// Mock react-native-reanimated to prevent ESM module resolution failures
// (same shim as tests/fieldRenderers.spec.tsx).
// oxlint-disable-next-line vitest/prefer-import-in-mock -- the reanimated shim is partial; the real module type rejects it in a typed factory
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

const loadWebDateField = async () => {
  const { Date: DateField } = await import('.');
  return DateField;
};
const loadNativeDateField = async () => {
  const { Date: DateField } = await import('./index.native');
  return DateField;
};

/** Intl puts a narrow no-break space before the meridiem; no test should care. */
const norm = (value: string) => value.replaceAll(/\s+/gu, ' ').trim();

const triggerInput = (root: ParentNode) => root.querySelector('input');

/**
 * Open the panel the way a browser does. FloatingPanel's own opener is
 * `useClick(..., { event: "mousedown" })` while the DatePicker/DatetimePicker
 * triggers carry their own `onPress` — TimePicker's trigger carries none, so
 * a `click`-only test would never open it.
 */
const openPanel = async (input: Element) => {
  await act(async () => {
    fireEvent.mouseDown(input);
    fireEvent.click(input);
  });
  await waitFor(
    () => {
      if (!document.querySelector('[data-testid="floating-panel-viewport"]')) {
        throw new Error('panel never opened');
      }
    },
    { timeout: 30_000 },
  );
};

const panelText = () =>
  norm(
    document.querySelector('[data-testid="floating-panel-viewport"]')?.textContent ?? document.body.textContent ?? '',
  );

/** An enabled day cell inside the (portaled) panel. */
const dayCell = (day: number): HTMLButtonElement | undefined =>
  [...document.body.querySelectorAll<HTMLButtonElement>('button, [role="button"]')].find((btn) => {
    const disabled =
      btn.hasAttribute('disabled') ||
      btn.getAttribute('aria-disabled') === 'true' ||
      Object.hasOwn(btn.dataset, 'disabled');
    return btn.textContent?.trim() === String(day) && !disabled;
  });

/**
 * Click whatever leaf carries this text, once it exists. The wait is the
 * point: first paint of this graph is slow on a loaded machine, and a bare
 * query races it. Clicking the leaf is enough — React bubbles the event to
 * whichever ancestor owns the handler.
 */
const pressText = async (root: ParentNode, text: string) => {
  let target: Element | null = null;
  await waitFor(
    () => {
      const node = [...root.querySelectorAll('*')].find(
        (el) => el.children.length === 0 && norm(el.textContent ?? '') === norm(text),
      );
      if (!node) {
        throw new Error(`no element with text "${text}"`);
      }
      target = node;
    },
    { timeout: 30_000 },
  );
  await act(async () => {
    fireEvent.click(target!);
  });
};

const selectPeriod = async (period: 'AM' | 'PM') => {
  const wheel = document.querySelector('[role="slider"][aria-label="AM/PM"]');
  expect(wheel).toBeTruthy();
  await act(async () => {
    fireEvent.keyDown(wheel!, { key: period === 'AM' ? 'Home' : 'End' });
  });
};

// Warm the graph here, not inside the first `it`: the transform is setup cost
// (110-155s quiet, past 240s under load), and charging it to an assertion made
// whichever case ran first time out.
// oxlint-disable-next-line vitest/require-top-level-describe -- the graph warm-up is shared by every suite in this file
beforeAll(async () => {
  await Promise.all([loadWebDateField(), loadNativeDateField()]);
}, 900_000);

// oxlint-disable-next-line vitest/require-top-level-describe -- the portal cleanup and mock reset apply to every suite in this file
beforeEach(() => {
  // Both halves portal their surfaces, so a previous case's chrome would
  // otherwise still be in the document when the next one queries it.
  cleanup();
  mockState.picks.length = 0;
  mockState.isIos = true;
  mockState.isAndroid = false;
});

// ---------------------------------------------------------------------------
// The web half, one control per type
// ---------------------------------------------------------------------------

describe('web Date field — type=date keeps the calendar', () => {
  it('displays its value, opens a month grid, and writes YYYY-MM-DD', async () => {
    const DateField = await loadWebDateField();
    const onChange = vi.fn<(value: string) => void>();
    const result = renderWithProviders(
      <DateField
        label="Due Date"
        value="2026-03-05"
        onChange={onChange}
        type="date"
      />,
    );

    expect(triggerInput(result.container)?.value).toBe('Mar 5, 2026');

    await openPanel(triggerInput(result.container)!);
    expect(panelText()).toContain('Su');
    // A date-only control offers no clock.
    expect(document.querySelector('[role="slider"][aria-label="Hour"]')).toBeNull();

    await waitFor(
      () => {
        expect(dayCell(15)).toBeTruthy();
      },
      { timeout: 30_000 },
    );
    await act(async () => {
      fireEvent.click(dayCell(15)!);
    });

    expect(onChange).toHaveBeenCalledExactlyOnceWith('2026-03-15');
  });
});

describe('web Date field — type=time renders a time control', () => {
  it('DISPLAYS an existing HH:mm:ss value (it used to render empty)', async () => {
    const DateField = await loadWebDateField();
    const result = renderWithProviders(
      <DateField
        label="Reminder"
        value="09:00:00"
        onChange={vi.fn<(value: string) => void>()}
        type="time"
      />,
    );
    // The defect: `coerceToDate("09:00:00")` is null, so the calendar showed
    // nothing at all for a Time field that had a value.
    await waitFor(
      () => {
        expect(norm(triggerInput(result.container)?.value ?? '')).toBe('9:00 AM');
      },
      {
        timeout: 30_000,
      },
    );
  });

  it('opens hour/minute columns rather than a month grid', async () => {
    const DateField = await loadWebDateField();
    const result = renderWithProviders(
      <DateField
        label="Reminder"
        value="09:00:00"
        onChange={vi.fn<(value: string) => void>()}
        type="time"
      />,
    );
    await openPanel(triggerInput(result.container)!);
    const text = panelText();
    expect(document.querySelector('[role="slider"][aria-label="Hour"]')).toBeTruthy();
    expect(document.querySelector('[role="slider"][aria-label="Min"]')).toBeTruthy();
    expect(text).not.toContain('Su');
  });

  it('an edit writes the Frappe HH:mm:ss wire shape, seconds included', async () => {
    const DateField = await loadWebDateField();
    const onChange = vi.fn<(value: string) => void>();
    const result = renderWithProviders(
      <DateField
        label="Reminder"
        value="09:00:00"
        onChange={onChange}
        type="time"
      />,
    );
    await openPanel(triggerInput(result.container)!);
    // 9:00 AM → PM is a deterministic edit with no wheel animation in it.
    await selectPeriod('PM');

    // The control speaks `HH:mm`; the field re-serializes through the shared
    // wire body, so what persists carries seconds like every other writer.
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith('21:00:00');
    });
  });

  it('adopts a seconds-less HH:mm value too (what Frappe hands a fresh field)', async () => {
    const DateField = await loadWebDateField();
    const result = renderWithProviders(
      <DateField
        label="Reminder"
        value="14:30"
        onChange={vi.fn<(value: string) => void>()}
        type="time"
      />,
    );
    await waitFor(
      () => {
        expect(norm(triggerInput(result.container)?.value ?? '')).toBe('2:30 PM');
      },
      {
        timeout: 30_000,
      },
    );
  });
});

describe('web Date field — type=datetime renders date AND time', () => {
  it('displays both halves of its value', async () => {
    const DateField = await loadWebDateField();
    const result = renderWithProviders(
      <DateField
        label="Starts On"
        value="2026-03-05 14:30:00"
        onChange={vi.fn<(value: string) => void>()}
        type="datetime"
      />,
    );
    // Before the fix this read "Mar 5, 2026" — the time was simply gone.
    await waitFor(
      () => {
        const value = norm(triggerInput(result.container)?.value ?? '');
        expect(value).toContain('Mar 5, 2026');
        expect(value).toContain('2:30 PM');
      },
      { timeout: 30_000 },
    );
  });

  it('offers a time surface as well as the grid', async () => {
    const DateField = await loadWebDateField();
    const result = renderWithProviders(
      <DateField
        label="Starts On"
        value="2026-03-05 14:30:00"
        onChange={vi.fn<(value: string) => void>()}
        type="datetime"
      />,
    );
    await openPanel(triggerInput(result.container)!);
    expect(panelText()).toContain('Su');
    await pressText(document.body, 'Time');
    await waitFor(() => {
      expect(document.querySelector('[role="slider"][aria-label="Hour"]')).toBeTruthy();
    });
  });

  it('a day change keeps the existing time — and the picker, not the serializer, keeps it', async () => {
    const DateField = await loadWebDateField();
    const onChange = vi.fn<(value: string) => void>();
    const result = renderWithProviders(
      <DateField
        label="Starts On"
        value="2026-03-05 14:30:00"
        onChange={onChange}
        type="datetime"
      />,
    );
    await openPanel(triggerInput(result.container)!);
    await waitFor(
      () => {
        expect(dayCell(20)).toBeTruthy();
      },
      { timeout: 30_000 },
    );
    await act(async () => {
      fireEvent.click(dayCell(20)!);
    });
    expect(onChange).toHaveBeenCalledExactlyOnceWith('2026-03-20 14:30:00');
  });

  it('a time change writes the new clock (the branch passes no previousValue)', async () => {
    const DateField = await loadWebDateField();
    const onChange = vi.fn<(value: string) => void>();
    const result = renderWithProviders(
      <DateField
        label="Starts On"
        value="2026-03-05 14:30:00"
        onChange={onChange}
        type="datetime"
      />,
    );
    await openPanel(triggerInput(result.container)!);
    await pressText(document.body, 'Time');
    // 2:30 PM → AM. Carrying `previousValue` here would have pinned the old
    // 14:30 back over the edit the user just made.
    await selectPeriod('AM');
    await waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith('2026-03-05 02:30:00');
    });
  });
});

// ---------------------------------------------------------------------------
// Cross-half parity — the reason one `wire.ts` body is shared
// ---------------------------------------------------------------------------

/** Drive the native half through a pick and return the single emitted string. */
const nativePick = async (
  type: 'date' | 'datetime' | 'time',
  value: string,
  triggerText: string,
  steps: Date[],
): Promise<string> => {
  const DateField = await loadNativeDateField();
  const onChange = vi.fn<(value: string) => void>();
  const result = renderWithProviders(
    <DateField
      label="Field"
      value={value}
      onChange={onChange}
      type={type}
    />,
  );
  await pressText(result.container, triggerText);
  await waitFor(
    () => {
      expect(mockState.picks.length).toBeGreaterThan(0);
    },
    { timeout: 30_000 },
  );

  for (const [index, step] of steps.entries()) {
    const pick = lastPick();
    // oxlint-disable-next-line eslint/no-await-in-loop -- each pick must land before the next step reads the remounted picker
    await act(async () => {
      pick.onChange?.({ type: 'set' }, step);
    });
    // A datetime runs calendar → Next → wheel; the sheet's Next is the seam.
    if (index === 0 && steps.length > 1) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- Next must open the wheel before the next step drives it
      await pressText(document.body, 'Next');
      // oxlint-disable-next-line eslint/no-await-in-loop -- the wheel picker must mount before the next step drives it
      await waitFor(
        () => {
          expect(lastPick().mode).toBe('time');
        },
        {
          timeout: 30_000,
        },
      );
    }
  }
  await pressText(document.body, 'Done');

  expect(onChange).toHaveBeenCalledOnce();
  return onChange.mock.calls[0][0];
};

/** Drive the web half through the equivalent pick and return the last string. */
const webPick = async (
  type: 'date' | 'datetime' | 'time',
  value: string,
  drive: () => Promise<void>,
): Promise<string> => {
  const DateField = await loadWebDateField();
  const onChange = vi.fn<(value: string) => void>();
  const result = renderWithProviders(
    <DateField
      label="Field"
      value={value}
      onChange={onChange}
      type={type}
    />,
  );
  await openPanel(triggerInput(result.container)!);
  await drive();
  await waitFor(
    () => {
      expect(onChange).toHaveBeenCalledWith(expect.any(String));
    },
    { timeout: 30_000 },
  );
  const { lastCall } = onChange.mock;
  if (lastCall === undefined) {
    throw new Error('the web half never emitted');
  }
  return lastCall[0];
};

describe('web and native persist byte-identical wire strings', () => {
  it('date — picking Mar 15 writes the same string on both halves', async () => {
    const web = await webPick('date', '2026-03-05', async () => {
      await waitFor(
        () => {
          expect(dayCell(15)).toBeTruthy();
        },
        { timeout: 30_000 },
      );
      await act(async () => {
        fireEvent.click(dayCell(15)!);
      });
    });
    cleanup();
    mockState.picks.length = 0;
    const native = await nativePick('date', '2026-03-05', 'Mar 5, 2026', [new Date(2026, 2, 15)]);

    expect({ web, native }).toStrictEqual({ web: '2026-03-15', native: '2026-03-15' });
    expect(web).toBe(native);
  });

  it('time — moving 9:00 AM to 9:00 PM writes the same string on both halves', async () => {
    const web = await webPick('time', '09:00:00', async () => {
      await selectPeriod('PM');
    });
    cleanup();
    mockState.picks.length = 0;
    const native = await nativePick('time', '09:00:00', '9:00 AM', [new Date(2026, 2, 5, 21, 0, 0)]);

    expect({ web, native }).toStrictEqual({ web: '21:00:00', native: '21:00:00' });
    expect(web).toBe(native);
  });

  it('datetime — moving the day to Mar 20 writes the same string on both halves', async () => {
    const web = await webPick('datetime', '2026-03-05 14:30:00', async () => {
      await waitFor(
        () => {
          expect(dayCell(20)).toBeTruthy();
        },
        { timeout: 30_000 },
      );
      await act(async () => {
        fireEvent.click(dayCell(20)!);
      });
    });
    cleanup();
    mockState.picks.length = 0;
    // The native two-step: the calendar commits the day (dropping the clock,
    // which is why the wheel step re-supplies it), then the wheel commits it.
    const native = await nativePick('datetime', '2026-03-05 14:30:00', 'Mar 5, 2026, 2:30 PM', [
      new Date(2026, 2, 20),
      new Date(2026, 0, 1, 14, 30),
    ]);

    expect({ web, native }).toStrictEqual({
      web: '2026-03-20 14:30:00',
      native: '2026-03-20 14:30:00',
    });
    expect(web).toBe(native);
  });
});

// ---------------------------------------------------------------------------
// SB-M-614 — disabled must gate every type's opener
// ---------------------------------------------------------------------------

describe('web Date field — a disabled field opens nothing, whatever the type', () => {
  it.each([
    ['date', '2026-03-05'],
    ['datetime', '2026-03-05 14:30:00'],
    ['time', '09:00:00'],
  ] as const)('type=%s', async (type, value) => {
    const DateField = await loadWebDateField();
    const result = renderWithProviders(
      <DateField
        label="Field"
        value={value}
        onChange={vi.fn<(value: string) => void>()}
        type={type}
        disabled
      />,
    );
    const input = triggerInput(result.container)!;
    expect(input.getAttribute('aria-disabled')).toBe('true');

    // Both halves of a real click: the trigger's own handler is gated, but
    // FloatingPanel's opener listens on mousedown and the disabled trigger
    // is pointerEvents-none, so the press falls through to it.
    await act(async () => {
      fireEvent.mouseDown(input);
      fireEvent.click(input);
    });
    await delay(250);
    expect(document.querySelector('[data-testid="floating-panel-viewport"]')).toBeNull();
  });
});
