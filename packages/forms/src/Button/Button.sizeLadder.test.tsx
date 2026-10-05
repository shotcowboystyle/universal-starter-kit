/**
 * @vitest-environment jsdom
 *
 * The painted Button, not the recipe source, matches the
 * measured Tamagui v5 table at $2/$3/$4/$6. Radius used to sit on the
 * borderRadius knob (flat 9px); it must step with the size token, and
 * default gap matches that table. Corner shape overrides preserve the
 * internal spacing rather than jamming or separating the icon and label.
 */

import { renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Button } from './index';

afterEach(cleanup);

const MEASURED = {
  $2: { paddingHorizontal: 7, fontSize: 12, radius: 5 },
  $3: { paddingHorizontal: 13, fontSize: 13, radius: 7 },
  $4: { paddingHorizontal: 18, fontSize: 14, radius: 9 },
  $6: { paddingHorizontal: 32, fontSize: 18, radius: 16 },
} as const;

const KNOB_STOPS = {
  none: 0,
  small: 5,
  medium: 9,
  large: 16,
  full: 50,
} as const;

function lastPx(el: Element, re: RegExp): number | null {
  let found: number | null = null;
  for (const c of String((el as HTMLElement).className || '').split(/\s+/)) {
    const m = c.match(re);
    if (m) {
      found = Number(m[1]);
    }
  }
  return found;
}

const RADIUS_TOKEN_PX: Record<string, number> = {
  '0': 0,
  '2': 5,
  '3': 7,
  '4': 9,
  '5': 10,
  '6': 16,
  '12': 50,
};

function radiusPx(el: HTMLElement): number | null {
  let found: number | null = null;
  for (const c of String(el.className || '').split(/\s+/)) {
    const px = c.match(/^_btlr-(\d+)px$/);
    if (px) {
      found = Number(px[1]);
    }
    const tok = c.match(/^_btlr-t-radius-(\d+)$/);
    if (tok) {
      found = RADIUS_TOKEN_PX[tok[1]] ?? found;
    }
  }
  return found;
}

function padXPx(el: HTMLElement): number | null {
  return lastPx(el, /^_px-(\d+)px$/) ?? lastPx(el, /^_p[lr]-(\d+)px$/);
}

function gapPx(el: HTMLElement): number | null {
  return lastPx(el, /^_gap-(\d+)px$/);
}

function labelPx(el: HTMLElement): number | null {
  for (const node of Array.from(el.querySelectorAll('*'))) {
    const n = lastPx(node, /^_fos-(\d+)px$/) ?? lastPx(node, /^_fs-(\d+)px$/);
    if (n != null) {
      return n;
    }
  }
  return lastPx(el, /^_fos-(\d+)px$/) ?? lastPx(el, /^_fs-(\d+)px$/);
}

function renderSize(size: keyof typeof MEASURED) {
  renderWithProviders(
    <Button size={size} icon={<span>i</span>}>
      Restart
    </Button>,
  );
  return screen.getByRole('button');
}

describe('painted Button size ladder', () => {
  it('padX, label and radius at $2/$3/$4/$6 match the reference table', () => {
    for (const token of ['$2', '$3', '$4', '$6'] as const) {
      const row = MEASURED[token];
      const frame = renderSize(token);
      expect(padXPx(frame), `${token} padX (${frame.className})`).toBe(row.paddingHorizontal);
      expect(labelPx(frame), `${token} label`).toBe(row.fontSize);
      expect(radiusPx(frame), `${token} radius (${frame.className})`).toBe(row.radius);
      cleanup();
    }
  });

  it('gap equals radius at every size step', () => {
    for (const token of ['$2', '$3', '$4', '$6'] as const) {
      const frame = renderSize(token);
      expect(gapPx(frame), `${token} gap`).toBe(MEASURED[token].radius);
      expect(gapPx(frame), `${token} gap==radius`).toBe(radiusPx(frame));
      cleanup();
    }
  });

  it('corner overrides preserve the measured internal gap', () => {
    for (const [stop, px] of Object.entries(KNOB_STOPS) as [keyof typeof KNOB_STOPS, number][]) {
      renderWithProviders(
        <Preset overrides={{ borderRadius: stop }}>
          <Button size="$4" icon={<span>i</span>}>
            Restart
          </Button>
        </Preset>,
      );
      const frame = screen.getByRole('button');
      expect(radiusPx(frame), `${stop} radius`).toBe(px);
      expect(gapPx(frame), `${stop} gap`).toBe(MEASURED.$4.radius);
      cleanup();
    }
  });
});
