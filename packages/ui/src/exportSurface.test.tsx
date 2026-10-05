import * as forms from '@repo/forms';
import { renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
import * as toast from '@tamagui/toast';
/**
 * CURATED-REEXPORT-IS-CATALOG export-surface spec — the VERIFY teeth.
 *
 * Every bare name the @repo/ui barrel exports is catalog
 * output: it must be a house implementation (knob-consuming), a house shadow
 * over one (Button, Spinner), or a raw framework re-export explicitly
 * declared knob-immune in ./knobImmuneExports.ts with a reason. Raw
 * primitives ride ONLY `Tamagui*`-prefixed escape hatches chosen deliberately
 * at the import site.
 *
 * Mechanics: a raw re-export is detected by VALUE IDENTITY with the tamagui /
 * @tamagui/toast export of the same name — a house implementation or shadow
 * is never `===` the raw primitive. This spec therefore FAILS the moment
 * someone re-exports a raw primitive under a bare house name, with no list to
 * forget to update (the registry is the only escape valve, and it is locked
 * in both directions).
 *
 * Companion: ./tamagui.test.ts locks the specific curation choices (excluded
 * names, allowlist presence, house shadows stay house). This spec is the
 * generic partition invariant.
 */
import { cleanup } from '@testing-library/react';
import * as tamagui from 'tamagui';
import * as tamaguiLinearGradient from 'tamagui/linear-gradient';
import { afterEach, describe, expect, it } from 'vitest';

import { componentColors, sectionHeading } from './componentColors';
import { knobImmuneExports } from './knobImmuneExports';

import * as pkg from './index';

const barrel = pkg as Record<string, unknown>;
const rawTamagui = tamagui as Record<string, unknown>;
const rawToast = toast as Record<string, unknown>;
const rawLinearGradient = tamaguiLinearGradient as Record<string, unknown>;

/** Value-identity with the same-name raw export = raw re-export. */
function isRawReexport(name: string): boolean {
  const value = barrel[name];
  return (
    (rawTamagui[name] !== undefined && value === rawTamagui[name]) ||
    (rawToast[name] !== undefined && value === rawToast[name]) ||
    (rawLinearGradient[name] !== undefined && value === rawLinearGradient[name])
  );
}

describe('export surface partition', () => {
  const exportNames = Object.keys(barrel);

  it('exports every bare name as house-or-registered; raw primitives only via Tamagui* prefixes', () => {
    const violations: string[] = [];
    for (const name of exportNames) {
      if (!isRawReexport(name)) {
        continue;
      }
      // TamaguiProvider is tamagui's own name (registry row), not a hatch.
      if (name.startsWith('Tamagui') && knobImmuneExports[name] === undefined) {
        continue;
      }
      if (knobImmuneExports[name] === undefined) {
        violations.push(name);
      }
    }
    expect(
      violations,
      `LC-70: bare barrel export(s) [${violations.join(', ')}] are RAW framework primitives. ` +
        'Either shadow with a knob-consuming house implementation (Button/Spinner precedent), ' +
        'demote to a Tamagui*-prefixed escape hatch in ./tamagui.ts, or declare knob-immune ' +
        'with a reason in ./knobImmuneExports.ts.',
    ).toEqual([]);
  });

  it('keeps every Tamagui*-prefixed escape hatch identical to the raw primitive it names', () => {
    for (const name of exportNames) {
      if (!name.startsWith('Tamagui')) {
        continue;
      }
      // Raw re-exports of tamagui's own Tamagui*-named exports (TamaguiProvider)
      // are registry rows, not escape hatches.
      if (isRawReexport(name) && knobImmuneExports[name] !== undefined) {
        continue;
      }
      const stripped = name.slice('Tamagui'.length);
      const raw = rawTamagui[stripped] ?? rawToast[stripped];
      expect(raw, `escape hatch "${name}" names no raw tamagui/@tamagui-toast export "${stripped}"`).toBeDefined();
      expect(barrel[name], `escape hatch "${name}" must be the raw "${stripped}" primitive, nothing else`).toBe(raw);
    }
  });

  it('keeps the registry honest: every row is a live raw bare re-export', () => {
    for (const [name, reason] of Object.entries(knobImmuneExports)) {
      expect(reason.length, `registry row "${name}" needs a non-empty reason`).toBeGreaterThan(0);
      expect(barrel[name], `registry row "${name}" is stale — the barrel no longer exports it`).toBeDefined();
      expect(
        isRawReexport(name),
        `registry row "${name}" is not a raw re-export — house implementations do not get ` +
          'registry rows (delete the row; the house implementation IS the knob story)',
      ).toBe(true);
    }
  });
});

describe('semantic colour layer is importable by a stable name', () => {
  // A token map whose own header says "use these instead of hardcoding
  // $color3, $color10" is only useful if a consumer can reach it without
  // deep-pathing into another package's file layout. `./src/*` is an escape
  // hatch, not an API.
  it('exports componentColors and sectionHeading from the barrel', () => {
    expect(pkg.componentColors).toBe(componentColors);
    expect(pkg.sectionHeading).toBe(sectionHeading);
  });

  it('pins sectionHeading to the subordinate voice (mono 400 at 20/26)', () => {
    expect(sectionHeading).toEqual({
      fontFamily: '$mono',
      fontSize: 20,
      lineHeight: 26,
      fontWeight: '400',
    });
  });

  it('keeps the surface tier distinct from the interactive tier', () => {
    // The distinction is the whole reason the layer exists: a panel is not a
    // control, and a consumer that cannot import this reaches for
    // `$borderColor` (the control frame) on a panel edge.
    expect(pkg.componentColors.surface.background).not.toBe(pkg.componentColors.interactive.background);
    expect(pkg.componentColors.surface.border).not.toBe(pkg.componentColors.interactive.border);
  });
});

describe('Spinner shadow (census hit)', () => {
  afterEach(cleanup);

  it('exports the knob-consuming forms Spinner as the bare name, raw only as TamaguiSpinner', () => {
    expect(pkg.Spinner).toBe(forms.Spinner);
    expect(pkg.Spinner).not.toBe(tamagui.Spinner);
    expect(pkg.TamaguiSpinner).toBe(tamagui.Spinner);
  });

  it('stops spinning at animation none — the animation knob reaches the rendered frame', () => {
    const { container } = renderWithProviders(
      <Preset overrides={{ animation: 'none' }}>
        <pkg.Spinner />
      </Preset>,
    );
    const spinner = container.querySelector("[role='status']") as HTMLElement;
    expect(spinner).toBeTruthy();
    expect(spinner.className).toContain('mp1-spinner-static');
  });

  it('keeps spinning with motion on (positive control proving the probe measures)', () => {
    const { container } = renderWithProviders(<pkg.Spinner />);
    const spinner = container.querySelector("[role='status']") as HTMLElement;
    expect(spinner).toBeTruthy();
    expect(spinner.className).toContain('mp1-spinner');
    expect(spinner.className).not.toContain('mp1-spinner-static');
  });
});

// Type-level lock: the bare SpinnerProps is the forms contract now.
type _SpinnerPropsIsForms = import('./index').SpinnerProps extends import('@repo/forms').SpinnerProps ? true : never;
const _spinnerPropsLock: _SpinnerPropsIsForms = true;
void _spinnerPropsLock;
