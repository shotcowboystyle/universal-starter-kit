import { resolveChartPalette } from '@repo/theme';
import * as Colors from '@tamagui/colors';
import { describe, expect, it } from 'vitest';

import { frappeEventColorNames, resolveFrappeEventColor } from './frappeEventColor';

const light = resolveChartPalette({ scheme: 'light' });
const dark = resolveChartPalette({ scheme: 'dark' });

describe(resolveFrappeEventColor, () => {
  it('maps Frappe named palette references to sanctioned Radix step-9 solids per scheme', () => {
    expect(resolveFrappeEventColor('blue', light)).toBe(Colors.blue.blue9);
    expect(resolveFrappeEventColor('blue', dark)).toBe(Colors.blueDark.blue9);
    expect(resolveFrappeEventColor('red', light)).toBe(Colors.red.red9);
    expect(resolveFrappeEventColor('green', dark)).toBe(Colors.greenDark.green9);
    expect(resolveFrappeEventColor('orange', light)).toBe(Colors.orange.orange9);
    expect(resolveFrappeEventColor('purple', dark)).toBe(Colors.purpleDark.purple9);
    expect(resolveFrappeEventColor('gray', light)).toBe(Colors.gray.gray9);
  });

  it('resolves every recognized name to a solid in both schemes', () => {
    for (const name of frappeEventColorNames) {
      expect(resolveFrappeEventColor(name, light), name).toMatch(/^#/);
      expect(resolveFrappeEventColor(name, dark), name).toMatch(/^#/);
    }
    // Radix step-9 solids are designed to work on both schemes; gray is the
    // family that ships scheme-specific solids and must follow the scheme.
    expect(resolveFrappeEventColor('gray', light)).not.toBe(resolveFrappeEventColor('gray', dark));
  });

  it("normalizes case, whitespace, and separators (desk stores 'Red', 'Dark Green')", () => {
    expect(resolveFrappeEventColor('Red', light)).toBe(Colors.red.red9);
    expect(resolveFrappeEventColor('  BLUE  ', light)).toBe(Colors.blue.blue9);
    expect(resolveFrappeEventColor('Dark Green', light)).toBe(Colors.grass.grass9);
    expect(resolveFrappeEventColor('dark-green', light)).toBe(Colors.grass.grass9);
    expect(resolveFrappeEventColor('dark_green', light)).toBe(Colors.grass.grass9);
  });

  it('resolves aliases: grey and the desk-calendar semantic names', () => {
    expect(resolveFrappeEventColor('grey', light)).toBe(Colors.gray.gray9);
    expect(resolveFrappeEventColor('danger', light)).toBe(Colors.red.red9);
    expect(resolveFrappeEventColor('success', dark)).toBe(Colors.greenDark.green9);
    expect(resolveFrappeEventColor('warning', light)).toBe(Colors.orange.orange9);
  });

  it('passes color literals through untouched in both schemes (Axiom 11)', () => {
    for (const palette of [light, dark]) {
      expect(resolveFrappeEventColor('#ff0000', palette)).toBe('#ff0000');
      expect(resolveFrappeEventColor('#F00', palette)).toBe('#F00');
      expect(resolveFrappeEventColor('#ff000080', palette)).toBe('#ff000080');
      expect(resolveFrappeEventColor('rgb(10, 20, 30)', palette)).toBe('rgb(10, 20, 30)');
      expect(resolveFrappeEventColor('rgba(10,20,30,0.5)', palette)).toBe('rgba(10,20,30,0.5)');
      expect(resolveFrappeEventColor('hsl(120, 50%, 50%)', palette)).toBe('hsl(120, 50%, 50%)');
    }
  });

  it('passes theme token references through', () => {
    expect(resolveFrappeEventColor('$accentBackground', light)).toBe('$accentBackground');
    expect(resolveFrappeEventColor('$red9', dark)).toBe('$red9');
  });

  it('falls back to the identity palette slot for unknown references (never a raw string)', () => {
    expect(resolveFrappeEventColor('unknowncolor', light)).toBe(light.single);
    expect(resolveFrappeEventColor('unknowncolor', dark)).toBe(dark.single);
    // Malformed hex is not a literal — honest fallback, not a broken CSS value.
    expect(resolveFrappeEventColor('#zzzzzz', light)).toBe(light.single);
  });

  it('normalizes a non-hex live-theme identity to hex (keeps luminance-computed text AA)', () => {
    const hslIdentity = { scheme: 'light' as const, single: 'hsl(255, 50%, 54%)' };
    expect(resolveFrappeEventColor('unknowncolor', hslIdentity)).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("treats 'default', empty, and non-string values as unset (theme identity chip)", () => {
    expect(resolveFrappeEventColor('default', light)).toBeUndefined();
    expect(resolveFrappeEventColor('Default', dark)).toBeUndefined();
    expect(resolveFrappeEventColor('', light)).toBeUndefined();
    expect(resolveFrappeEventColor('   ', light)).toBeUndefined();
    expect(resolveFrappeEventColor(undefined, light)).toBeUndefined();
    expect(resolveFrappeEventColor(null, light)).toBeUndefined();
    expect(resolveFrappeEventColor(3, light)).toBeUndefined();
  });

  it('covers the classic frappe.ui.color_map name set', () => {
    const classic = ['red', 'green', 'blue', 'dark-green', 'yellow', 'gray', 'purple', 'pink', 'orange'];
    for (const name of classic) {
      const resolved = resolveFrappeEventColor(name, light);
      expect(resolved, name).toMatch(/^#/);
      expect(resolved, name).not.toBe(light.single);
    }
  });
});
