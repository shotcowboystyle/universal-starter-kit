/**
 * Guardrail for the curated tamagui re-export surface (./tamagui.ts).
 *
 * The barrel used to `export * from "tamagui"`, leaking raw interactive
 * primitives under the house package name (the todos Checkbox incident:
 * a childless raw Checkbox renders no indicator, ever, while passing every
 * lint rule). This spec locks the curation both ways:
 *
 *  1. EXCLUDED bare names must never come back — each has a house
 *     equivalent in @repo/forms.
 *  2. The ALLOWLIST (layout/text/styling/theme utilities + overlay
 *     composition roots) must not be accidentally removed.
 *  3. The explicit `Tamagui*`-prefixed escape hatches must stay identical
 *     to the raw tamagui primitives (deliberate raw usage stays possible,
 *     but visible at the import site).
 *  4. House shadows (Tabs, Tooltip, Card, Toast, …) must stay the house
 *     versions, not the tamagui primitives.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import * as tamagui from 'tamagui';
import * as tamaguiLinearGradient from 'tamagui/linear-gradient';
import { describe, expect, it } from 'vitest';

import * as houseTamagui from './tamagui';

import * as pkg from './index';

const EXCLUDED_BARE_NAMES = [
  'Checkbox',
  'Form',
  'Input',
  'Label',
  'Progress',
  'RadioGroup',
  'Select',
  'Slider',
  'Switch',
  'TextArea',
] as const;

const ALLOWLIST_VALUE_NAMES = [
  // layout. Separator left this list 2026-08-28: a bare catalog name
  // may not resolve to a raw primitive, and the raw one is a
  // `flex: 1` item that can absorb free space. Bare `Separator` is
  // the house painted rule in ./Separator; raw rides the TamaguiSeparator
  // hatch. (It was silently restored here by the typography rework, which
  // rewrote this file from an older copy — tamagui.ts and index.ts kept
  // the house wiring, so this guardrail was asserting the opposite of the
  // barrel and had been red ever since. CI runs `turbo run build`
  // only, so nothing caught it.)
  'Circle',
  // VisuallyHidden / Unspaced are locked here so a
  // later Adapt-style rewrite cannot drop them without this spec going red.
  // LinearGradient is not on the main tamagui barrel — see the dedicated
  // assertion below rather than this identity check. Collapsible is a
  // house shadow: its Trigger defaults to type="button".
  'Group',
  'ListItem',
  'ScrollView',
  'Spacer',
  'Square',
  'Unspaced',
  'View',
  'VisuallyHidden',
  'XGroup',
  'XStack',
  'YGroup',
  'YStack',
  // text: none left. The raw primitives were knob-dead on native
  // and fontWeight/textAccent/pageTitleScale-dead everywhere — bare
  // Text/SizableText/Paragraph/Anchor and Heading/H1–H6 are the house
  // shadows in ./Text.tsx and ./Heading.tsx. Raw rides the TamaguiText /
  // TamaguiHeading / TamaguiH1… escape hatches.
  // actions / feedback: none left. Button left this list 2026-08-13 (raw
  // primitive knob-dead — bare `Button` is the house shadow in
  // ./Button.tsx); Spinner followed the same day (census: raw Spinner
  // spins at animation "none" — bare `Spinner` is the forms house version).
  // Raw rides the TamaguiButton / TamaguiSpinner escape hatches.
  // overlay composition roots — Adapt is dropped; compact vs
  // regular overlays use useViewportGtSm / AdaptivePopup / FloatingPanel.
  // Dialog and AlertDialog are house shadows.
  'Popover',
  'Portal',
  'PortalProvider',
  'Sheet',
  // providers / theme / animation
  'AnimatePresence',
  'TamaguiProvider',
  'Theme',
  // hooks
  'useControllableState',
  'useDidFinishSSR',
  'useEvent',
  'useMedia',
  'usePropsAndStyle',
  'useTheme',
  'useThemeName',
  // styling utilities
  'createStyledContext',
  'getToken',
  'getTokens',
  'getTokenValue',
  'isClient',
  'isWeb',
  'styled',
  'withStaticProperties',
] as const;

const ESCAPE_HATCHES: ReadonlyArray<[prefixed: string, raw: string]> = [
  ['TamaguiAnchor', 'Anchor'],
  ['TamaguiButton', 'Button'],
  ['TamaguiCheckbox', 'Checkbox'],
  ['TamaguiH1', 'H1'],
  ['TamaguiH2', 'H2'],
  ['TamaguiH3', 'H3'],
  ['TamaguiH4', 'H4'],
  ['TamaguiH5', 'H5'],
  ['TamaguiH6', 'H6'],
  ['TamaguiHeading', 'Heading'],
  ['TamaguiInput', 'Input'],
  ['TamaguiLabel', 'Label'],
  ['TamaguiParagraph', 'Paragraph'],
  ['TamaguiProgress', 'Progress'],
  ['TamaguiRadioGroup', 'RadioGroup'],
  ['TamaguiSelect', 'Select'],
  ['TamaguiSeparator', 'Separator'],
  ['TamaguiSizableText', 'SizableText'],
  ['TamaguiSlider', 'Slider'],
  ['TamaguiSpinner', 'Spinner'],
  ['TamaguiSwitch', 'Switch'],
  ['TamaguiText', 'Text'],
  ['TamaguiTextArea', 'TextArea'],
  ['TamaguiToggleGroup', 'ToggleGroup'],
];

const HOUSE_SHADOWS = [
  'AlertDialog',
  'Anchor',
  'Avatar',
  'Button',
  'Card',
  'Collapsible',
  'Dialog',
  'Fieldset',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'Heading',
  'Image',
  'Menu',
  'Paragraph',
  'Separator',
  'SizableText',
  'Spinner',
  'Tabs',
  'Text',
  'Toast',
  'Tooltip',
];

describe('curated tamagui surface', () => {
  it('does not export bare interactive primitives that have house forms equivalents', () => {
    for (const name of EXCLUDED_BARE_NAMES) {
      expect((pkg as Record<string, unknown>)[name], `barrel must not export bare "${name}"`).toBeUndefined();
    }
  });

  it('exports the benign allowlist (layout, text, styling, theme, overlay roots)', () => {
    for (const name of ALLOWLIST_VALUE_NAMES) {
      expect((pkg as Record<string, unknown>)[name], `barrel must export "${name}"`).toBeDefined();
      expect((pkg as Record<string, unknown>)[name], `barrel "${name}" must be the tamagui export`).toBe(
        (tamagui as Record<string, unknown>)[name],
      );
    }
  });

  it('exposes deliberate raw usage only through Tamagui*-prefixed escape hatches', () => {
    for (const [prefixed, raw] of ESCAPE_HATCHES) {
      expect((pkg as Record<string, unknown>)[prefixed], `barrel must export escape hatch "${prefixed}"`).toBe(
        (tamagui as Record<string, unknown>)[raw],
      );
    }
  });

  it('keeps house shadows as the house versions, not the tamagui primitives', () => {
    for (const name of HOUSE_SHADOWS) {
      const houseExport = (pkg as Record<string, unknown>)[name];
      expect(houseExport, `barrel must export house "${name}"`).toBeDefined();
      const rawExport = (tamagui as Record<string, unknown>)[name];
      if (rawExport !== undefined) {
        expect(houseExport, `barrel "${name}" must not be the raw tamagui primitive`).not.toBe(rawExport);
      }
    }
  });

  it('does not export Adapt', () => {
    expect(
      (pkg as Record<string, unknown>).Adapt,
      'Adapt is off the house barrel; useViewportGtSm / AdaptivePopup / FloatingPanel',
    ).toBeUndefined();
  });

  it('keeps overlay composition roots Sheet, Popover, and Portal', () => {
    for (const name of ['Sheet', 'Popover', 'Portal'] as const) {
      expect((pkg as Record<string, unknown>)[name], `barrel must keep "${name}"`).toBeDefined();
      expect((pkg as Record<string, unknown>)[name], `barrel "${name}" must be the tamagui export`).toBe(
        (tamagui as Record<string, unknown>)[name],
      );
    }
  });

  it('exports LinearGradient from tamagui/linear-gradient, not the main tamagui barrel', () => {
    expect((tamagui as Record<string, unknown>).LinearGradient).toBeUndefined();
    expect(houseTamagui.LinearGradient).toBe(tamaguiLinearGradient.LinearGradient);
    expect(pkg.LinearGradient).toBe(tamaguiLinearGradient.LinearGradient);
  });

  it('every Components story import from ./tamagui is a live barrel export', () => {
    const exported = new Set(Object.keys(houseTamagui));
    const missing: string[] = [];
    for (const file of walkStoryFiles(import.meta.dirname)) {
      for (const name of namedValueImportsFromHouseTamagui(readFileSync(file, 'utf8'))) {
        if (!exported.has(name)) {
          missing.push(`${file.slice(import.meta.dirname.length + 1)}:${name}`);
        }
      }
    }
    expect(missing, `stories import names ./tamagui.ts does not export: ${missing.join(', ')}`).toEqual([]);
  });
});

function walkStoryFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkStoryFiles(path));
    } else if (/\.stories\.tsx?$/.test(entry.name)) {
      out.push(path);
    }
  }
  return out;
}

function namedValueImportsFromHouseTamagui(src: string): string[] {
  const names: string[] = [];
  const re = /import\s+(type\s+)?\{([^}]+)\}\s+from\s+["']\.\/tamagui["']/g;
  for (const match of src.matchAll(re)) {
    const wholeClauseIsType = Boolean(match[1]);
    for (const raw of match[2].split(',')) {
      const part = raw.trim();
      if (!part) {
        continue;
      }
      if (wholeClauseIsType || /^type\s/.test(part)) {
        continue;
      }
      names.push(
        part
          .replace(/^type\s+/, '')
          .split(/\s+as\s+/)[0]
          .trim(),
      );
    }
  }
  return names;
}

// ---------------------------------------------------------------------------
// Type-level locks (checked by `tsc --noEmit`, not vitest): excluded Props
// types must not be re-exported either, and allowlisted types must exist.
// If an excluded type comes back, the @ts-expect-error goes unused and the
// package typecheck fails — same lock, opposite direction.
// ---------------------------------------------------------------------------
// @ts-expect-error CheckboxProps is intentionally not exported (house: forms)
type _NoCheckboxProps = import('./index').CheckboxProps;
// @ts-expect-error SwitchProps is intentionally not exported (house: forms)
type _NoSwitchProps = import('./index').SwitchProps;
// @ts-expect-error InputProps is intentionally not exported (house: forms)
type _NoInputProps = import('./index').InputProps;
// @ts-expect-error SelectProps is intentionally not exported (house: forms)
type _NoSelectProps = import('./index').SelectProps;
// @ts-expect-error SliderProps is intentionally not exported (house: forms)
type _NoSliderProps = import('./index').SliderProps;
// @ts-expect-error LabelProps is intentionally not exported (house: forms)
type _NoLabelProps = import('./index').LabelProps;
// @ts-expect-error Adapt is dropped from the house barrel
type _NoAdapt = import('./index').Adapt;

type _HasViewProps = import('./index').ViewProps;
type _HasXStackProps = import('./index').XStackProps;
type _HasYStackProps = import('./index').YStackProps;
type _HasTextProps = import('./index').TextProps;
type _HasButtonProps = import('./index').ButtonProps;
type _HasSizeTokens = import('./index').SizeTokens;
type _HasFontSizeTokens = import('./index').FontSizeTokens;
type _HasThemeName = import('./index').ThemeName;
type _HasTamaguiElement = import('./index').TamaguiElement;
type _HasGetProps = import('./index').GetProps<typeof pkg.View>;
