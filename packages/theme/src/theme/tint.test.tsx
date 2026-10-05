import type React from 'react';
import { type ReactNode, createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

// Mock Tamagui's <Theme> so we can inspect the chosen theme name
vi.mock('tamagui', () => ({
  Theme: ({ name, children }: { name: string; children: ReactNode }) =>
    createElement('div', { 'data-tamagui-theme': name }, children),
}));

import type { ThemeName } from '@tamagui/web';

import { defaultKnobs } from './knobs';
import type { Preset } from './preset.types';
import { PresetContext, type PresetContextValue } from './PresetContext';
import { defaultPreset } from './presets';
import { Tint, useTintDepth } from './Tint';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Decorative nest family — the same four names as `defaultPreset.tints`. */
const FAMILY: ThemeName[] = ['orange', 'blue', 'purple', 'pink'];

function makePreset(tints: ThemeName[]): Preset {
  return {
    theme: 'light' as ThemeName,
    knobs: defaultKnobs,
    intents: {},
    tints,
  };
}

function wrapWithPreset(tints: ThemeName[], children: ReactNode): ReactNode {
  const ctx: PresetContextValue = { preset: makePreset(tints) };
  return createElement(PresetContext.Provider, { value: ctx }, children);
}

function renderToHtml(node: ReactNode): string {
  return renderToString(node as React.ReactElement);
}

/** Render a tree and return an array of all `data-tamagui-theme` values. */
function collectThemes(html: string): string[] {
  return Array.from(html.matchAll(/data-tamagui-theme="([^"]+)"/g), (m) => m[1]);
}

function nestTints(count: number, innermost: ReactNode = createElement('span', null, 'inner')): ReactNode {
  let node: ReactNode = innermost;
  for (let i = 0; i < count; i++) {
    node = createElement(Tint, null, node);
  }
  return node;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Tint', () => {
  it('defaultPreset.tints is the four-name decorative family', () => {
    expect(defaultPreset.tints).toEqual(FAMILY);
  });

  it('selects tints[0] for a single <Tint> (depth 1)', () => {
    const tree = wrapWithPreset(FAMILY, createElement(Tint, null, createElement('span', null, 'hello')));
    const html = renderToHtml(tree);
    const themes = collectThemes(html);
    // depth = 0 (parent) + 1 = 1 → tints[(1 - 1) % 4] = "orange"
    expect(themes).toEqual(['orange']);
  });

  it('increments depth correctly with nested <Tint>', () => {
    const tree = wrapWithPreset(
      FAMILY,
      createElement(Tint, null, createElement(Tint, null, createElement('span', null, 'inner'))),
    );
    const html = renderToHtml(tree);
    const themes = collectThemes(html);
    // outer: depth=1 → tints[0]="orange", inner: depth=2 → tints[1]="blue"
    expect(themes).toEqual(['orange', 'blue']);
  });

  it('wraps via modulo when depth exceeds tints.length', () => {
    // 5 nested Tints: depths 1..5 → indices 0,1,2,3,0 → orange,blue,purple,pink,orange
    const tree = wrapWithPreset(FAMILY, nestTints(5, createElement('span', null, 'deep')));
    const html = renderToHtml(tree);
    const themes = collectThemes(html);
    expect(themes).toEqual(['orange', 'blue', 'purple', 'pink', 'orange']);
  });

  it('applies alt prop offset', () => {
    // alt=2 at top level: depth = 0 + 1 + 2 = 3 → tints[(3 - 1) % 4] = "purple"
    const tree = wrapWithPreset(FAMILY, createElement(Tint, { alt: 2 }, createElement('span', null, 'alt')));
    const html = renderToHtml(tree);
    const themes = collectThemes(html);
    expect(themes).toEqual(['purple']);
  });

  it('skips Theme wrapper when disable is true', () => {
    const tree = wrapWithPreset(
      FAMILY,
      createElement(Tint, { disable: true }, createElement('span', null, 'no theme')),
    );
    const html = renderToHtml(tree);
    const themes = collectThemes(html);
    expect(themes).toEqual([]);
  });

  it('still increments depth when disabled (so children see correct depth)', () => {
    // disabled outer (depth=1, no theme wrap), inner (depth=2, wraps with tints[1]="blue")
    const tree = wrapWithPreset(
      FAMILY,
      createElement(Tint, { disable: true }, createElement(Tint, null, createElement('span', null, 'inner'))),
    );
    const html = renderToHtml(tree);
    const themes = collectThemes(html);
    expect(themes).toEqual(['blue']);
  });

  it('renders children without Theme wrapper when tints array is empty', () => {
    const tree = wrapWithPreset([], createElement(Tint, null, createElement('span', null, 'empty')));
    const html = renderToHtml(tree);
    const themes = collectThemes(html);
    expect(themes).toEqual([]);
    expect(html).toContain('empty');
  });

  it('renders children without Theme wrapper when no preset context exists', () => {
    // No PresetContext.Provider wrapper — usePresetTints returns []
    const tree = createElement(Tint, null, createElement('span', null, 'no context'));
    const html = renderToHtml(tree);
    const themes = collectThemes(html);
    expect(themes).toEqual([]);
    expect(html).toContain('no context');
  });
});

describe('useTintDepth', () => {
  it('returns 0 outside of any <Tint>', () => {
    let depth = -1;
    const Probe = () => {
      depth = useTintDepth();
      return null;
    };
    renderToString(createElement(Probe));
    expect(depth).toBe(0);
  });

  it('returns current depth inside nested <Tint> components', () => {
    let capturedDepth = -1;
    const Probe = () => {
      capturedDepth = useTintDepth();
      return createElement('span', null, 'probe');
    };
    const tree = wrapWithPreset(FAMILY, createElement(Tint, null, createElement(Tint, null, createElement(Probe))));
    renderToHtml(tree);
    expect(capturedDepth).toBe(2);
  });
});
