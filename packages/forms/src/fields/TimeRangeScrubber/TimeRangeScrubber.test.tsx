import { renderWithProviders } from '@repo/test-utils';
import { Preset, resolveRadiusClass } from '@repo/theme';
import { useForm } from '@tanstack/react-form';
import { act, fireEvent, waitFor } from '@testing-library/react';
import { YStack } from 'tamagui';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Button } from '../../Button';
import { Form } from '../../Form';
import type { DateRange } from '../DatePicker/DateRangePicker';

import {
  DEFAULT_QUICK_RANGES,
  applyQuickRange,
  assertAbsoluteDateRange,
  clampCapLeft,
  dateRangeKeys,
  fractionToTime,
  getScrubberGripRenderSize,
  keysInTrailingWindow,
  latestFrameAtOrBefore,
  resolveScrubberRadius,
  resolveScrubberTransition,
  snapTime,
  timeToFraction,
} from './geometry';

import { TimeRangeScrubber } from './index';
import type { TimeRangeScrubberProps } from './index';

type _ValueIsDateRange =
  NonNullable<TimeRangeScrubberProps['value']> extends DateRange
    ? DateRange extends NonNullable<TimeRangeScrubberProps['value']>
      ? true
      : never
    : never;
const valueTypeCheck: _ValueIsDateRange = true;
void valueTypeCheck;

const NOW = new Date('2026-08-28T14:30:00.000Z');
const WINDOW = {
  start: new Date('2026-08-28T14:00:00.000Z'),
  end: new Date('2026-08-28T14:30:00.000Z'),
};

const mockRailRect = (container: HTMLElement) => {
  const rail = container.querySelector<HTMLElement>("[data-testid='trs-rail']");
  if (!rail) {
    return;
  }
  vi.spyOn(rail, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 400,
    bottom: 44,
    width: 400,
    height: 44,
    toJSON() {
      return {};
    },
  });
};

const stubReducedMotion = (matches: boolean) => {
  const original = window.matchMedia;
  window.matchMedia = ((query: string) => ({
    matches: query.includes('prefers-reduced-motion') ? matches : false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
  })) as typeof window.matchMedia;
  return () => {
    window.matchMedia = original;
  };
};

