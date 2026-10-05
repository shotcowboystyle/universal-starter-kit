import { renderWithProviders } from '@repo/test-utils';
import { Preset, createThemesBuilder, defaultAccentTheme, defaultBaseTheme, defaultBuilderOptions } from '@repo/theme';
import { configWithoutAnimations } from '@tamagui/config';
import { animationsCSS } from '@tamagui/config/v5-css';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { TamaguiProvider, createTamagui } from 'tamagui';
import { describe, expect, it, vi } from 'vitest';

import { Form } from '../../Form';
import { TableCellContext } from '../../shared/tableCellContext';

import { Progress, type ProgressIntent } from './index';

// The stock @tamagui/config themes used by renderWithProviders have no
// error/warning/success/accent sub-themes and no accentBackground token, so
// intent ramp resolution is invisible there. Mount the house theme builder's
// generated themes (the same ones the app config uses) to assert the real
// resolved fill tokens.
const houseThemes = createThemesBuilder(defaultBaseTheme, defaultAccentTheme, defaultBuilderOptions).themes();

const houseConfig = createTamagui({
  ...configWithoutAnimations,
  animations: animationsCSS,
  themes: houseThemes as any,
});

function renderWithHouseThemes(ui: ReactElement) {
  return render(
    <TamaguiProvider config={houseConfig} defaultTheme="light" disableInjectCSS>
      {ui}
    </TamaguiProvider>,
  );
}

function getIndicator(container: Element): Element | null {
  return container.querySelector("[role='progressbar'] .is_ProgressIndicator");
}

/**
 * First three numeric groups (h, s, l) of an hsla() string — the digit
 * prefix Tamagui embeds in the atomic class it generates for a concrete
 * color value (e.g. hsla(358, 75%, 59%, 1) → `_bg-hsla3587559<hash>`).
 */
function hslDigits(hsla: string): string {
  return (hsla.match(/\d+/g) ?? []).slice(0, 3).join('');
}

