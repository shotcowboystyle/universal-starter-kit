import { describe, expect, it, beforeEach } from 'vitest';

import { defaultKnobs, type Knobs } from './knobs';
import type { Preset } from './preset.types';
import { registerPreset, getPreset, getPresetNames, clearPresets, resolveThemeFromPreset } from './shared';

const testPreset: Preset = {
  theme: 'blue' as any,
  knobs: { ...defaultKnobs, fillStyle: 'outlined' },
  intents: {},
  tints: [],
};

describe('preset registry', () => {
  beforeEach(() => {
    clearPresets();
  });

  it('registers and retrieves a preset', () => {
    registerPreset('test', testPreset);
    expect(getPreset('test')).toBe(testPreset);
  });

  it('returns undefined for unregistered preset', () => {
    expect(getPreset('nonexistent')).toBeUndefined();
  });

  it('lists registered preset names', () => {
    registerPreset('alpha', testPreset);
    registerPreset('beta', testPreset);
    expect(getPresetNames()).toEqual(['alpha', 'beta']);
  });

  it('clears all presets', () => {
    registerPreset('first', testPreset);
    clearPresets();
    expect(getPresetNames()).toEqual([]);
    expect(getPreset('first')).toBeUndefined();
  });

  it('overwrites a preset with the same name', () => {
    const updated = { ...testPreset, theme: 'green' as any };
    registerPreset('test', testPreset);
    registerPreset('test', updated);
    expect(getPreset('test')?.theme).toBe('green');
  });
});

describe('resolveThemeFromPreset', () => {
  beforeEach(() => {
    clearPresets();
  });

  it('resolves a registered preset with no overrides', () => {
    registerPreset('myPreset', testPreset);
    const resolved = resolveThemeFromPreset('myPreset', {});
    expect(resolved.knobs.fillStyle).toBe('outlined');
    expect(resolved.theme).toBe('blue');
  });

  it('merges overrides on top of preset knobs', () => {
    registerPreset('myPreset', testPreset);
    const resolved = resolveThemeFromPreset('myPreset', { size: 'large' });
    expect(resolved.knobs.size).toBe('large');
    expect(resolved.knobs.fillStyle).toBe('outlined');
  });

  it('falls back to defaultKnobs for unknown preset', () => {
    const resolved = resolveThemeFromPreset('unknown', { size: 'small' });
    expect(resolved.knobs.size).toBe('small');
    expect(resolved.knobs.fillStyle).toBe(defaultKnobs.fillStyle);
  });

  it('does not mutate the original preset', () => {
    registerPreset('immutable', testPreset);
    resolveThemeFromPreset('immutable', { size: 'large' });
    expect(testPreset.knobs.size).toBe('medium');
  });
});
