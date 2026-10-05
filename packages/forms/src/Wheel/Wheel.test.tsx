import { renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Wheel } from './index';

afterEach(cleanup);

describe('Wheel contrast contract', () => {
  it('keeps the selected row on the body weight and rounding on the selection band', () => {
    renderWithProviders(
      <Preset overrides={{ borderRadius: 'full' }}>
        <Wheel items={[1, 2, 3, 4, 5]} value={3} visibleItems={5} />
      </Preset>,
    );
    const wheel = screen.getByTestId('wheel');
    const selected = wheel.querySelector('[data-selected="true"]')?.firstElementChild;
    const idle = wheel.querySelector('[data-testid="wheel-item"]:not([data-selected="true"])')?.firstElementChild;
    expect(selected).toBeTruthy();
    expect(idle).toBeTruthy();
    expect(getComputedStyle(selected as Element).fontWeight).toBe('400');
    expect(getComputedStyle(selected as Element).fontWeight).toBe(getComputedStyle(idle as Element).fontWeight);
    expect(['', '0px']).toContain(getComputedStyle(wheel).borderTopLeftRadius);
    expect(getComputedStyle(screen.getByTestId('wheel-selection')).borderStartStartRadius).not.toBe('0px');
  });

  it('keeps inactive item text on the AA $color11 ramp (not opacity-dimmed)', () => {
    renderWithProviders(<Wheel items={[1, 2, 3, 4, 5]} value={3} onChange={() => {}} visibleItems={5} />);
    const selected = screen.getByTestId('wheel').querySelector('[data-selected="true"]');
    expect(selected).toBeTruthy();
    // Selected / inactive use token classes — opacity on the row must stay 1 so
    // $color11 clears 4.5:1 (see fix-wheel-contrast.md).
    const rows = screen.getByTestId('wheel').querySelectorAll('[data-testid="wheel-item"]');
    for (const row of rows) {
      expect(getComputedStyle(row as HTMLElement).opacity).toBe('1');
    }
  });

  it('marks disabled wheels for a11y probes without crushing contrast via container opacity', () => {
    renderWithProviders(<Wheel items={[1, 2, 3, 4, 5]} value={3} disabled visibleItems={5} />);
    const wheel = screen.getByTestId('wheel');
    expect(wheel.getAttribute('data-disabled')).toBe('true');
    expect(wheel.getAttribute('aria-disabled')).toBe('true');
    expect(getComputedStyle(wheel).opacity).toBe('1');
  });
});