describe('TimeRangeScrubber geometry', () => {
  it('resolves BINARY via resolveRadiusClass: 0 at none, h/2 at every other stop', () => {
    const stops = ['none', 'small', 'medium', 'large', 'full'] as const;
    for (const height of [20, 28, 16, 26]) {
      for (const stop of stops) {
        const viaHelper = resolveScrubberRadius(stop, height);
        const viaDoctrine = resolveRadiusClass('BINARY', stop, { heightPx: height });
        expect(viaHelper).toBe(viaDoctrine);
        expect(viaHelper).toBe(stop === 'none' ? 0 : height / 2);
      }
    }
  });

  it('sizes the grip 16 / 20 / 26', () => {
    expect(getScrubberGripRenderSize('small')).toBe(16);
    expect(getScrubberGripRenderSize('medium')).toBe(20);
    expect(getScrubberGripRenderSize('large')).toBe(26);
    expect(getScrubberGripRenderSize('$2')).toBe(16);
    expect(getScrubberGripRenderSize('$4')).toBe(20);
    expect(getScrubberGripRenderSize('$5')).toBe(26);
  });

  it('maps time linearly so a gap in time is a gap in fraction', () => {
    expect(timeToFraction(WINDOW.start, WINDOW)).toBe(0);
    expect(timeToFraction(WINDOW.end, WINDOW)).toBe(1);
    expect(timeToFraction(new Date('2026-08-28T14:15:00.000Z'), WINDOW)).toBeCloseTo(0.5);
    const mid = fractionToTime(0.5, WINDOW);
    expect(mid.getTime()).toBe(new Date('2026-08-28T14:15:00.000Z').getTime());
  });

  it('snapTo none stays continuous; frames and grid snap', () => {
    const raw = new Date('2026-08-28T14:15:07.400Z');
    expect(snapTime(raw, 'none').getTime()).toBe(raw.getTime());
    expect(snapTime(raw, 'grid', { gridStepMs: 1000 }).getTime()).toBe(new Date('2026-08-28T14:15:07.000Z').getTime());
    const frames = [new Date('2026-08-28T14:15:00.000Z'), new Date('2026-08-28T14:15:10.000Z')];
    expect(snapTime(raw, 'frames', { frames }).getTime()).toBe(frames[1].getTime());
  });

  it('keys lane reads [t−N, t]; frames hold the latest ≤ t', () => {
    const t = new Date('2026-08-28T14:22:35.000Z');
    const keys = [
      new Date('2026-08-28T14:22:26.000Z'),
      new Date('2026-08-28T14:22:30.000Z'),
      new Date('2026-08-28T14:22:40.000Z'),
    ];
    expect(keysInTrailingWindow(keys, t, 10_000)).toHaveLength(2);
    expect(
      latestFrameAtOrBefore(
        [new Date('2026-08-28T14:22:31.000Z'), new Date('2026-08-28T14:22:40.000Z')],
        t,
      )?.toISOString(),
    ).toBe('2026-08-28T14:22:31.000Z');
  });

  it("emits DateRangePicker's keys and rejects EUI relative strings", () => {
    const range = applyQuickRange(DEFAULT_QUICK_RANGES[0], NOW);
    expect(dateRangeKeys(range)).toStrictEqual(['end', 'start']);
    expect(range.start).toBeInstanceOf(Date);
    expect(range.end).toBeInstanceOf(Date);
    expect(range.end?.getTime()).toBe(NOW.getTime());
    expect(range.start?.getTime()).toBe(NOW.getTime() - 15 * 60 * 1000);
    const asPicker: DateRange = range;
    expect(asPicker.start).toBe(range.start);
    expect(() => applyQuickRange('now-15m', NOW)).toThrow(/relative/u);
    expect(() => assertAbsoluteDateRange({ start: 'now-15m', end: 'now' })).toThrow(/relative/u);
  });

  it('drag and mount stay none; jumps tween quick unless reduced motion', () => {
    expect(resolveScrubberTransition('idle', 'quick', false)).toBe('none');
    expect(resolveScrubberTransition('drag', 'quick', false)).toBe('none');
    expect(resolveScrubberTransition('jump', 'quick', false)).toBe('quick');
    expect(resolveScrubberTransition('jump', 'quick', true)).toBe('none');
    expect(resolveScrubberTransition('jump', undefined, false)).toBe('none');
  });

  it('clamps the playhead cap inside the rail, including at the right edge', () => {
    expect(clampCapLeft(0, 400, 79.6)).toBe(0);
    expect(clampCapLeft(1, 400, 79.6)).toBeCloseTo(320.4);
    expect(clampCapLeft(0.5, 400, 80)).toBe(160);
    expect(clampCapLeft(1, 400, 79.6)).toBeLessThanOrEqual(400 - 79.6);
    expect(clampCapLeft(0.5, 0, 80)).toBeNull();
  });
});

