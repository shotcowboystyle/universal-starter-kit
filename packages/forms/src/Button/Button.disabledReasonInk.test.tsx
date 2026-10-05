/**
 * @vitest-environment jsdom
 *
 * T-HELPER: a disabled Button's reason is copy on the host surface,
 * not button chrome. Rendered inside the Button's intent <Theme>, its
 * `$color11` resolved on the intent's on-fill ramp and "Enter a title first"
 * painted 1.17:1 on the white page (Screens/Todos, light).
 *
 * jsdom does not cascade Tamagui CSS, so ink is resolved the way the browser
 * resolves it: the token on the text node's `_col-*` class, looked up in the
 * theme scope that encloses that node. Moving the reason back inside the
 * intent scope changes the looked-up ramp and fails the contrast arm.
 */

import {
  aaTextContrastRatio,
  createDefaultThemeConfig,
  createThemesBuilder,
  defaultAccentTheme,
  defaultBaseTheme,
  defaultBuilderOptions,
  measureContrast,
} from '@repo/theme';
import { render, cleanup, screen } from '@testing-library/react';
import { TamaguiProvider, YStack } from 'tamagui';
import { afterEach, describe, expect, it } from 'vitest';

import { Button, type ButtonProps } from './index';

afterEach(cleanup);

const houseConfig = createDefaultThemeConfig();
const houseThemes = createThemesBuilder(defaultBaseTheme, defaultAccentTheme, defaultBuilderOptions).themes();

const SCHEMES = ['light', 'dark'] as const;
const PLACEMENTS = ['below', 'inline'] as const;
const PAGE_SURFACES = ['background', 'color1', 'color2'] as const;

/** Every channel that re-themes the frame: the four intent props, and `theme`. */
const CHANNELS: { name: string; themeName: string; props: Partial<ButtonProps> }[] = [
  { name: 'accent', themeName: 'accent', props: { accent: true } },
  { name: 'error', themeName: 'error', props: { error: true } },
  { name: 'warning', themeName: 'warning', props: { warning: true } },
  { name: 'success', themeName: 'success', props: { success: true } },
  { name: 'theme="accent"', themeName: 'accent', props: { theme: 'accent' } },
];

function houseRender(ui: React.ReactElement, scheme: 'light' | 'dark') {
  return render(
    <TamaguiProvider config={houseConfig.tamagui} defaultTheme={scheme} disableInjectCSS>
      <YStack backgroundColor="$background">{ui}</YStack>
    </TamaguiProvider>,
  );
}

function scopeThemeKey(node: HTMLElement, scheme: string): string {
  const names: string[] = [];
  for (let el: HTMLElement | null = node; el; el = el.parentElement) {
    if (!el.classList.contains('is_Theme')) {
      continue;
    }
    for (const cls of Array.from(el.classList)) {
      if (!cls.startsWith('t_') || cls === 't_sub_theme') {
        continue;
      }
      const name = cls.slice(2);
      if (name !== 'light' && name !== 'dark') {
        names.unshift(name);
      }
    }
  }
  return [scheme, ...names].join('_');
}

function resolvedInk(node: HTMLElement, scheme: string): { key: string; token: string; ink: string } {
  const token = node.className.match(/(?:^|\s)_col-(\w+)(?:\s|$)/)?.[1];
  expect(token, `reason carries a colour token class: ${node.className}`).toBeTruthy();
  const key = scopeThemeKey(node, scheme);
  const ink = houseThemes[key]?.[token!];
  expect(ink, `${key}.${token} resolves in the house themes`).toBeTruthy();
  return { key, token: token!, ink: ink };
}

describe('Button disabledReason ink (T-HELPER)', () => {
  for (const scheme of SCHEMES) {
    for (const placement of PLACEMENTS) {
      it.each(CHANNELS)(
        `${scheme} ${placement}: the $name reason clears 4.5:1 on every page surface`,
        ({ name, props }) => {
          const reason = `Reason ${name}`;
          houseRender(
            <Button {...props} disabled disabledReason={reason} disabledReasonPlacement={placement}>
              Add
            </Button>,
            scheme,
          );
          const { key, token, ink } = resolvedInk(screen.getByText(reason), scheme);
          for (const surface of PAGE_SURFACES) {
            const ground = houseThemes[scheme][surface];
            const label = `${key}.${token} ${ink} on ${scheme}.${surface} ${ground}`;
            expect(measureContrast({ foreground: ink, background: ground, label }).ratio, label).toBeGreaterThanOrEqual(
              aaTextContrastRatio,
            );
          }
        },
      );

      it.each(CHANNELS)(
        `${scheme} ${placement}: the $name theme scopes the button, never its reason`,
        ({ name, themeName, props }) => {
          const reason = `Reason ${name}`;
          houseRender(
            <Button {...props} disabled disabledReason={reason} disabledReasonPlacement={placement}>
              Add
            </Button>,
            scheme,
          );
          const button = screen.getByRole('button');
          expect(button.getAttribute('aria-disabled')).toBe('true');
          expect(button.closest(`.t_${themeName}`), 'the frame keeps its intent theme').toBeTruthy();
          expect(
            screen.getByText(reason).closest(`.t_${themeName}`),
            'the reason resolves on the host surface',
          ).toBeNull();
          expect(scopeThemeKey(screen.getByText(reason), scheme)).toBe(scheme);
        },
      );
    }
  }
});
