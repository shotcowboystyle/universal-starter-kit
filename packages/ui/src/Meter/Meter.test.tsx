import { renderWithProviders } from '@repo/test-utils';
import { Preset, resolveRadiusClass } from '@repo/theme';
import type { Knobs } from '@repo/theme';
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

import { Meter as PackageMeter } from '../index';
// Deliberately the views BARREL, not ../views/Dashboard: the deep path always
// resolved, so importing it here let an earlier change drop the re-exports without a
// failing test. This import IS the export-gap assertion.
import { ListCard, ProgressCard, ShortcutCard } from '../views';
import {
  ListCard as DashboardListCard,
  ProgressCard as DashboardProgressCard,
  ShortcutCard as DashboardShortcutCard,
} from '../views/Dashboard';

import {
  METER_RADIUS_CLASS,
  METER_ZONE_PAINT,
  formatMeterValue,
  resolveMeterRailRadius,
  resolveMeterZone,
} from './meter';
import type { MeterZone } from './meter';

import { Meter } from './index';

const DISK = { min: 0, max: 8, low: 6.4, high: 7.6, optimum: 0 } as const;
const BATTERY = { min: 0, max: 100, low: 10, high: 20, optimum: 100 } as const;

const renderMeter = (
  ui: ReactElement,
  scheme: 'light' | 'dark' = 'light',
  knobs?: Partial<Pick<Knobs, 'borderRadius' | 'fillStyle' | 'borderWidth'>>,
) =>
  renderWithProviders(
    <Theme name={scheme}>
      <Preset
        cascade={false}
        overrides={knobs}>
        {ui}
      </Preset>
    </Theme>,
  );

const rail = (container: HTMLElement): HTMLElement => {
  const el = container.querySelector<HTMLElement>("[role='meter']");
  expect(el).toBeTruthy();
  return el!;
};