describe(TimeRangeScrubber, () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders grip, brush handles, playhead and frame ticks in the default scheme', () => {
    const frames = [new Date('2026-08-28T14:10:00.000Z'), new Date('2026-08-28T14:20:00.000Z')];
    const result = renderWithProviders(
      <TimeRangeScrubber
        label="Session"
        now={NOW}
        window={WINDOW}
        value={{
          start: new Date('2026-08-28T14:17:30.000Z'),
          end: new Date('2026-08-28T14:27:30.000Z'),
        }}
        frames={frames}
        keys={[new Date('2026-08-28T14:22:30.000Z')]}
        activity={[{ start: WINDOW.start, end: new Date('2026-08-28T14:10:00.000Z') }]}
      />,
    );
    expect(result.container.querySelector("[data-part='grip']")).toBeTruthy();
    expect(result.container.querySelector("[data-part='brush-start']")).toBeTruthy();
    expect(result.container.querySelector("[data-part='brush-end']")).toBeTruthy();
    expect(result.container.querySelector("[data-part='brush-band']")).toBeTruthy();
    expect(result.container.querySelector("[data-part='playhead']")).toBeTruthy();
    expect(result.container.querySelectorAll("[data-part='frame-tick']")).toHaveLength(2);
    expect(result.container.querySelector("[data-part='key-tick']")).toBeTruthy();
    expect(result.container.querySelector("[data-part='activity']")).toBeTruthy();
  });

  it('keeps the 28px playhead cap to a single clock line; frame stale sits outside', () => {
    const scrub = new Date('2026-08-28T14:22:31.000Z');
    const result = renderWithProviders(
      <TimeRangeScrubber
        label="Session"
        now={NOW}
        window={WINDOW}
        scrubTime={scrub}
        frames={[new Date('2026-08-28T14:22:00.000Z')]}
        value={{
          start: new Date('2026-08-28T14:17:30.000Z'),
          end: new Date('2026-08-28T14:27:30.000Z'),
        }}
      />,
    );
    const cap = result.container.querySelector("[data-part='cap']");
    expect(cap).toBeTruthy();
    expect(cap?.textContent?.trim()).toMatch(/^\d{2}:\d{2}:\d{2}$/u);
    expect(cap?.textContent).not.toMatch(/frame/iu);
    const nested = cap?.querySelector("[data-part='frame-stale']");
    expect(nested).toBeFalsy();
    const stale = result.container.querySelector("[data-part='frame-stale']");
    expect(stale).toBeTruthy();
    expect(stale?.textContent).toMatch(/frame/iu);
    expect(cap?.contains(stale)).toBe(false);
  });

  it('paints the grip 0 at borderRadius:none and h/2 at medium', () => {
    const none = renderWithProviders(
      <Preset overrides={{ borderRadius: 'none' }}>
        <TimeRangeScrubber
          label="None"
          now={NOW}
          window={WINDOW}
        />
      </Preset>,
    );
    const noneGrip = none.container.querySelector<HTMLElement>("[data-part='grip']");
    expect(noneGrip?.dataset.radius).toBe('0');
    expect(noneGrip?.dataset.radiusClass).toBe('binary');
    expect(none.container.querySelector<HTMLElement>("[data-part='brush-band']")?.dataset.radius).toBe('0');

    const medium = renderWithProviders(
      <Preset overrides={{ borderRadius: 'medium' }}>
        <TimeRangeScrubber
          label="Medium"
          now={NOW}
          window={WINDOW}
        />
      </Preset>,
    );
    const mediumGrip = medium.container.querySelector<HTMLElement>("[data-part='grip']");
    expect(mediumGrip?.dataset.radius).toBe('10');
    expect(medium.container.querySelector<HTMLElement>("[data-part='brush-band']")?.dataset.radius).toBe('14');
    expect(medium.container.querySelector<HTMLElement>("[data-part='brush-start']")?.dataset.radius).toBe('3.5');
  });

  it('a quick-range chip writes absolute DateRange, never a relative string', async () => {
    const onChange = vi.fn<(value: DateRange | null) => void>();
    const result = renderWithProviders(
      <TimeRangeScrubber
        label="Range"
        now={NOW}
        window={WINDOW}
        onChange={onChange}
      />,
    );
    const chip = [...result.container.querySelectorAll("[data-part='quick-range']")].find((node) =>
      node.textContent?.includes('15 m'),
    );
    expect(chip).toBeTruthy();
    await act(async () => {
      fireEvent.click(chip!);
    });
    expect(onChange).toHaveBeenCalledOnce();
    const emitted = onChange.mock.calls[0][0]!;
    expect(dateRangeKeys(emitted)).toStrictEqual(['end', 'start']);
    expect(emitted.start).toBeInstanceOf(Date);
    expect(emitted.end).toBeInstanceOf(Date);
    expect(JSON.stringify(emitted)).not.toMatch(/now-/u);
    expect(emitted.end?.getTime()).toBe(NOW.getTime());
    expect(emitted.start?.getTime()).toBe(NOW.getTime() - 15 * 60 * 1000);
  });

  it('keyboard moves the playhead and announces with position context', async () => {
    const onScrub = vi.fn<(time: Date) => void>();
    const result = renderWithProviders(
      <TimeRangeScrubber
        label="Session"
        now={NOW}
        window={WINDOW}
        scrubTime={new Date('2026-08-28T14:15:00.000Z')}
        onScrub={onScrub}
        gridStepMs={1000}
      />,
    );
    const grip = result.container.querySelector<HTMLElement>("[data-part='grip']")!;
    expect(Number(grip.getAttribute('tabindex'))).toBeGreaterThan(0);
    await act(async () => {
      fireEvent.keyDown(grip, { key: 'ArrowRight' });
    });
    expect(onScrub).toHaveBeenCalledWith(new Date('2026-08-28T14:15:01.000Z'));
    const live = result.container.querySelector('[aria-live]');
    expect(live?.textContent).toMatch(/playhead|14:15/iu);
  });

  it('keyboard selects a brush range and announces it', async () => {
    const onChange = vi.fn<(value: DateRange | null) => void>();
    const start = new Date('2026-08-28T14:10:00.000Z');
    const end = new Date('2026-08-28T14:20:00.000Z');
    const result = renderWithProviders(
      <TimeRangeScrubber
        label="Session"
        now={NOW}
        window={WINDOW}
        value={{ start, end }}
        onChange={onChange}
        gridStepMs={60_000}
      />,
    );
    const handle = result.container.querySelector<HTMLElement>("[data-part='brush-end']")!;
    expect(Number(handle.getAttribute('tabindex'))).toBeGreaterThan(0);
    await act(async () => {
      fireEvent.keyDown(handle, { key: 'ArrowRight' });
    });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ end: new Date('2026-08-28T14:21:00.000Z') }));
    const emitted = onChange.mock.calls[0][0]!;
    expect(dateRangeKeys(emitted)).toStrictEqual(['end', 'start']);
    expect(emitted.end?.getTime()).toBe(new Date('2026-08-28T14:21:00.000Z').getTime());
    expect(result.container.querySelector('[aria-live]')?.textContent).toMatch(/range/iu);
  });

  it('continuous drag stays 1:1 with the pointer (no jump tween)', async () => {
    const onScrub = vi.fn<(time: Date) => void>();
    const result = renderWithProviders(
      <TimeRangeScrubber
        label="Drag"
        now={NOW}
        window={WINDOW}
        scrubTime={new Date('2026-08-28T14:15:00.000Z')}
        onScrub={onScrub}
      />,
    );
    mockRailRect(result.container);
    const grip = result.container.querySelector<HTMLElement>("[data-part='grip']")!;
    await act(async () => {
      fireEvent.pointerDown(grip, { clientX: 200, pointerId: 1 });
      fireEvent.pointerMove(grip, { clientX: 300, pointerId: 1 });
    });
    expect(grip.dataset.session).toBe('drag');
    expect(grip.dataset.transition).toBe('none');
    expect(onScrub).toHaveBeenLastCalledWith(fractionToTime(300 / 400, WINDOW));
  });

  it('discrete jumps arm the quick tween; reduced motion drops it to none', async () => {
    const result = renderWithProviders(
      <TimeRangeScrubber
        label="Jump"
        now={NOW}
        window={WINDOW}
        scrubTime={new Date('2026-08-28T14:15:00.000Z')}
      />,
    );
    const grip = result.container.querySelector<HTMLElement>("[data-part='grip']")!;
    await act(async () => {
      fireEvent.keyDown(grip, { key: 'Home' });
    });
    expect(grip.dataset.session).toBe('jump');
    expect(grip.dataset.transition).toBe('quick');

    const restore = stubReducedMotion(true);
    try {
      const reduced = renderWithProviders(
        <TimeRangeScrubber
          label="Reduced"
          now={NOW}
          window={WINDOW}
          scrubTime={new Date('2026-08-28T14:15:00.000Z')}
        />,
      );
      const reducedGrip = reduced.container.querySelector<HTMLElement>("[data-part='grip']")!;
      await act(async () => {
        fireEvent.keyDown(reducedGrip, { key: 'End' });
      });
      expect(reducedGrip.dataset.transition).toBe('none');
    } finally {
      restore();
    }
  });

  it('Space lifts and drops; Escape cancels back to the lift origin', async () => {
    const onScrub = vi.fn<(time: Date) => void>();
    const origin = new Date('2026-08-28T14:15:00.000Z');
    const result = renderWithProviders(
      <TimeRangeScrubber
        label="Lift"
        now={NOW}
        window={WINDOW}
        scrubTime={origin}
        onScrub={onScrub}
        gridStepMs={1000}
      />,
    );
    const grip = result.container.querySelector<HTMLElement>("[data-part='grip']")!;
    await act(async () => {
      fireEvent.keyDown(grip, { key: ' ' });
      fireEvent.keyDown(grip, { key: 'ArrowRight' });
      fireEvent.keyDown(grip, { key: 'Escape' });
    });
    expect(onScrub).toHaveBeenLastCalledWith(origin);
    expect(result.container.querySelector('[aria-live]')?.textContent).toMatch(/cancel/iu);
  });

  it('overflow quick ranges open a FloatingPanel', async () => {
    const result = renderWithProviders(
      <TimeRangeScrubber
        label="More"
        now={NOW}
        window={WINDOW}
        maxVisibleQuickRanges={2}
        quickRanges={[...DEFAULT_QUICK_RANGES]}
      />,
    );
    const more = result.container.querySelector<HTMLElement>("[data-part='quick-range-more']")!;
    expect(more).toBeTruthy();
    await act(async () => {
      fireEvent.click(more);
    });
    await waitFor(() => {
      const menu =
        result.container.querySelector("[data-part='quick-range-menu']") ??
        document.body.querySelector("[data-part='quick-range-menu']");
      expect(menu).toBeTruthy();
    });
  });

  it('tab order is grip → brush start → brush end → chips', () => {
    const result = renderWithProviders(
      <TimeRangeScrubber
        label="Tabs"
        now={NOW}
        window={WINDOW}
        value={{
          start: new Date('2026-08-28T14:10:00.000Z'),
          end: new Date('2026-08-28T14:20:00.000Z'),
        }}
      />,
    );
    const tab = (part: string) =>
      Number(result.container.querySelector(`[data-part='${part}']`)?.getAttribute('tabindex'));
    expect(tab('grip')).toBe(1);
    expect(tab('brush-start')).toBe(2);
    expect(tab('brush-end')).toBe(3);
    expect(tab('quick-range')).toBe(4);
    expect(tab('grip')).toBeLessThan(tab('brush-start'));
    expect(tab('brush-start')).toBeLessThan(tab('brush-end'));
    expect(tab('brush-end')).toBeLessThan(tab('quick-range'));
  });

  it('form-integrated value is the DateRange shape', async () => {
    const onSubmit = vi.fn<(value: { window: DateRange }) => void>();
    const Test = () => {
      const form = useForm({
        defaultValues: {
          window: {
            start: new Date('2026-08-28T14:10:00.000Z'),
            end: new Date('2026-08-28T14:20:00.000Z'),
          } as DateRange,
        },
        onSubmit: async ({ value }) => {
          onSubmit(value);
        },
      });
      return (
        <Form form={form}>
          <TimeRangeScrubber
            label="Window"
            name="window"
            now={NOW}
            window={WINDOW}
          />
          <Button
            action="submit"
            testID="submit-button">
            Save
          </Button>
        </Form>
      );
    };
    const result = renderWithProviders(
      <YStack>
        <Test />
      </YStack>,
    );
    await act(async () => {
      fireEvent.click(result.container.querySelector("[data-testid='submit-button']")!);
    });
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          window: expect.objectContaining({ start: expect.any(Date), end: expect.any(Date) }),
        }),
      );
    });
    const submitted = onSubmit.mock.calls[0][0].window;
    expect(dateRangeKeys(submitted)).toStrictEqual(['end', 'start']);
  });

  it('controlled standalone adopts a late value without onChange', async () => {
    const onChange = vi.fn<(value: DateRange | null) => void>();
    const first: DateRange = {
      start: new Date('2026-08-28T14:00:00.000Z'),
      end: new Date('2026-08-28T14:10:00.000Z'),
    };
    const late: DateRange = {
      start: new Date('2026-08-28T14:10:00.000Z'),
      end: new Date('2026-08-28T14:20:00.000Z'),
    };
    const result = renderWithProviders(
      <TimeRangeScrubber
        label="Seed"
        now={NOW}
        window={WINDOW}
        value={first}
        onChange={onChange}
      />,
    );
    result.rerender(
      <TimeRangeScrubber
        label="Seed"
        now={NOW}
        window={WINDOW}
        value={late}
        onChange={onChange}
      />,
    );
    await waitFor(() => {
      const readout = result.container.querySelector<HTMLElement>("[data-part='readout']");
      expect(readout?.dataset.start).toBe(late.start?.toISOString());
      expect(readout?.dataset.end).toBe(late.end?.toISOString());
    });
    expect(onChange).not.toHaveBeenCalled();
  });
});
