/**
 * Switch BINARY radius — thumb and track are one member.
 * Painted radius is 0 at `none` and the part's own height/2 at every other
 * stop, including per-state override bags.
 */

import { renderWithProviders } from '@repo/test-utils';
import { Preset, type BorderRadius } from '@repo/theme';
import { cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Switch } from './index';

const STOPS: BorderRadius[] = ['none', 'small', 'medium', 'large', 'full'];
const STATE_BAGS = ['hover', 'press', 'focus'] as const;
const SCHEMES = ['light', 'dark'] as const;

afterEach(cleanup);

const atomPx = (value: string) => Number(value.replace('--', '.'));

function paintedHeight(el: HTMLElement): number {
  const rect = el.getBoundingClientRect().height;
  if (rect > 0) {
    return rect;
  }
  for (const cls of String(el.className || '').split(/\s+/)) {
    const m = /^_h-(\d+(?:--\d+)?)px$/.exec(cls);
    if (m) {
      return atomPx(m[1]);
    }
  }
  if (el.style.height) {
    const n = parseFloat(el.style.height);
    if (n > 0) {
      return n;
    }
  }
  const cs = parseFloat(getComputedStyle(el).height);
  return cs > 0 ? cs : 0;
}

/**
 * Rest atom is `_btlr-22px`; hover/press/focus are `_btlr-0hover-22px` / `_btlr-0active-22px` / `_btlr-0focus-22px`.
 * An odd-height part rounds to a half pixel, which tamagui writes with `--` for the dot (`_btlr-14--5px`).
 */
function paintedRadius(el: HTMLElement, state?: 'hover' | 'active' | 'focus'): number {
  const className = String(el.className || '');
  const re = state ? new RegExp(`_btlr-0${state}-(\\d+(?:--\\d+)?)px`) : /(?:^|\s)_btlr-(\d+(?:--\d+)?)px(?:\s|$)/;
  const m = re.exec(className);
  if (m) {
    return atomPx(m[1]);
  }
  if (!state && el.style.borderRadius) {
    const n = parseFloat(el.style.borderRadius);
    if (Number.isFinite(n)) {
      return n;
    }
  }
  const cs = parseFloat(getComputedStyle(el).borderRadius);
  return Number.isFinite(cs) ? cs : Number.NaN;
}

function expectBinary(el: HTMLElement, stop: BorderRadius, state?: 'hover' | 'active' | 'focus') {
  const height = paintedHeight(el);
  expect(height, `expected a painted height on ${el.className}`).toBeGreaterThan(0);
  expect(paintedRadius(el, state)).toBe(stop === 'none' ? 0 : height / 2);
}

function mountSwitch(
  stop: BorderRadius,
  scheme: (typeof SCHEMES)[number],
  extra?: Partial<Record<(typeof STATE_BAGS)[number], { borderRadius: BorderRadius }>>,
) {
  return renderWithProviders(
    <Preset
      overrides={{
        borderRadius: stop,
        elevation: 'none',
        ...(extra?.hover && { hover: extra.hover }),
        ...(extra?.press && { press: extra.press }),
        ...(extra?.focus && { focus: extra.focus }),
      }}>
      <Switch name={`sw-${scheme}-${stop}`} defaultValue={false} aria-label="Notifications" />
    </Preset>,
  );
}

function parts(result: ReturnType<typeof renderWithProviders>) {
  const track = result.getSwitch();
  expect(track).toBeTruthy();
  const thumb = track!.querySelector('.is_SwitchThumb') as HTMLElement | null;
  expect(thumb).toBeTruthy();
  return { track: track as HTMLElement, thumb: thumb as HTMLElement };
}

describe('Switch BINARY radius (thumb and track are one member)', () => {
  for (const scheme of SCHEMES) {
    describe(`${scheme} scheme`, () => {
      for (const stop of STOPS) {
        it(`thumb and track measure ${stop === 'none' ? '0' : 'height/2'} at borderRadius:${stop}`, () => {
          const { track, thumb } = parts(mountSwitch(stop, scheme));
          expectBinary(track, stop);
          expectBinary(thumb, stop);
        });
      }

      for (const bag of STATE_BAGS) {
        const tamaguiState = bag === 'press' ? 'active' : bag;
        for (const stop of STOPS) {
          it(`${bag} override bag at ${stop} stays BINARY on thumb and track`, () => {
            const restStop: BorderRadius = stop === 'none' ? 'full' : 'none';
            const { track, thumb } = parts(mountSwitch(restStop, scheme, { [bag]: { borderRadius: stop } }));
            expectBinary(track, restStop);
            expectBinary(thumb, restStop);
            expectBinary(track, stop, tamaguiState);
            expectBinary(thumb, stop, tamaguiState);
            expect(String(track.className)).not.toMatch(/_btlr-t-radius-[246]/);
            expect(String(thumb.className)).not.toMatch(/_btlr-t-radius-[246]/);
          });
        }
      }
    });
  }
});

describe('Switch declares its BINARY class for the constraint audit', () => {
  it('thumb and track carry data-radius-resolution at every stop', () => {
    for (const stop of STOPS) {
      const result = mountSwitch(stop, 'light');
      const { track, thumb } = parts(result);
      expect(track.getAttribute('data-radius-resolution')).toBe('BINARY');
      expect(thumb.getAttribute('data-radius-resolution')).toBe('BINARY');
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
    expect(track.hasAttribute('data-radius-resolution')).toBe(false);
    expect(thumb.hasAttribute('data-radius-resolution')).toBe(false);
  });
});