describe('threshold intents map to theme intents, never raw brand', () => {
  afterEach(cleanup);

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
    const token = /^\$(?:color|orange|red)\d+$/u;
    for (const zone of Object.keys(METER_ZONE_PAINT) as MeterZone[]) {
      const paint = METER_ZONE_PAINT[zone];
      const inks: [string, string][] = [['fill', paint.fill]];
      if ('value' in paint) {
        inks.push(['value', paint.value]);
      }
      for (const [name, ink] of inks) {
        expect(ink, `${zone} ${name}`).toMatch(token);
        expect(ink).not.toMatch(/^#/u);
        expect(ink).not.toContain('accent');
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
  afterEach(cleanup);

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
    const { container: none } = renderMeter(
      <Meter
        label="Disk"
        value={5}
        min={0}
        max={8}
      />,
      'light',
      {
        borderRadius: 'none',
      },
    );
    expect(rail(none).dataset.meterRadiusClass).toBe('DEFAULT');
    expect(rail(none).dataset.meterRailRadius).toBe('0');

    cleanup();
    const { container: medium } = renderMeter(
      <Meter
        label="Disk"
        value={5}
        min={0}
        max={8}
      />,
      'light',
      {
        borderRadius: 'medium',
      },
    );
    expect(rail(medium).dataset.meterRailRadius).toBe(String(resolveRadiusClass('DEFAULT', 'medium')));
    expect(rail(medium).dataset.meterRailRadius).not.toBe(
      String(resolveRadiusClass('BINARY', 'medium', { heightPx: 11 })),
    );
  });
});

describe('render spec at each intent in both schemes', () => {
  afterEach(cleanup);

  const cases: { zone: MeterZone; value: number; bounds: typeof DISK | typeof BATTERY }[] = [
    { zone: 'ok', value: 5, bounds: DISK },
    { zone: 'warn', value: 6.8, bounds: DISK },
    { zone: 'critical', value: 7.8, bounds: DISK },
  ];

  const schemeCases = (['light', 'dark'] as const).flatMap((scheme) => cases.map((c) => ({ scheme, ...c })));

  it.each(schemeCases)('$scheme $zone fill and value ink ride the theme tokens', ({ scheme, zone, value, bounds }) => {
    const { container } = renderMeter(
      <Meter
        label="Disk usage"
        value={value}
        unit="GB"
        {...bounds}
      />,
      scheme,
    );
    const node = rail(container);
    const paint = METER_ZONE_PAINT[zone];
    expect(node.dataset.meterZone).toBe(zone);
    expect(node.dataset.meterFill).toBe(paint.fill);
    const valueNode = container.querySelector<HTMLElement>('[data-meter-value]');
    // ok declares no value ink, so the readout rides textAccent — "high"
    // in the default preset these cases render under.
    expect(valueNode?.dataset.meterValueColor).toBe('value' in paint ? paint.value : '$color');
    expect(node.dataset.meterFill).not.toMatch(/^#/u);
  });
});

describe('Meter a11y and the Progress semantic line', () => {
  afterEach(cleanup);

  it('uses role=meter with declared min/max and never role=progressbar', () => {
    const { container } = renderMeter(
      <Meter
        label="Disk usage"
        value={6.2}
        min={0}
        max={8}
        unit="GB"
      />,
    );
    const node = rail(container);
    expect(node.getAttribute('role')).toBe('meter');
    expect(container.querySelector("[role='progressbar']")).toBeNull();
    expect(node.getAttribute('aria-valuemin')).toBe('0');
    expect(node.getAttribute('aria-valuemax')).toBe('8');
    expect(node.getAttribute('aria-valuenow')).toBe('6.2');
    expect(node.getAttribute('aria-valuetext')).toMatch(/6\.2/u);
    expect(node.getAttribute('aria-label')).toBe('Disk usage');
    expect(node.getAttribute('tabindex')).toBeNull();
  });

  it('renders the em dash for an unknown level — never an indeterminate animation', () => {
    renderMeter(
      <Meter
        label="Quota"
        min={0}
        max={8}
      />,
    );
    expect(screen.getByText('\u2014')).toBeTruthy();
    const node = document.querySelector<HTMLElement>("[role='meter']");
    expect(node?.getAttribute('aria-valuenow')).toBeNull();
    expect(node?.dataset.meterFill).toBeUndefined();
  });

  it('formats the number channel through the shared number formatter', () => {
    expect(formatMeterValue({ value: 6.2, min: 0, max: 8, unit: 'GB', format: 'number' })).toBe('6.2 of 8 GB');
    expect(formatMeterValue({ value: 78, min: 0, max: 100, format: 'percent' })).toMatch(/%$/u);
    expect(formatMeterValue({ min: 0, max: 8, format: 'number' })).toBe('\u2014');
  });

  it('outlined chrome spreads inputSurface — borderWidth is the knob, not a hardcoded 1', () => {
    const { container: filled } = renderMeter(
      <Meter
        label="Disk"
        value={5}
        min={0}
        max={8}
      />,
      'light',
      {
        fillStyle: 'filled',
        borderWidth: 'large',
      },
    );
    expect(rail(filled).dataset.meterBorderWidth).toBe('0');

    cleanup();
    const { container: hairline } = renderMeter(
      <Meter
        label="Disk"
        value={5}
        min={0}
        max={8}
      />,
      'light',
      {
        fillStyle: 'outlined',
        borderWidth: 'none',
      },
    );
    // outlined + none still draws the small hairline, not 0.
    expect(rail(hairline).dataset.meterBorderWidth).toBe('0.5');

    cleanup();
    const { container: large } = renderMeter(
      <Meter
        label="Disk"
        value={5}
        min={0}
        max={8}
      />,
      'light',
      {
        fillStyle: 'outlined',
        borderWidth: 'large',
      },
    );
    expect(rail(large).dataset.meterBorderWidth).toBe('2');
  });

  it('loading is a skeleton, not an indeterminate meter', () => {
    const { container } = renderMeter(
      <Meter
        label="Disk usage"
        min={0}
        max={8}
        loading
      />,
    );
    expect(container.querySelector("[role='meter']")).toBeNull();
    expect(container.querySelector("[role='progressbar']")).toBeNull();
  });

  const outlineWidths = [
    { borderWidth: 'none', expected: '0.5px' },
    { borderWidth: 'small', expected: '0.5px' },
    { borderWidth: 'large', expected: '2px' },
  ] as const;

  it.each(outlineWidths)('paints $borderWidth outline on the continuous rail', ({ borderWidth, expected }) => {
    const { container } = renderMeter(
      <Meter
        label="Disk"
        value={5}
        min={0}
        max={8}
        segments={0}
      />,
      'light',
      { fillStyle: 'outlined', borderWidth },
    );
    expect(getComputedStyle(rail(container)).borderTopWidth).toBe(expected);
  });

  it.each(outlineWidths)('paints $borderWidth outline on every segment', ({ borderWidth, expected }) => {
    const { container } = renderMeter(
      <Meter
        label="Disk"
        value={5}
        min={0}
        max={8}
        segments={5}
      />,
      'light',
      { fillStyle: 'outlined', borderWidth },
    );
    const parts = [...container.querySelector('[data-meter-segments]')!.children];
    expect(parts).toHaveLength(5);
    for (const part of parts) {
      expect(getComputedStyle(part).borderTopWidth).toBe(expected);
    }
    expect(getComputedStyle(parts[0]).backgroundColor).not.toBe('transparent');
    expect(getComputedStyle(parts.at(-1)!).backgroundColor).toBe('transparent');
  });
});

describe('barrel exports (the ProgressCard export gap)', () => {
  afterEach(cleanup);

  it('exports Meter from the package barrel', () => {
    expect(PackageMeter).toBe(Meter);
  });

  it('re-exports ProgressCard, ShortcutCard, and ListCard from views/index.ts', () => {
    expect(ProgressCard).toBeTypeOf('function');
    expect(ShortcutCard).toBeTypeOf('function');
    expect(ListCard).toBeTypeOf('function');
    // The barrel export must be the Dashboard implementation, not a copy.
    expect(ProgressCard).toBe(DashboardProgressCard);
    expect(ShortcutCard).toBe(DashboardShortcutCard);
    expect(ListCard).toBe(DashboardListCard);
  });
});
