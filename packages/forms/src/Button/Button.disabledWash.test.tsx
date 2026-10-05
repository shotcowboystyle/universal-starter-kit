/**
 * @vitest-environment happy-dom
 *
 * DISABLED-VISIBLE: every intent Button reads disabled.
 *
 * The keepLabel wash paints the ACTIVE ramp's `$color3`/`$color6` with the
 * label on `$color11`. Error, warning and success parents are Radix ramps, so
 * step 3 is a pale wash far from their step-11 Button fill. The accent slot is
 * solid by palette shape (defaults/accent.ts): step 3 sat one lightness step
 * off the step-4 fill, measured ΔE 8.2 light and 2.5 dark, and the button
 * never read disabled. The sweep also caught light warning and success labels
 * at 4.48 and 4.27:1 on their own wash, since step 11 is only AA on steps 1-2.
 *
 * jsdom cascades no Tamagui CSS, so this reads what the frame asks for: the
 * atomic class, the injected rule behind it, and for a `var(--token)` rule the
 * house theme table of the scope that paints it.
 */

import {
  aaTextContrastRatio,
  createDefaultThemeConfig,
  createThemesBuilder,
  defaultAccentTheme,
  defaultBaseTheme,
  defaultBuilderOptions,
  measureContrast,
  normalizeToHex,
  Preset,
} from '@repo/theme';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { TamaguiProvider, YStack } from 'tamagui';
import { afterEach, describe, expect, it } from 'vitest';

import { Button, type ButtonProps } from './index';

afterEach(cleanup);

const houseConfig = createDefaultThemeConfig();
const houseThemes = createThemesBuilder(defaultBaseTheme, defaultAccentTheme, defaultBuilderOptions).themes();

const SCHEMES = ['light', 'dark'] as const;
const DISABLED_STYLES = ['keepLabel', 'dimWhole'] as const;
const VARIANTS: { name: string; props: Partial<ButtonProps> }[] = [
  { name: 'accent', props: { accent: true } },
  { name: 'theme="accent"', props: { theme: 'accent' } },
  { name: 'error', props: { error: true } },
  { name: 'warning', props: { warning: true } },
  { name: 'success', props: { success: true } },
];

/**
 * The disabled-visible fill threshold (a HYBRID dial). CIE76 ΔE between the enabled fill
 * and the disabled fill; the house intents land 57-92 once washed, the
 * accent measured 2.5-8.2 before the fix.
 */
const MIN_FILL_DELTA_E = 20;
const MIN_OPACITY_DELTA = 0.3;

type Scheme = (typeof SCHEMES)[number];

function houseRender(ui: ReactElement, scheme: Scheme, disabledStyle: string) {
  return render(
    <TamaguiProvider config={houseConfig.tamagui} defaultTheme={scheme} disableInjectCSS>
      <Preset overrides={{ disabledStyle: disabledStyle as 'keepLabel' | 'dimWhole' }}>
        <YStack backgroundColor="$background">{ui}</YStack>
      </Preset>
    </TamaguiProvider>,
  );
}

function injectedRuleValue(className: string, property: string): string {
  for (const sheet of Array.from(document.styleSheets)) {
    for (const rule of Array.from(sheet.cssRules)) {
      if (!(rule instanceof CSSStyleRule)) {
        continue;
      }
      if (!rule.selectorText.endsWith(`.${className}`)) {
        continue;
      }
      const value = rule.style.getPropertyValue(property);
      if (value) {
        return value.trim();
      }
    }
  }
  throw new Error(`no injected ${property} rule for .${className}`);
}

/** The innermost Tamagui theme scope painting `el`, e.g. `accent_Button`. */
function scopeOf(el: Element): string | null {
  for (let node = el.parentElement; node; node = node.parentElement) {
    const names = Array.from(node.classList)
      .filter((c) => c.startsWith('t_') && c !== 't_sub_theme')
      .map((c) => c.slice(2))
      .filter((c) => c !== 'light' && c !== 'dark');
    if (names.length) {
      return names.sort((a, b) => b.length - a.length)[0];
    }
  }
  return null;
}