// ── MOTION-RIDES-KNOB ───────────────────────────────────
// Discrete snaps (keyboard) gate on knobProps.transition: undefined at
// animation "none" (which also carries prefers-reduced-motion) means snap
// duration 0 — the wheel JUMPS, no rAF tween. With motion on, the same snap
// tweens across frames (positive control proving the probe measures motion,
// not just the end state). A `|| "quick"` fallback re-enabling the tween at
// none is the violation this locks out.
describe('Wheel snaps ride the animation knob', () => {
  const items = [10, 20, 30, 40, 50];

  function rowTransform(index: number): string {
    const row = screen
      .getByTestId('wheel')
      .querySelector(`[data-testid="wheel-item"][data-index="${index}"]`) as HTMLElement | null;
    return row?.style.transform ?? '(virtualized out)';
  }

  function wheelSnapshot(): string {
    return items.map((_, index) => rowTransform(index)).join(' | ');
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  function useFrameClock() {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'],
    });
  }

  it('jumps instantly on keyboard snap at animation none — settled within one frame', () => {
    useFrameClock();
    const onChange = vi.fn();
    renderWithProviders(
      <Preset overrides={{ animation: 'none' }}>
        <Wheel items={items} onChange={onChange} visibleItems={5} />
      </Preset>,
    );
    const wrapper = screen.getByTestId('wheel-wrapper');

    fireEvent.keyDown(wrapper, { key: 'ArrowDown' });

    // Snap completed synchronously: selection committed, no tween scheduled.
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(20);
    expect(wrapper.getAttribute('aria-valuenow')).toBe('1');

    // Positions are already settled — 500ms of frames changes nothing.
    const settled = wheelSnapshot();
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(wheelSnapshot()).toBe(settled);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('tweens the same snap with motion on (positive control)', () => {
    useFrameClock();
    const onChange = vi.fn();
    renderWithProviders(
      // Default knobs: animation "quick" — knobProps.transition is defined.
      <Wheel items={items} onChange={onChange} visibleItems={5} />,
    );
    const wrapper = screen.getByTestId('wheel-wrapper');

    fireEvent.keyDown(wrapper, { key: 'ArrowDown' });

    // Tween in flight: selection NOT committed yet, positions move per frame.
    expect(onChange).not.toHaveBeenCalled();
    expect(wrapper.getAttribute('aria-valuenow')).toBe('0');
    const beforeFrames = wheelSnapshot();
    act(() => {
      vi.advanceTimersByTime(32);
    });
    expect(wheelSnapshot()).not.toBe(beforeFrames);
    expect(onChange).not.toHaveBeenCalled();

    // Tween completes (quick ≈ 100ms) and commits exactly one change.
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(20);
    expect(wrapper.getAttribute('aria-valuenow')).toBe('1');
  });

  function flick(wrapper: HTMLElement) {
    fireEvent.pointerDown(wrapper, { clientY: 300, pointerId: 1 });
    act(() => {
      vi.advanceTimersByTime(16);
    });
    fireEvent.pointerMove(wrapper, { clientY: 80, pointerId: 1 });
    fireEvent.pointerUp(wrapper, { clientY: 80, pointerId: 1 });
  }

  it('skips momentum coast at animation none — flick snaps in the same turn', () => {
    useFrameClock();
    const onChange = vi.fn();
    renderWithProviders(
      <Preset overrides={{ animation: 'none' }}>
        <Wheel items={items} onChange={onChange} visibleItems={5} />
      </Preset>,
    );
    const wrapper = screen.getByTestId('wheel-wrapper');
    flick(wrapper);

    // No rAF coast: selection committed before any frames.
    expect(onChange).toHaveBeenCalled();
    const settled = wheelSnapshot();
    const calls = onChange.mock.calls.length;
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(wheelSnapshot()).toBe(settled);
    expect(onChange).toHaveBeenCalledTimes(calls);
  });

  it('coasts after a flick with motion on (positive control)', () => {
    useFrameClock();
    const onChange = vi.fn();
    renderWithProviders(<Wheel items={items} onChange={onChange} visibleItems={5} />);
    const wrapper = screen.getByTestId('wheel-wrapper');
    flick(wrapper);

    expect(onChange).not.toHaveBeenCalled();
    const beforeFrames = wheelSnapshot();
    act(() => {
      vi.advanceTimersByTime(48);
    });
    expect(wheelSnapshot()).not.toBe(beforeFrames);
    expect(onChange).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(onChange).toHaveBeenCalled();
  });
});

describe('Wheel iOS picker contract', () => {
  it('paints the selection band as a fill with no hairline borders', () => {
    renderWithProviders(<Wheel items={[1, 2, 3, 4, 5]} value={3} onChange={() => {}} visibleItems={5} />);
    const band = screen.getByTestId('wheel-selection');
    const style = getComputedStyle(band);
    expect(style.borderTopWidth === '0px' || style.borderTopWidth === '').toBe(true);
    expect(style.borderBottomWidth === '0px' || style.borderBottomWidth === '').toBe(true);
  });

  it('seats the selected row in the highlight band', () => {
    renderWithProviders(
      <Wheel items={[1, 2, 3, 4, 5, 6, 7]} value={4} onChange={() => {}} visibleItems={5} itemHeight={36} />,
    );
    const selected = screen
      .getByTestId('wheel')
      .querySelector('[data-testid="wheel-item"][data-selected="true"]') as HTMLElement;
    expect(selected).toBeTruthy();
    const translateY = Number(/translateY\(([-\d.]+)px\)/.exec(selected.style.transform)?.[1] ?? NaN);
    expect(translateY).toBeCloseTo(2 * 36, 1);
  });

  it('keeps duplicate values as distinct rows', () => {
    renderWithProviders(<Wheel items={[1, 1, 2]} value={2} onChange={() => {}} visibleItems={5} />);
    const rows = screen.getByTestId('wheel').querySelectorAll('[data-testid="wheel-item"]');
    expect(rows.length).toBeGreaterThanOrEqual(3);
  });

  it('taps a visible row to snap it to center', () => {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'],
    });
    const onChange = vi.fn();
    renderWithProviders(<Wheel items={[10, 20, 30, 40, 50]} value={10} onChange={onChange} visibleItems={5} />);
    const wrapper = screen.getByTestId('wheel-wrapper');
    const row = wrapper.querySelector('[data-testid="wheel-item"][data-index="1"]') as HTMLElement | null;
    expect(row).toBeTruthy();
    const translateY = Number(/translateY\(([-\d.]+)px\)/.exec(row!.style.transform)?.[1] ?? 0);
    const rowHeight = Number.parseFloat(row!.style.height) || 32;
    const tapY = translateY + rowHeight / 2;
    fireEvent.pointerDown(wrapper, { clientY: tapY, pointerId: 1 });
    fireEvent.pointerUp(wrapper, { clientY: tapY, pointerId: 1 });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(onChange).toHaveBeenCalledWith(20);
    vi.useRealTimers();
  });

  it('loops from the last item to the first (hours/minutes wrap)', () => {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'],
    });
    const onChange = vi.fn();
    const minutes = Array.from({ length: 60 }, (_, i) => i);
    renderWithProviders(<Wheel items={minutes} value={59} onChange={onChange} loop visibleItems={5} />);
    const wrapper = screen.getByTestId('wheel-wrapper');
    fireEvent.keyDown(wrapper, { key: 'ArrowDown' });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(onChange).toHaveBeenCalledWith(0);
    vi.useRealTimers();
  });

  it('fires onItemCross when a different row seats in the band', () => {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'],
    });
    const onItemCross = vi.fn();
    renderWithProviders(<Wheel items={[10, 20, 30]} value={10} onChange={() => {}} onItemCross={onItemCross} />);
    const wrapper = screen.getByTestId('wheel-wrapper');
    fireEvent.keyDown(wrapper, { key: 'ArrowDown' });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(onItemCross).toHaveBeenCalledWith(20, 1);
    vi.useRealTimers();
  });
});
