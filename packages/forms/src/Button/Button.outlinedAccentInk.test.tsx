/**
 * @vitest-environment happy-dom
 *
 * Under fillStyle outlined a `theme="accent"` Button (the portal's
 * Sign in) sits on its host with no fill, and its label kept the accent
 * sub-theme's on-fill `$color`, 1.06:1 on the light page. The accent slot is
 * solid by palette shape (defaults/accent.ts), so no step of its own ramp
 * reads on the page in both schemes; the earlier fix re-anchored only the solid
 * intents (error, warning, success) to `$color11`. The label and the frame's
 * `color` (currentColor glyphs) now take the host's readable accent ink.
 *
 * The `accent` intent stays filled under an outlined preset (SB-E-01,
 * intents.ts), so the knob channel only reaches `theme="accent"`; an explicit
 * `outlined` prop reaches both.
 *
 * jsdom cascades no Tamagui CSS, so this reads what the nodes ask for: the
 * atomic `_col-` class, the injected rule behind it, and for a `var(--token)`
 * rule the house theme table of the scope that paints it.
 */

import {
  aaTextContrastRatio,
  createDefaultThemeConfig,
  createThemesBuilder,
  defaultAccentTheme,
  defaultBaseTheme,
  defaultBuilderOptions,
  measureContrast,
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
type Scheme = (typeof SCHEMES)[number];
const HOST_SURFACES = ['background', 'color1', 'color2'] as const;
const CASES: { name: string; props: Partial<ButtonProps>; knob: boolean }[] = [
  {
    name: 'theme="accent" under the fillStyle outlined knob',
    props: { theme: 'accent' },
    knob: true,
  },
  { name: 'theme="accent" outlined', props: { theme: 'accent', outlined: true }, knob: false },
  { name: 'accent outlined', props: { accent: true, outlined: true }, knob: false },
];

function houseRender(ui: ReactElement, scheme: Scheme, knob: boolean) {
  const body = <YStack backgroundColor="$background">{ui}</YStack>;
  return render(
    <TamaguiProvider config={houseConfig.tamagui} defaultTheme={scheme} disableInjectCSS>
      {knob ? <Preset overrides={{ fillStyle: 'outlined' }}>{body}</Preset> : body}
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
  for (let node: Element | null = el; node; node = node.parentElement) {
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

function paintedColor(el: Element, scheme: Scheme): string {
  const cls = Array.from(el.classList).find(
    (c) => c.startsWith('_col-') && !/^_col-0(hover|active|focus|press)/.test(c),
  );
  if (!cls) {
    throw new Error(`${el.tagName} carries no _col- class`);
  }
  return resolveInScope(injectedRuleValue(cls, 'color'), scheme, scopeOf(el));
}

describe("an outlined accent Button's label reads on its host", () => {
  for (const scheme of SCHEMES) {
    for (const c of CASES) {
      it(`${scheme} ${c.name}: label and glyph ink clear 4.5:1 on every host surface`, () => {
        houseRender(<Button {...c.props}>Sign in</Button>, scheme, c.knob);
        const label = screen.getByText('Sign in');
        const frame = label.closest('[role=button]') as Element;
        for (const [part, el] of [
          ['label', label],
          ['frame', frame],
        ] as const) {
          const ink = paintedColor(el, scheme);
          for (const surface of HOST_SURFACES) {
            const ground = houseThemes[scheme][surface];
            const ratio = measureContrast({ foreground: ink, background: ground }).ratio;
            expect(
              ratio,
              `${part} ${ink} on ${scheme}.${surface} ${ground}: ${ratio.toFixed(2)}:1`,
            ).toBeGreaterThanOrEqual(aaTextContrastRatio);
          }
        }
      });
    }
  }

  for (const scheme of SCHEMES) {
    for (const c of [
      { name: 'theme="accent"', props: { theme: 'accent' }, knob: false },
      { name: 'accent under the fillStyle outlined knob', props: { accent: true }, knob: true },
    ] as const) {
      it(`${scheme}: a filled ${c.name} Button keeps its on-fill label`, () => {
        houseRender(<Button {...c.props}>Filled</Button>, scheme, c.knob);
        expect(screen.getByText('Filled').className).toMatch(/_col-color\b/);
      });
    }
  }
});