function resolveInScope(value: string, scheme: Scheme, scope: string | null): string {
  const token = value.match(/^var\(--([\w-]+)\)$/)?.[1];
  if (!token) {
    return value;
  }
  const chain: string[] = [];
  if (scope) {
    const parts = scope.split('_');
    for (let i = parts.length; i > 0; i--) {
      chain.push(`${scheme}_${parts.slice(0, i).join('_')}`);
    }
  }
  chain.push(scheme);
  for (const name of chain) {
    const hit = houseThemes[name]?.[token];
    if (hit) {
      return hit;
    }
  }
  throw new Error(`--${token} resolves in none of ${chain.join(', ')}`);
}

/** What `el` paints for one atomic property: `_bg-` → background-color. */
function painted(el: Element, prefix: string, property: string, scheme: Scheme): string {
  const cls = Array.from(el.classList).find(
    (c) => c.startsWith(prefix) && !/^_[a-z]+-0(hover|active|focus|press)/.test(c),
  );
  if (!cls) {
    throw new Error(`${el.tagName} carries no ${prefix} class`);
  }
  return resolveInScope(injectedRuleValue(cls, property), scheme, scopeOf(el));
}

function opacityOf(el: Element): number {
  const cls = Array.from(el.classList).find((c) => c.startsWith('_o-'));
  return cls ? Number(injectedRuleValue(cls, 'opacity')) : 1;
}

function toLab(color: string): [number, number, number] {
  const hex = normalizeToHex(color);
  if (!hex) {
    throw new Error(`not an opaque color: ${color}`);
  }
  const lin = (i: number) => {
    const v = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = [lin(1), lin(3), lin(5)];
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
  const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

function deltaE(a: string, b: string): number {
  const [p, q] = [toLab(a), toLab(b)];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

function measure(scheme: Scheme, disabledStyle: string, props: Partial<ButtonProps>) {
  houseRender(
    <>
      <Button {...props}>Enabled</Button>
      <Button {...props} disabled>
        Disabled
      </Button>
    </>,
    scheme,
    disabledStyle,
  );
  const enabledLabel = screen.getByText('Enabled');
  const disabledLabel = screen.getByText('Disabled');
  const enabled = enabledLabel.closest('[role=button]') as Element;
  const disabled = disabledLabel.closest('[role=button]') as Element;
  const enabledFill = painted(enabled, '_bg-', 'background-color', scheme);
  const disabledFill = painted(disabled, '_bg-', 'background-color', scheme);
  const labelInk = painted(disabledLabel, '_col-', 'color', scheme);
  return {
    enabledFill,
    disabledFill,
    labelInk,
    fillDeltaE: deltaE(enabledFill, disabledFill),
    opacityDelta: opacityOf(enabled) - opacityOf(disabled),
    labelContrast: measureContrast({ foreground: labelInk, background: disabledFill }).ratio,
  };
}

describe('a disabled intent Button differs from its enabled twin', () => {
  for (const scheme of SCHEMES) {
    for (const disabledStyle of DISABLED_STYLES) {
      for (const variant of VARIANTS) {
        it(`${scheme} ${disabledStyle} ${variant.name}: fill ΔE ≥ ${MIN_FILL_DELTA_E} or opacity delta ≥ ${MIN_OPACITY_DELTA}`, () => {
          const m = measure(scheme, disabledStyle, variant.props);
          const detail = `${m.enabledFill} -> ${m.disabledFill}: ΔE ${m.fillDeltaE.toFixed(1)}, opacity delta ${m.opacityDelta}`;
          expect(m.fillDeltaE >= MIN_FILL_DELTA_E || m.opacityDelta >= MIN_OPACITY_DELTA, detail).toBe(true);
        });
      }
    }
  }
});

describe('keepLabel keeps the disabled label ≥ 4.5:1 on its own fill', () => {
  for (const scheme of SCHEMES) {
    for (const variant of VARIANTS) {
      it(`${scheme} ${variant.name}`, () => {
        const m = measure(scheme, 'keepLabel', variant.props);
        expect(
          m.labelContrast,
          `${m.labelInk} on ${m.disabledFill}: ${m.labelContrast.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(aaTextContrastRatio);
      });
    }
  }
});
