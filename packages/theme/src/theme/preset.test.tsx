import { type ReactNode, createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock Tamagui dependencies to avoid needing a full Tamagui config
vi.mock('tamagui', () => ({
  Theme: ({ name, children }: { name: string; children: ReactNode }) =>
    createElement('div', { 'data-tamagui-theme': name }, children),
}));

import type { ThemeName } from '@tamagui/web';

import { defaultKnobs } from './knobs';
import { Preset } from './Preset';
import type { Preset as PresetType } from './preset.types';
import { type PresetContextValue, usePresetContext } from './PresetContext';
import { clearPresets, registerPreset } from './shared';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const boldPreset: PresetType = {
  theme: 'blue' as ThemeName,
  knobs: {
    ...defaultKnobs,
    fillStyle: 'filled',
    borderRadius: 'large',
    elevation: 'large',
  },
  intents: {},
  tints: ['blue' as ThemeName, 'red' as ThemeName],
};

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createPresetContextCapture() {
  let captured: PresetContextValue | null = null;
  function Capture() {
    captured = usePresetContext();
    return null;
  }
  return {
    Capture,
    get result() {
      return captured;
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Preset component', () => {
  beforeEach(() => {
    clearPresets();
  });

  // -------------------------------------------------------------------------
  // 1. Default knobs
  // -------------------------------------------------------------------------
  it('provides default knobs when no preset is specified', () => {
    const capture = createPresetContextCapture();

    renderToString(createElement(Preset, null, createElement(capture.Capture)));

    expect(capture.result?.preset.knobs).toEqual(defaultKnobs);
  });

  // -------------------------------------------------------------------------
  // 2. Overrides merge on top of defaults
  // -------------------------------------------------------------------------
  it('merges overrides on top of defaults', () => {
    const capture = createPresetContextCapture();

    renderToString(createElement(Preset, { overrides: { borderRadius: 'full' } }, createElement(capture.Capture)));

    expect(capture.result?.preset.knobs.borderRadius).toBe('full');
    expect(capture.result?.preset.knobs.fillStyle).toBe(defaultKnobs.fillStyle);
  });

  // -------------------------------------------------------------------------
  // 3. Cascading — child overrides merge on top of parent
  // -------------------------------------------------------------------------
  it('cascades child overrides on top of parent', () => {
    const capture = createPresetContextCapture();

    renderToString(
      createElement(
        Preset,
        { overrides: { borderRadius: 'full' } },
        createElement(Preset, { overrides: { elevation: 'large' } }, createElement(capture.Capture)),
      ),
    );

    expect(capture.result?.preset.knobs.borderRadius).toBe('full');
    expect(capture.result?.preset.knobs.elevation).toBe('large');
  });

  // -------------------------------------------------------------------------
  // 4. cascade=false replaces parent entirely
  // -------------------------------------------------------------------------
  it('cascade={false} replaces parent entirely', () => {
    const capture = createPresetContextCapture();

    renderToString(
      createElement(
        Preset,
        { overrides: { borderRadius: 'full' } },
        createElement(Preset, { cascade: false, overrides: { elevation: 'large' } }, createElement(capture.Capture)),
      ),
    );

    expect(capture.result?.preset.knobs.borderRadius).toBe(defaultKnobs.borderRadius);
    expect(capture.result?.preset.knobs.elevation).toBe('large');
  });

  // -------------------------------------------------------------------------
  // 5. Named preset resolution
  // -------------------------------------------------------------------------
  it('resolves a named preset from the registry', () => {
    registerPreset('bold', boldPreset);
    const capture = createPresetContextCapture();

    renderToString(createElement(Preset, { preset: 'bold' }, createElement(capture.Capture)));

    expect(capture.result?.preset.knobs.borderRadius).toBe('large');
    expect(capture.result?.preset.knobs.elevation).toBe('large');
    expect(capture.result?.preset.theme).toBe('blue');
  });

  // -------------------------------------------------------------------------
  // 6. Named preset with overrides
  // -------------------------------------------------------------------------
  it('applies overrides on top of a named preset', () => {
    registerPreset('bold', boldPreset);
    const capture = createPresetContextCapture();

    renderToString(
      createElement(Preset, { preset: 'bold', overrides: { borderRadius: 'none' } }, createElement(capture.Capture)),
    );

    expect(capture.result?.preset.knobs.borderRadius).toBe('none');
    expect(capture.result?.preset.knobs.elevation).toBe('large');
  });

  // -------------------------------------------------------------------------
  // 7. Tamagui <Theme /> wrapping
  // -------------------------------------------------------------------------
  it('wraps children with Tamagui <Theme /> when theme prop is set', () => {
    const capture = createPresetContextCapture();

    const html = renderToString(createElement(Preset, { theme: 'blue' as ThemeName }, createElement(capture.Capture)));

    expect(html).toContain('data-tamagui-theme="blue"');
  });

  it('does not wrap with Tamagui <Theme /> when theme prop is absent', () => {
    const capture = createPresetContextCapture();

    const html = renderToString(createElement(Preset, null, createElement(capture.Capture)));

    expect(html).not.toContain('data-tamagui-theme');
  });

  // -------------------------------------------------------------------------
  // 8. Cascading named preset inside parent
  // -------------------------------------------------------------------------
  it('cascades a named preset on top of parent overrides', () => {
    registerPreset('bold', boldPreset);
    const capture = createPresetContextCapture();

    renderToString(
      createElement(
        Preset,
        { overrides: { fillStyle: 'outlined' } },
        createElement(Preset, { preset: 'bold' }, createElement(capture.Capture)),
      ),
    );

    // Named preset replaces base knobs in cascade mode
    expect(capture.result?.preset.knobs.borderRadius).toBe('large');
    // Parent override is carried forward
    expect(capture.result?.preset.knobs.fillStyle).toBe('outlined');
  });

  // -------------------------------------------------------------------------
  // 9. Unknown preset name falls back to defaults
  // -------------------------------------------------------------------------
  it('falls back to default knobs when preset name is not registered', () => {
    const capture = createPresetContextCapture();

    renderToString(createElement(Preset, { preset: 'nonexistent' }, createElement(capture.Capture)));

    expect(capture.result?.preset.knobs).toEqual(defaultKnobs);
  });

  // -------------------------------------------------------------------------
  // 10. scope prop does not exist on the type
  // -------------------------------------------------------------------------
  it('does not accept scope prop', () => {
    // TypeScript-level check: `scope` should not be part of PresetProps.
    // If this file compiles cleanly, the type check passes.
    // We verify at runtime that passing an unknown prop doesn't break anything.
    const capture = createPresetContextCapture();

    renderToString(
      createElement(
        Preset,
        // @ts-expect-error — scope is intentionally removed from PresetProps
        { scope: 'Form' },
        createElement(capture.Capture),
      ),
    );

    expect(capture.result?.preset.knobs).toEqual(defaultKnobs);
  });
});
