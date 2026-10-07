/**
 * Guardrail for the dashboard-catalog re-export seam.
 *
 * The barrel used to re-export KPICard / calculateTrend /
 * calculatePercentageChange / aggregateData (and the widget/chart types)
 * from ./FrappeDashboard, which does not define them — it bounced them
 * from @repo/ui. In the built package that bounce
 * put the catalog behind FrappeDashboard.native's own components import,
 * and a native-conditions consumer that narrows components (the GNOME
 * shim aliases; metro with exact resolution) failed the WHOLE barrel on
 * that seam before anything rendered — measured downstream 2026-08-13.
 * This spec locks the fix both ways:
 *
 *  1. ./FrappeDashboard exports only what it defines (FrappeDashboard;
 *     ChartCard is a re-export of the sanitizing bridge in ./ChartCard)
 *     — no catalog names.
 *  2. The barrel still ships the catalog, and each name IS the components
 *     export, not a copy and not a bounce.
 */
import * as components from '@repo/ui';
import { describe, expect, it } from 'vitest';

import { ChartCard as BridgeChartCard } from './ChartCard';
import * as dashboard from './FrappeDashboard';

import * as barrel from './index';

const CATALOG_VALUE_NAMES = ['KPICard', 'calculateTrend', 'calculatePercentageChange', 'aggregateData'] as const;

describe('dashboard catalog seam', () => {
  it('keeps ./FrappeDashboard to the names it defines', () => {
    for (const name of CATALOG_VALUE_NAMES) {
      expect(
        (dashboard as Record<string, unknown>)[name],
        `FrappeDashboard must not re-export catalog "${name}"`,
      ).toBeUndefined();
    }
    expect(dashboard.FrappeDashboard).toBeDefined();
    expect(dashboard.ChartCard, 'the sanitizing ChartCard bridge is re-exported').toBe(BridgeChartCard);
    expect(dashboard.ChartCard, 'ChartCard must be the sanitizing bridge, not the raw catalog card').not.toBe(
      components.ChartCard,
    );
  });

  it('re-exports the catalog from components directly, identically', () => {
    for (const name of CATALOG_VALUE_NAMES) {
      expect((barrel as Record<string, unknown>)[name], `barrel must export "${name}"`).toBeDefined();
      expect((barrel as Record<string, unknown>)[name], `barrel "${name}" must be the components export`).toBe(
        (components as Record<string, unknown>)[name],
      );
    }
    expect(barrel.ChartCard, 'barrel ChartCard stays the sanitizing bridge').toBe(dashboard.ChartCard);
  });
});
