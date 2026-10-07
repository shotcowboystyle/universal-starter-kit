/**
 * Switch BINARY radius — thumb and track are one member.
 * Painted radius is 0 at `none` and the part's own height/2 at every other
 * stop, including per-state override bags.
 */

import { renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
import type { BorderRadius } from '@repo/theme';
import { cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Switch } from './index';

const STOPS: BorderRadius[] = ['none', 'small', 'medium', 'large', 'full'];
const STATE_BAGS = ['hover', 'press', 'focus'] as const;
const SCHEMES = ['light', 'dark'] as const;

const atomPx = (value: string) => Number(value.replace('--', '.'));

// oxlint-disable-next-line unicorn/prefer-number-coercion -- computed and inline lengths carry a "px" suffix, which Number() would turn into NaN
const cssPx = (length: string): number => Number.parseFloat(length);

const paintedHeight = (el: HTMLElement): number => {
  const rect = el.getBoundingClientRect().height;
  if (rect > 0) {
    return rect;
  }
  for (const cls of el.className.split(/\s+/u)) {
    const size = /^_h-(?<size>\d+(?:--\d+)?)px$/u.exec(cls)?.groups?.size;
    if (size !== undefined) {
      return atomPx(size);
    }
  }
  if (el.style.height !== '') {
    const n = cssPx(el.style.height);
    if (n > 0) {
      return n;
    }
  }
  const cs = cssPx(getComputedStyle(el).height);
  return Number.isNaN(cs) ? 0 : Math.max(cs, 0);
};

/**
 * Rest atom is `_btlr-22px`; hover/press/focus are `_btlr-0hover-22px` / `_btlr-0active-22px` / `_btlr-0focus-22px`.
 * An odd-height part rounds to a half pixel, which tamagui writes with `--` for the dot (`_btlr-14--5px`).
 */
const paintedRadius = (el: HTMLElement, state?: 'hover' | 'active' | 'focus'): number => {
  const { className } = el;
  const re =
    state === undefined
      ? /(?:^|\s)_btlr-(?<px>\d+(?:--\d+)?)px(?:\s|$)/u
      : new RegExp(`_btlr-0${state}-(?<px>\\d+(?:--\\d+)?)px`, 'u');
  const px = re.exec(className)?.groups?.px;
  if (px !== undefined) {
    return atomPx(px);
  }
  if (state === undefined && el.style.borderRadius !== '') {
    const n = cssPx(el.style.borderRadius);
    if (Number.isFinite(n)) {
      return n;
    }
  }
  const cs = cssPx(getComputedStyle(el).borderRadius);
  return Number.isFinite(cs) ? cs : Number.NaN;
};

const expectBinary = (el: HTMLElement, stop: BorderRadius, state?: 'hover' | 'active' | 'focus') => {
  const height = paintedHeight(el);
  expect(height, `expected a painted height on ${el.className}`).toBeGreaterThan(0);
  expect(paintedRadius(el, state)).toBe(stop === 'none' ? 0 : height / 2);
};

const mountSwitch = (
  stop: BorderRadius,
  scheme: (typeof SCHEMES)[number],
  extra?: Partial<Record<(typeof STATE_BAGS)[number], { borderRadius: BorderRadius }>>,
) =>
  renderWithProviders(
    <Preset
      overrides={{
        borderRadius: stop,
        elevation: 'none',
        ...(extra?.hover && { hover: extra.hover }),
        ...(extra?.press && { press: extra.press }),
        ...(extra?.focus && { focus: extra.focus }),
      }}>
      <Switch
        name={`sw-${scheme}-${stop}`}
        defaultValue={false}
        aria-label="Notifications"
      />
    </Preset>,
  );

const parts = (result: ReturnType<typeof renderWithProviders>) => {
  const track = result.getSwitch() as HTMLElement | null;
  expect(track).toBeTruthy();
  const thumb = track?.querySelector<HTMLElement>('.is_SwitchThumb');
  expect(thumb).toBeTruthy();
  return { track: track!, thumb: thumb! };
};

const STOP_CASES = STOPS.map((stop) => ({ stop, measure: stop === 'none' ? '0' : 'height/2' }));
const STATE_BAG_CASES = STATE_BAGS.flatMap((bag) => STOPS.map((stop) => ({ bag, stop })));

describe.each(SCHEMES)('Switch BINARY radius (thumb and track are one member): %s scheme', (scheme) => {
  afterEach(cleanup);

  // oxlint-disable-next-line vitest/expect-expect -- the assertions live in expectBinary
  it.each(STOP_CASES)('thumb and track measure $measure at borderRadius:$stop', ({ stop }) => {
    const { track, thumb } = parts(mountSwitch(stop, scheme));
    expectBinary(track, stop);
    expectBinary(thumb, stop);
  });

  it.each(STATE_BAG_CASES)('$bag override bag at $stop stays BINARY on thumb and track', ({ bag, stop }) => {
    const tamaguiState = bag === 'press' ? 'active' : bag;
    const restStop: BorderRadius = stop === 'none' ? 'full' : 'none';
    const { track, thumb } = parts(mountSwitch(restStop, scheme, { [bag]: { borderRadius: stop } }));
    expectBinary(track, restStop);
    expectBinary(thumb, restStop);
    expectBinary(track, stop, tamaguiState);
    expectBinary(thumb, stop, tamaguiState);
    expect(track.className).not.toMatch(/_btlr-t-radius-[246]/u);
    expect(thumb.className).not.toMatch(/_btlr-t-radius-[246]/u);
  });
});

describe('Switch declares its BINARY class for the constraint audit', () => {
  afterEach(cleanup);

  it('thumb and track carry data-radius-resolution at every stop', () => {
    for (const stop of STOPS) {
      const result = mountSwitch(stop, 'light');
      const { track, thumb } = parts(result);
      expect(track.dataset.radiusResolution).toBe('BINARY');
      expect(thumb.dataset.radiusResolution).toBe('BINARY');
      result.unmount();
    }
  });

  it('a consumer radius override drops the declaration', () => {
    const result = renderWithProviders(
      <Switch
        name="sw-override"
        defaultValue={false}
        aria-label="Notifications"
        switchProps={{ borderRadius: 9 } as never}
      />,
    );
    const { track, thumb } = parts(result);
    expect(track.dataset.radiusResolution).toBeUndefined();
    expect(thumb.dataset.radiusResolution).toBeUndefined();
  });
});
