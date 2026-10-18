import { renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Wheel } from './index';

const rowTransform = (index: number): string => {
  const row = screen
    .getByTestId('wheel')
    .querySelector<HTMLElement>(`[data-testid="wheel-item"][data-index="${index}"]`);
  return row?.style.transform ?? '(virtualized out)';
};

const useFrameClock = () => {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'],
  });
};

const flick = (wrapper: HTMLElement) => {
  fireEvent.pointerDown(wrapper, { clientY: 300, pointerId: 1 });
  act(() => {
    vi.advanceTimersByTime(16);
  });
  fireEvent.pointerMove(wrapper, { clientY: 80, pointerId: 1 });
  fireEvent.pointerUp(wrapper, { clientY: 80, pointerId: 1 });
};

describe('Wheel contrast contract', () => {
  afterEach(cleanup);

  it('keeps inactive item text on the AA $color11 ramp (not opacity-dimmed)', () => {
    renderWithProviders(
      <Wheel
        items={[1, 2, 3, 4, 5]}
        value={3}
        onChange={() => {}}
        visibleItems={5}
      />,
    );
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
    renderWithProviders(
      <Wheel
        items={[1, 2, 3, 4, 5]}
        value={3}
        disabled
        visibleItems={5}
      />,
    );
    const wheel = screen.getByTestId('wheel');
    expect(wheel.dataset.disabled).toBe('true');
    expect(wheel.getAttribute('aria-disabled')).toBe('true');
    expect(getComputedStyle(wheel).opacity).toBe('1');
  });
});

// ── MOTION-RIDES-KNOB ─────────────────────────────────────────
// Discrete snaps (keyboard) gate on knobProps.transition: undefined at
// animation "none" (which also carries prefers-reduced-motion) means snap
// duration 0 — the wheel JUMPS, no rAF tween. With motion on, the same snap
// tweens across frames (positive control proving the probe measures motion,
// not just the end state). A `|| "quick"` fallback re-enabling the tween at
// none is the violation this locks out.
describe('Wheel snaps ride the animation knob', () => {
  const items = [10, 20, 30, 40, 50];

  const wheelSnapshot = (): string => items.map((_, index) => rowTransform(index)).join(' | ');

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('jumps instantly on keyboard snap at animation none — settled within one frame', () => {
    useFrameClock();
    const onChange = vi.fn<(value: number) => void>();
    renderWithProviders(
      <Preset overrides={{ animation: 'none' }}>
        <Wheel
          items={items}
          onChange={onChange}
          visibleItems={5}
        />
      </Preset>,
    );
    const wrapper = screen.getByTestId('wheel-wrapper');

    fireEvent.keyDown(wrapper, { key: 'ArrowDown' });

    // Snap completed synchronously: selection committed, no tween scheduled.
    expect(onChange).toHaveBeenCalledExactlyOnceWith(20);
    expect(wrapper.getAttribute('aria-valuenow')).toBe('1');

    // Positions are already settled — 500ms of frames changes nothing.
    const settled = wheelSnapshot();
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(wheelSnapshot()).toBe(settled);
    expect(onChange).toHaveBeenCalledOnce();
  });

  it('tweens the same snap with motion on (positive control)', () => {
    useFrameClock();
    const onChange = vi.fn<(value: number) => void>();
    renderWithProviders(
      // Default knobs: animation "quick" — knobProps.transition is defined.
      <Wheel
        items={items}
        onChange={onChange}
        visibleItems={5}
      />,
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
    expect(onChange).toHaveBeenCalledExactlyOnceWith(20);
    expect(wrapper.getAttribute('aria-valuenow')).toBe('1');
  });

  it('skips momentum coast at animation none — flick snaps in the same turn', () => {
    useFrameClock();
    const onChange = vi.fn<(value: number) => void>();
    renderWithProviders(
      <Preset overrides={{ animation: 'none' }}>
        <Wheel
          items={items}
          onChange={onChange}
          visibleItems={5}
        />
      </Preset>,
    );
    const wrapper = screen.getByTestId('wheel-wrapper');
    flick(wrapper);

    // No rAF coast: selection committed before any frames.
    expect(onChange).toHaveBeenCalledWith(50);
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
    const onChange = vi.fn<(value: number) => void>();
    renderWithProviders(
      <Wheel
        items={items}
        onChange={onChange}
        visibleItems={5}
      />,
    );
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
    expect(onChange).toHaveBeenCalledWith(50);
  });
});

describe('Wheel iOS picker contract', () => {
  afterEach(cleanup);

  it('paints the selection band as a fill with no hairline borders', () => {
    renderWithProviders(
      <Wheel
        items={[1, 2, 3, 4, 5]}
        value={3}
        onChange={() => {}}
        visibleItems={5}
      />,
    );
    const band = screen.getByTestId('wheel-selection');
    const style = getComputedStyle(band);
    expect(style.borderTopWidth === '0px' || style.borderTopWidth === '').toBe(true);
    expect(style.borderBottomWidth === '0px' || style.borderBottomWidth === '').toBe(true);
  });

  it('seats the selected row in the highlight band', () => {
    renderWithProviders(
      <Wheel
        items={[1, 2, 3, 4, 5, 6, 7]}
        value={4}
        onChange={() => {}}
        visibleItems={5}
        itemHeight={36}
      />,
    );
    const selected = screen
      .getByTestId('wheel')
      .querySelector<HTMLElement>('[data-testid="wheel-item"][data-selected="true"]')!;
    expect(selected).toBeTruthy();
    const translateY = Number(
      /translateY\((?<offset>[-\d.]+)px\)/u.exec(selected.style.transform)?.groups?.offset ?? Number.NaN,
    );
    expect(translateY).toBeCloseTo(2 * 36, 1);
  });

  it('keeps duplicate values as distinct rows', () => {
    renderWithProviders(
      <Wheel
        items={[1, 1, 2]}
        value={2}
        onChange={() => {}}
        visibleItems={5}
      />,
    );
    const rows = screen.getByTestId('wheel').querySelectorAll('[data-testid="wheel-item"]');
    expect(rows.length).toBeGreaterThanOrEqual(3);
  });

  it('taps a visible row to snap it to center', () => {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'],
    });
    const onChange = vi.fn<(value: number) => void>();
    renderWithProviders(
      <Wheel
        items={[10, 20, 30, 40, 50]}
        value={10}
        onChange={onChange}
        visibleItems={5}
      />,
    );
    const wrapper = screen.getByTestId('wheel-wrapper');
    const row = wrapper.querySelector<HTMLElement>('[data-testid="wheel-item"][data-index="1"]');
    expect(row).toBeTruthy();
    const translateY = Number(/translateY\((?<offset>[-\d.]+)px\)/u.exec(row!.style.transform)?.groups?.offset ?? 0);
    const rowHeight = Number(row!.style.height.replace(/px$/u, '')) || 32;
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
    const onChange = vi.fn<(value: number) => void>();
    const minutes = Array.from({ length: 60 }, (_, i) => i);
    renderWithProviders(
      <Wheel
        items={minutes}
        value={59}
        onChange={onChange}
        loop
        visibleItems={5}
      />,
    );
    const wrapper = screen.getByTestId('wheel-wrapper');
    fireEvent.keyDown(wrapper, { key: 'ArrowDown' });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(onChange).toHaveBeenCalledWith(0);
    vi.useRealTimers();
  });
});

