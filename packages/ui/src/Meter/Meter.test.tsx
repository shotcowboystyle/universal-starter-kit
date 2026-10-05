import { renderWithProviders } from '@repo/test-utils';
import { Preset, resolveRadiusClass, type Knobs } from '@repo/theme';
/**
 * Meter — bounded-quantity display.
 *
 * Progress is activity toward completion; Meter is position within bounds.
 * Required arms: threshold intents map to theme tokens (never raw brand),
 * a render spec at each zone in both schemes, and the rail radius resolves
 * through resolveRadiusClass DEFAULT (not BINARY — no thumb).
 */
import { cleanup, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { Theme } from 'tamagui';
import { afterEach, describe, expect, it } from 'vitest';

import * as pkg from '../index';
// Deliberately the views BARREL, not ../views/Dashboard: the deep path always
// resolved, so importing it here let an earlier change drop the re-exports without a
// failing test. This import IS the export-gap assertion.
import { ListCard, ProgressCard, ShortcutCard } from '../views';
import * as dashboard from '../views/Dashboard';

import {
  METER_RADIUS_CLASS,
  METER_ZONE_PAINT,
  formatMeterValue,
  resolveMeterRailRadius,
  resolveMeterZone,
  type MeterZone,
} from './meter';

import { Meter } from './index';

afterEach(cleanup);

const DISK = { min: 0, max: 8, low: 6.4, high: 7.6, optimum: 0 } as const;
const BATTERY = { min: 0, max: 100, low: 10, high: 20, optimum: 100 } as const;

function renderMeter(
  ui: ReactElement,
  scheme: 'light' | 'dark' = 'light',
  knobs?: Partial<Pick<Knobs, 'borderRadius' | 'fillStyle' | 'borderWidth'>>,
) {
  return renderWithProviders(
    <Theme name={scheme}>
      <Preset cascade={false} overrides={knobs}>
        {ui}
      </Preset>
    </Theme>,
  );
}

function rail(container: HTMLElement): HTMLElement {
  const el = container.querySelector("[role='meter']");
  expect(el).toBeTruthy();
  return el as HTMLElement;
}

describe('threshold intents map to theme intents, never raw brand', () => {
  it('stays ok (neutral) when no thresholds are declared — never guessed', () => {
    expect(resolveMeterZone({ value: 0, min: 0, max: 8 })).toBe('ok');
    expect(resolveMeterZone({ value: 7.8, min: 0, max: 8 })).toBe('ok');
    expect(resolveMeterZone({ value: 8, min: 0, max: 8 })).toBe('ok');
  });

  it('maps disk (optimum at min) through the HTML meter regions', () => {
    expect(resolveMeterZone({ value: 5, ...DISK })).toBe('ok');
    expect(resolveMeterZone({ value: 6.8, ...DISK })).toBe('warn');
    expect(resolveMeterZone({ value: 7.8, ...DISK })).toBe('critical');
  });

  it('inverts zones when optimum names the high end (battery)', () => {
    expect(resolveMeterZone({ value: 9, ...BATTERY })).toBe('critical');
    expect(resolveMeterZone({ value: 15, ...BATTERY })).toBe('warn');
    expect(resolveMeterZone({ value: 80, ...BATTERY })).toBe('ok');
  });

  it('paints each zone with theme intent tokens, never hex or $accent', () => {
    const token = /^\$(color|orange|red)\d+$/;
    for (const zone of Object.keys(METER_ZONE_PAINT) as MeterZone[]) {
      const paint = METER_ZONE_PAINT[zone];
      expect(paint.fill, `${zone} fill`).toMatch(token);
      expect(paint.fill).not.toMatch(/^#/);
      expect(paint.fill).not.toContain('accent');
      if ('value' in paint) {
        expect(paint.value, `${zone} value`).toMatch(token);
        expect(paint.value).not.toMatch(/^#/);
        expect(paint.value).not.toContain('accent');
      }
    }
    // ok declares no value ink — the resolver owns it.
    expect('value' in METER_ZONE_PAINT.ok).toBe(false);
    expect(METER_ZONE_PAINT.ok.fill).toBe('$color11');
    expect(METER_ZONE_PAINT.warn.fill).toBe('$orange9');
    expect(METER_ZONE_PAINT.warn.value).toBe('$orange11');
    expect(METER_ZONE_PAINT.critical.fill).toBe('$red9');
    expect(METER_ZONE_PAINT.critical.value).toBe('$red11');
  });
});

describe('rail radius resolves through resolveRadiusClass DEFAULT', () => {
  it('is the DEFAULT class, not BINARY — a meter has no thumb', () => {
    expect(METER_RADIUS_CLASS).toBe('DEFAULT');
    const stops = ['none', 'small', 'medium', 'large', 'full'] as const;
    for (const stop of stops) {
      expect(resolveMeterRailRadius(stop)).toBe(resolveRadiusClass('DEFAULT', stop));
    }
    // none is 0 on every class; BINARY parts from small onward (the thumb).
    for (const stop of ['small', 'medium', 'large', 'full'] as const) {
      expect(resolveMeterRailRadius(stop)).not.toBe(resolveRadiusClass('BINARY', stop, { heightPx: 11 }));
    }
    expect(resolveMeterRailRadius('none')).toBe(0);
    expect(resolveMeterRailRadius('small')).toBe(5);
    expect(resolveMeterRailRadius('medium')).toBe(9);
    expect(resolveMeterRailRadius('large')).toBe(16);
    expect(resolveMeterRailRadius('full')).toBe(50);
  });

  it('paints the DEFAULT token on the rail, not a literal or BINARY h/2', () => {
    const { container: none } = renderMeter(<Meter label="Disk" value={5} min={0} max={8} />, 'light', {
      borderRadius: 'none',
    });
    expect(rail(none).getAttribute('data-meter-radius-class')).toBe('DEFAULT');
    expect(rail(none).getAttribute('data-meter-rail-radius')).toBe('0');

    cleanup();
    const { container: medium } = renderMeter(<Meter label="Disk" value={5} min={0} max={8} />, 'light', {
      borderRadius: 'medium',
    });
    expect(rail(medium).getAttribute('data-meter-rail-radius')).toBe(String(resolveRadiusClass('DEFAULT', 'medium')));
    expect(rail(medium).getAttribute('data-meter-rail-radius')).not.toBe(
      String(resolveRadiusClass('BINARY', 'medium', { heightPx: 11 })),
    );
  });
});

describe('render spec at each intent in both schemes', () => {
  const cases: { zone: MeterZone; value: number; bounds: typeof DISK | typeof BATTERY }[] = [
    { zone: 'ok', value: 5, bounds: DISK },
    { zone: 'warn', value: 6.8, bounds: DISK },
    { zone: 'critical', value: 7.8, bounds: DISK },
  ];

  for (const scheme of ['light', 'dark'] as const) {
    for (const { zone, value, bounds } of cases) {
      it(`${scheme} ${zone} fill and value ink ride the theme tokens`, () => {
        const { container } = renderMeter(<Meter label="Disk usage" value={value} unit="GB" {...bounds} />, scheme);
        const node = rail(container);
        const paint = METER_ZONE_PAINT[zone];
        expect(node.getAttribute('data-meter-zone')).toBe(zone);
        expect(node.getAttribute('data-meter-fill')).toBe(paint.fill);
        const valueNode = container.querySelector('[data-meter-value]');
        // ok declares no value ink, so the readout rides textAccent — "high"
        // in the default preset these cases render under.
        expect(valueNode?.getAttribute('data-meter-value-color')).toBe('value' in paint ? paint.value : '$color');
        expect(node.getAttribute('data-meter-fill')).not.toMatch(/^#/);
      });
    }
  }
});

describe('Meter a11y and the Progress semantic line', () => {
  it('uses role=meter with declared min/max and never role=progressbar', () => {
    const { container } = renderMeter(<Meter label="Disk usage" value={6.2} min={0} max={8} unit="GB" />);
    const node = rail(container);
    expect(node.getAttribute('role')).toBe('meter');
    expect(container.querySelector("[role='progressbar']")).toBeNull();
    expect(node.getAttribute('aria-valuemin')).toBe('0');
    expect(node.getAttribute('aria-valuemax')).toBe('8');
    expect(node.getAttribute('aria-valuenow')).toBe('6.2');
    expect(node.getAttribute('aria-valuetext')).toMatch(/6\.2/);
    expect(node.getAttribute('aria-label')).toBe('Disk usage');
    expect(node.getAttribute('tabindex')).toBeNull();
  });

  it('renders the em dash for an unknown level — never an indeterminate animation', () => {
    renderMeter(<Meter label="Quota" min={0} max={8} />);
    expect(screen.getByText('\u2014')).toBeTruthy();
    const node = document.querySelector("[role='meter']");
    expect(node?.getAttribute('aria-valuenow')).toBeNull();
    expect(node?.getAttribute('data-meter-fill')).toBeNull();
  });

  it('formats the number channel through the shared number formatter', () => {
    expect(formatMeterValue({ value: 6.2, min: 0, max: 8, unit: 'GB', format: 'number' })).toBe('6.2 of 8 GB');
    expect(formatMeterValue({ value: 78, min: 0, max: 100, format: 'percent' })).toMatch(/%$/);
    expect(formatMeterValue({ value: undefined, min: 0, max: 8, format: 'number' })).toBe('\u2014');
  });

  it('outlined chrome spreads inputSurface — borderWidth is the knob, not a hardcoded 1', () => {
    const { container: filled } = renderMeter(<Meter label="Disk" value={5} min={0} max={8} />, 'light', {
      fillStyle: 'filled',
      borderWidth: 'large',
    });
    expect(rail(filled).getAttribute('data-meter-border-width')).toBe('0');

    cleanup();
    const { container: hairline } = renderMeter(<Meter label="Disk" value={5} min={0} max={8} />, 'light', {
      fillStyle: 'outlined',
      borderWidth: 'none',
    });
    // outlined + none still draws the small hairline, not 0.
    expect(rail(hairline).getAttribute('data-meter-border-width')).toBe('0.5');

    cleanup();
    const { container: large } = renderMeter(<Meter label="Disk" value={5} min={0} max={8} />, 'light', {
      fillStyle: 'outlined',
      borderWidth: 'large',
    });
    expect(rail(large).getAttribute('data-meter-border-width')).toBe('2');
  });

  it('loading is a skeleton, not an indeterminate meter', () => {
    const { container } = renderMeter(<Meter label="Disk usage" min={0} max={8} loading />);
    expect(container.querySelector("[role='meter']")).toBeNull();
    expect(container.querySelector("[role='progressbar']")).toBeNull();
  });

  for (const discrete of [0, 5]) {
    for (const [borderWidth, expected] of [
      ['none', '0.5px'],
      ['small', '0.5px'],
      ['large', '2px'],
    ] as const) {
      it(`paints ${borderWidth} outline on ${discrete ? 'every segment' : 'the continuous rail'}`, () => {
        const { container } = renderMeter(
          <Meter label="Disk" value={5} min={0} max={8} segments={discrete} />,
          'light',
          { fillStyle: 'outlined', borderWidth },
        );
        const parts = discrete
          ? Array.from(container.querySelector('[data-meter-segments]')!.children)
          : [rail(container)];
        expect(parts).toHaveLength(discrete || 1);
        for (const part of parts) {
          expect(getComputedStyle(part).borderTopWidth).toBe(expected);
        }
        if (discrete) {
          expect(getComputedStyle(parts[0]).backgroundColor).not.toBe('transparent');
          expect(getComputedStyle(parts.at(-1)!).backgroundColor).toBe('transparent');
        }
      });
    }
  }
});

describe('barrel exports (the ProgressCard export gap)', () => {
  it('exports Meter from the package barrel', () => {
    expect(pkg.Meter).toBe(Meter);
  });

  it('re-exports ProgressCard, ShortcutCard, and ListCard from views/index.ts', () => {
    expect(typeof ProgressCard).toBe('function');
    expect(typeof ShortcutCard).toBe('function');
    expect(typeof ListCard).toBe('function');
    // The barrel export must be the Dashboard implementation, not a copy.
    expect(ProgressCard).toBe(dashboard.ProgressCard);
    expect(ShortcutCard).toBe(dashboard.ShortcutCard);
    expect(ListCard).toBe(dashboard.ListCard);
  });
});
