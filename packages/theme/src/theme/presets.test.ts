import type { ThemeName } from '@tamagui/web';
import { describe, it, expect, beforeEach } from 'vitest';

import { cookiePreset, cookieOverridesPrefix, splitCookieValue, joinSplitCookieValues } from './cookies';
import { defaultIntents } from './intents';
import type { Preset } from './preset.types';
import { registerPreset, getPreset, getPresetNames, clearPresets, resolveThemeFromPreset } from './shared';

// ---------------------------------------------------------------------------
// Preset fixtures
// ---------------------------------------------------------------------------

const houseKnobDefaults = {
  fieldLabelPlacement: 'top',
  requiredMarking: 'minority',
  tableZebra: 'off',
  bulkBarPlacement: 'top',
  selectAllScope: 'page',
  timestampStyle: 'absolute',
  disabledStyle: 'keepLabel',
  formAutofocus: 'off',
} as const;

const minimalPreset: Preset = {
  theme: 'gray' as ThemeName,
  knobs: {
    fillStyle: 'outlined',
    borderRadius: 'none',
    borderWidth: 'none',
    elevation: 'none',
    space: 'small',
    size: 'small',
    density: 'comfortable',
    textAccent: 'low',
    headingFont: 'sans-serif',
    bodyFont: 'sans-serif',
    fontWeight: 'regular',
    animation: 'none',
    ...houseKnobDefaults,
    hover: {},
    press: {},
    focus: {},
    focusVisible: {},
  },
  intents: defaultIntents,
  tints: ['gray'] as ThemeName[],
};

const boldPreset: Preset = {
  theme: 'blue' as ThemeName,
  knobs: {
    fillStyle: 'filled',
    borderRadius: 'full',
    borderWidth: 'large',
    elevation: 'medium',
    space: 'large',
    size: 'large',
    density: 'comfortable',
    textAccent: 'high',
    headingFont: 'sans-serif',
    bodyFont: 'sans-serif',
    fontWeight: 'bold',
    animation: 'bouncy',
    ...houseKnobDefaults,
    hover: {},
    press: {},
    focus: {},
    focusVisible: {},
  },
  intents: defaultIntents,
  tints: ['blue', 'purple'] as ThemeName[],
};