describe('Wheel design-law', () => {
  afterEach(cleanup);

  it('exposes named exports and no default', async () => {
    const mod = await import('./index');
    expect(mod.Wheel).toBe(Wheel);
    expect('default' in mod).toBe(false);
  });

  it('selected row type stays on the body weight channel (400/700), never 500/600', () => {
    renderWithProviders(
      <Wheel
        items={[1, 2, 3, 4, 5]}
        value={3}
        onChange={() => {}}
        visibleItems={5}
      />,
    );
    const selected = screen.getByTestId('wheel').querySelector('[data-testid="wheel-item"][data-selected="true"]')!;
    expect(selected).toBeTruthy();
    const text = selected.querySelector('[class]')!;
    expect(text.className).toMatch(/_fow-(?<weight>400|700|bold)\b/u);
    expect(text.className).not.toMatch(/_fow-600\b/u);
    expect(text.className).not.toMatch(/_fow-500\b/u);
  });

  it('viewport is R-NONE — no knob radius atom on the clip frame', () => {
    const none = renderWithProviders(
      <Preset overrides={{ borderRadius: 'none' }}>
        <Wheel
          items={[1, 2, 3]}
          value={2}
          onChange={() => {}}
          visibleItems={3}
        />
      </Preset>,
    );
    const noneFrame = none.container.querySelector('[data-testid="wheel"]')!;
    const noneAtoms = noneFrame.className.split(' ').filter((c) => c.startsWith('_btlr-') && c !== '_btlr-0px');
    none.unmount();

    const full = renderWithProviders(
      <Preset overrides={{ borderRadius: 'full' }}>
        <Wheel
          items={[1, 2, 3]}
          value={2}
          onChange={() => {}}
          visibleItems={3}
        />
      </Preset>,
    );
    const fullFrame = full.container.querySelector('[data-testid="wheel"]')!;
    const fullAtoms = fullFrame.className.split(' ').filter((c) => c.startsWith('_btlr-') && c !== '_btlr-0px');
    expect(noneAtoms).toStrictEqual([]);
    expect(fullAtoms).toStrictEqual([]);
  });
});