describe('Progress', () => {
  describe('without form context', () => {
    it('renders with label', () => {
      const result = renderWithProviders(<Progress label="Loading" name="p" value={50} />);
      expect(result.findTextElement('Loading')).toBeDefined();
    });

    it('renders required label with asterisk', () => {
      const result = renderWithProviders(<Progress label="Required" name="req" value={0} required />);
      const label = result.container.querySelector('label');
      expect(label?.textContent).toContain('*');
    });

    it('renders with helper text', () => {
      const result = renderWithProviders(<Progress label="Progress" name="p" value={75} helperText="75% complete" />);
      expect(result.findTextElement('75% complete')).toBeDefined();
    });

    it('renders skeleton placeholder', () => {
      const result = renderWithProviders(<Progress label="Loading" name="l" value={0} skeleton />);
      const progressbar = result.container.querySelector("[role='progressbar']");
      expect(progressbar).toBeNull();
    });

    it('renders progress bar element', () => {
      const result = renderWithProviders(<Progress label="Progress" name="p" value={40} />);
      const progressbar = result.container.querySelector("[role='progressbar']");
      expect(progressbar).toBeTruthy();
    });
  });

  describe('with form context', () => {
    it('renders inside form', () => {
      const result = renderWithProviders(
        <Form formOptions={{ defaultValues: { progress: 0 } }} submitText="Submit">
          <Progress name="progress" label="Progress" value={50} />
        </Form>,
      );
      expect(result.findTextElement('Progress')).toBeDefined();
    });
  });

  describe('intent', () => {
    it('default keeps the gray form ramp: no intent theme scope, no intent fill token', () => {
      const { container } = renderWithHouseThemes(<Progress label="Default" name="d" value={50} />);
      const bar = container.querySelector("[role='progressbar']") as Element;
      const indicator = getIndicator(container) as Element;
      expect(indicator).toBeTruthy();
      // No intent sub-theme scope anywhere inside the bar
      for (const scope of ['.t_accent', '.t_error', '.t_warning', '.t_success']) {
        expect(bar.querySelector(scope)).toBeNull();
      }
      // Fill stays on the ProgressIndicator component theme's gray form ramp
      // (the pre-intent default) — not an intent token.
      expect(indicator.className).toContain('_bg-background');
      expect(indicator.className).not.toContain('_bg-color9');
      expect(indicator.className).not.toContain('_bg-accentBackg');
    });

    it("accent fills from the base theme's $accentBackground without a sub-theme scope", () => {
      const { container } = renderWithHouseThemes(<Progress label="Accent" name="a" value={50} intent="accent" />);
      const bar = container.querySelector("[role='progressbar']") as Element;
      const indicator = getIndicator(container) as Element;
      // Accent rides the base theme (the "accent" sub-theme is the SOLID
      // ramp — wrong for a fill), so no t_accent scope is emitted.
      expect(bar.querySelector('.t_accent')).toBeNull();
      expect(indicator.className).toContain('_bg-accentBackg');
      expect(indicator.className).not.toContain('_bg-color9');
    });

    it.each(['error', 'warning', 'success'] as ProgressIntent[])(
      "%s rides its hue sub-theme: t_<intent> scope + the hue's $color9 solid fill",
      (intent) => {
        const { container } = renderWithHouseThemes(
          <Progress label={intent} name={intent} value={50} intent={intent} />,
        );
        const bar = container.querySelector("[role='progressbar']") as Element;
        const indicator = getIndicator(container) as Element;
        // The Intent wrapper scopes the hue sub-theme around the indicator...
        expect(bar.querySelector(`.t_${intent}`)).toBeTruthy();
        // ...and the fill is the hue sub-theme's $color9 — captured as a
        // concrete value from the Intent scope, so Tamagui's auto-applied
        // ProgressIndicator COMPONENT theme (whose re-ramped color9 is a
        // pale wash, not the solid) cannot re-resolve it.
        const hueSolid = houseThemes[`light_${intent}`].color9;
        expect(hueSolid).toBeTruthy();
        expect(indicator.className).toContain(`_bg-hsla${hslDigits(hueSolid)}`);
        expect(hueSolid).not.toBe(houseThemes[`light_${intent}_ProgressIndicator`]?.color9);
        // Tint-independence: the hue solid is identical in both schemes.
        expect(houseThemes[`dark_${intent}`].color9).toBe(hueSolid);
        expect(indicator.className).not.toContain('_bg-accentBackg');
      },
    );

    it('default render is unchanged under the standard test providers', () => {
      const { container } = renderWithProviders(<Progress label="Plain" name="plain" value={40} />);
      const bar = container.querySelector("[role='progressbar']") as Element;
      const indicator = getIndicator(container) as Element;
      expect(indicator).toBeTruthy();
      // No intent scope and no Theme wrapper beyond Tamagui's own
      // ProgressIndicator component-theme span.
      for (const scope of ['.t_accent', '.t_error', '.t_warning', '.t_success']) {
        expect(bar.querySelector(scope)).toBeNull();
      }
      expect(indicator.className).not.toContain('_bg-color9');
    });
  });

  describe('value pairing and clamp', () => {
    it('shows a percent beside a labeled track', () => {
      const { container } = renderWithProviders(<Progress label="Upload" value={65} />);
      expect(container.textContent).toContain('65%');
    });

    it('keeps unlabeled embeds bar-only unless showValue is set', () => {
      const { container } = renderWithProviders(<Progress value={65} />);
      expect(container.textContent ?? '').not.toContain('65%');
    });

    it('hides the percent when showValue is false', () => {
      const { container } = renderWithProviders(<Progress label="Upload" value={65} showValue={false} />);
      expect(container.textContent ?? '').not.toContain('65%');
    });

    it('clamps negative, overflow, and non-finite values', () => {
      const neg = renderWithProviders(<Progress label="N" value={-10} max={100} />);
      expect(neg.container.querySelector("[role='progressbar']")?.getAttribute('aria-valuenow')).toBe('0');

      const over = renderWithProviders(<Progress label="O" value={150} max={100} />);
      expect(over.container.querySelector("[role='progressbar']")?.getAttribute('aria-valuenow')).toBe('100');

      const nan = renderWithProviders(<Progress label="X" value={Number.NaN} max={100} />);
      expect(nan.container.querySelector("[role='progressbar']")?.getAttribute('aria-valuenow')).toBe('0');

      const badMax = renderWithProviders(<Progress label="M" value={40} max={0} />);
      expect(badMax.container.querySelector("[role='progressbar']")?.getAttribute('aria-valuemax')).toBe('100');
      expect(badMax.container.querySelector("[role='progressbar']")?.getAttribute('aria-valuenow')).toBe('40');
    });

    it('exposes aria-readonly when readOnly', () => {
      const { container } = renderWithProviders(<Progress label="Locked" value={50} readOnly />);
      expect(container.querySelector("[role='progressbar']")?.getAttribute('aria-readonly')).toBe('true');
    });

    it('string error replaces helper; boolean error is silent but invalid', () => {
      const withCopy = renderWithProviders(
        <Progress label="Upload" value={30} error="Must finish" helperText="keep going" />,
      );
      expect(withCopy.container.textContent).toContain('Must finish');
      expect(withCopy.container.textContent).not.toContain('keep going');
      expect(withCopy.container.querySelector("[role='progressbar']")?.getAttribute('aria-invalid')).toBe('true');

      const flag = renderWithProviders(<Progress label="Upload" value={30} error helperText="keep going" />);
      // Boolean error has no copy — helper stays (FieldLayout only replaces
      // the slot when `error` is a non-empty string).
      expect(flag.container.textContent).toContain('keep going');
      expect(flag.container.querySelector("[role='progressbar']")?.getAttribute('aria-invalid')).toBe('true');
    });

    it('rounds fractional values for aria-valuenow and the paired percent', () => {
      const { container } = renderWithProviders(<Progress label="Frac" value={33.333} max={100} />);
      expect(container.querySelector("[role='progressbar']")?.getAttribute('aria-valuenow')).toBe('33');
      expect(container.textContent).toContain('33%');
    });
  });

  describe('onChange contract', () => {
    it('accepts onChange without throwing on a display-only field', () => {
      const onChange = vi.fn();
      const { container } = renderWithProviders(<Progress label="Upload" value={40} onChange={onChange} />);
      expect(container.querySelector("[role='progressbar']")).toBeTruthy();
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('table cell chromeless', () => {
    it('drops FieldLayout chrome and the paired percent inside a cell', () => {
      const { container } = renderWithProviders(
        <TableCellContext.Provider value={{ inTableCell: true, isHeader: false, editable: false }}>
          <Progress label="Upload" value={65} helperText="hidden in cells" />
        </TableCellContext.Provider>,
      );
      expect(container.textContent ?? '').not.toContain('Upload');
      expect(container.textContent ?? '').not.toContain('65%');
      expect(container.textContent ?? '').not.toContain('hidden in cells');
      expect(container.querySelector("[role='progressbar']")).toBeTruthy();
    });

    it('still pairs the percent when showValue is forced in a cell', () => {
      const { container } = renderWithProviders(
        <TableCellContext.Provider value={{ inTableCell: true, isHeader: false, editable: false }}>
          <Progress value={65} showValue />
        </TableCellContext.Provider>,
      );
      expect(container.textContent).toContain('65%');
    });
  });

  describe('knobs', () => {
    it('zeroes the size-variant minWidth so the track fills the cell (no 220px floor)', () => {
      const { container } = renderWithProviders(<Progress label="Fill" value={50} />);
      const bar = container.querySelector("[role='progressbar']") as HTMLElement;
      expect(bar).toBeTruthy();
      expect(getComputedStyle(bar).minWidth).toBe('0px');
    });

    it('goes square at borderRadius none (R-SCALE, Axiom 3)', () => {
      const { container } = renderWithProviders(
        <Preset overrides={{ borderRadius: 'none' }}>
          <Progress label="Square" value={50} />
        </Preset>,
      );
      const bar = container.querySelector("[role='progressbar']") as HTMLElement;
      expect(bar).toBeTruthy();
      // jsdom cannot cascade Tamagui class CSS — read the atomic radius class
      // (Button / FieldDisplay precedent): t-radius-0 is the none token.
      const radiusAtoms = String(bar.className || '')
        .split(' ')
        .filter((c) => c.startsWith('_btlr-'));
      expect(radiusAtoms).toContain('_btlr-t-radius-0');
      expect(radiusAtoms).not.toContain('_btlr-100000px');
    });

    it('skeleton track height matches the live 0.25× size formula, not a 6px leftover', () => {
      const live = renderWithProviders(<Progress label="Upload" value={50} />);
      const bar = live.container.querySelector("[role='progressbar']") as HTMLElement;
      const liveHeight = getComputedStyle(bar).height;

      const skel = renderWithProviders(<Progress label="Upload" skeleton />);
      expect(skel.container.querySelector("[role='progressbar']")).toBeNull();
      const bones = [...skel.container.querySelectorAll('div')].filter(
        (el) => getComputedStyle(el).height === liveHeight && el !== skel.container,
      );
      expect(Number.parseFloat(liveHeight)).toBeGreaterThan(6);
      expect(bones.length).toBeGreaterThan(0);
    });

    it('stops indicator motion when animation is none', () => {
      const { container } = renderWithProviders(
        <Preset overrides={{ animation: 'none' }}>
          <Progress label="Still" value={40} />
        </Preset>,
      );
      const indicator = getIndicator(container) as HTMLElement;
      expect(indicator).toBeTruthy();
      expect(Array.from(indicator.classList)).toContain('_transition-none');
    });
  });
});