const roundedPreset: Preset = {
  theme: 'purple' as ThemeName,
  knobs: {
    fillStyle: 'filled',
    borderRadius: 'large',
    borderWidth: 'small',
    elevation: 'small',
    space: 'medium',
    size: 'medium',
    density: 'comfortable',
    textAccent: 'high',
    headingFont: 'sans-serif',
    bodyFont: 'sans-serif',
    fontWeight: 'regular',
    animation: 'quick',
    ...houseKnobDefaults,
    hover: {},
    press: {},
    focus: {},
    focusVisible: {},
  },
  intents: defaultIntents,
  tints: ['purple', 'pink'] as ThemeName[],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Theme Preset System', () => {
  beforeEach(() => {
    clearPresets();
  });

  // -------------------------------------------------------------------------
  // 1. Preset registration and lookup
  // -------------------------------------------------------------------------
  describe('preset registration and lookup', () => {
    it('registers a preset and retrieves it by name', () => {
      registerPreset('minimal', minimalPreset);
      const result = getPreset('minimal');
      expect(result).toEqual(minimalPreset);
    });

    it('returns undefined for an unregistered preset name', () => {
      expect(getPreset('nonexistent')).toBeUndefined();
    });

    it('lists all registered preset names', () => {
      registerPreset('minimal', minimalPreset);
      registerPreset('bold', boldPreset);
      registerPreset('rounded', roundedPreset);
      const names = getPresetNames();
      expect(names).toEqual(expect.arrayContaining(['minimal', 'bold', 'rounded']));
      expect(names).toHaveLength(3);
    });

    it('overwrites a preset when re-registered with the same name', () => {
      registerPreset('minimal', minimalPreset);
      const updated: Preset = {
        ...minimalPreset,
        knobs: { ...minimalPreset.knobs, space: 'large' },
      };
      registerPreset('minimal', updated);
      expect(getPreset('minimal')?.knobs.space).toBe('large');
    });
  });

  // -------------------------------------------------------------------------
  // 2. Cookie resolution order: preset config → overrides → active Theme
  // -------------------------------------------------------------------------
  describe('cookie resolution order', () => {
    it('resolves theme from preset config when no overrides exist', () => {
      registerPreset('minimal', minimalPreset);
      const resolved = resolveThemeFromPreset('minimal', {});
      expect(resolved.knobs.borderRadius).toBe('none');
      expect(resolved.knobs.elevation).toBe('none');
      expect(resolved.knobs.space).toBe('small');
    });

    it('merges overrides on top of preset config', () => {
      registerPreset('minimal', minimalPreset);
      const overrides = { borderRadius: 'full' as const, space: 'large' as const };
      const resolved = resolveThemeFromPreset('minimal', overrides);
      // Overrides win
      expect(resolved.knobs.borderRadius).toBe('full');
      expect(resolved.knobs.space).toBe('large');
      // Preset defaults preserved for non-overridden props
      expect(resolved.knobs.elevation).toBe('none');
      expect(resolved.knobs.fillStyle).toBe('outlined');
    });

    it('falls back to default knobs when preset name is unknown', () => {
      const resolved = resolveThemeFromPreset('nonexistent', {});
      // Should not throw — returns default preset shape
      expect(resolved).toBeDefined();
      expect(resolved.knobs.borderRadius).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // 3. Switching preset resets overrides
  // -------------------------------------------------------------------------
  describe('switching preset resets overrides', () => {
    it('resolveThemeFromPreset with a new preset ignores old overrides', () => {
      registerPreset('minimal', minimalPreset);
      registerPreset('bold', boldPreset);

      // Start with minimal + overrides
      const resolved1 = resolveThemeFromPreset('minimal', {
        elevation: 'medium',
      });
      expect(resolved1.knobs.elevation).toBe('medium');
      expect(resolved1.knobs.borderRadius).toBe('none');

      // Switch to bold — overrides should be empty (caller responsibility)
      // When switching presets, the caller clears overrides
      const resolved2 = resolveThemeFromPreset('bold', {});
      expect(resolved2.knobs.elevation).toBe('medium'); // bold preset's value
      expect(resolved2.knobs.borderRadius).toBe('full'); // bold preset's value
      expect(resolved2.knobs.space).toBe('large'); // bold preset's value
    });
  });

  // -------------------------------------------------------------------------
  // 4. SSR preset resolution from cookies (synchronous)
  // -------------------------------------------------------------------------
  describe('SSR preset resolution from cookies', () => {
    it('resolves synchronously from preset name and overrides', () => {
      registerPreset('rounded', roundedPreset);

      // Simulate SSR: we have raw cookie strings
      const presetName = 'rounded';
      const overridesJson = JSON.stringify({ borderWidth: 'large' });

      // Resolution must be synchronous — no async, no promises
      const overrides = JSON.parse(overridesJson);
      const resolved = resolveThemeFromPreset(presetName, overrides);

      expect(resolved.knobs.borderRadius).toBe('large'); // from preset
      expect(resolved.knobs.borderWidth).toBe('large'); // from override
      expect(resolved.theme).toBe('purple'); // from preset
    });

    it('handles empty overrides cookie gracefully', () => {
      registerPreset('minimal', minimalPreset);
      const resolved = resolveThemeFromPreset('minimal', {});
      expect(resolved.knobs).toEqual(minimalPreset.knobs);
    });
  });

  // -------------------------------------------------------------------------
  // 5. mp.preset + mp.overrides cookie read/write
  // -------------------------------------------------------------------------
  describe('cookie splitting and reconstruction', () => {
    it('splits a large cookie value into chunks', () => {
      // Create a value larger than 3.5KB
      const largeValue = JSON.stringify({
        key: 'x'.repeat(4000),
      });
      const chunks = splitCookieValue(largeValue);
      expect(chunks.length).toBeGreaterThan(1);
    });

    it('reconstructs a split cookie value from chunks', () => {
      const original = JSON.stringify({
        key: 'x'.repeat(4000),
      });
      const chunks = splitCookieValue(original);
      const reconstructed = joinSplitCookieValues(chunks);
      expect(reconstructed).toBe(original);
    });

    it('does not split a small cookie value', () => {
      const smallValue = JSON.stringify({ borderRadius: '$6' });
      const chunks = splitCookieValue(smallValue);
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toBe(smallValue);
    });

    it('cookie key constants are correct', () => {
      expect(cookiePreset).toBe('mp.preset');
      expect(cookieOverridesPrefix).toBe('mp.ov');
    });
  });
});
