/**
 * `envelope.themeName` does not cross the bridge (MPO-211 task 2.7).
 *
 * The host and the canvas are two different Tamagui BUILDS with two different
 * theme tables — the app's config knows `light_blue`, the DOM bundle's knows
 * whatever `@repo/theme` created — and Tamagui throws
 * `Missing theme.` rather than degrading on a name it cannot find. Measured on
 * the iPhone 16e simulator: the canvas died at exactly that, caught by the DOM
 * entry's error boundary and reported as `render: Missing theme.`
 *
 * Design 6.1 assumed the name crossed. It does not. `scheme` does, and is what
 * the fallback keeps.
 */

import { describe, expect, it } from 'vitest';

import { resolveEnvelopeThemeName } from './KnobEnvelopeProvider';

const themes = { light: {}, dark: {}, light_blue: {} };

describe(resolveEnvelopeThemeName, () => {
  it('keeps a name the local table has', () => {
    expect(resolveEnvelopeThemeName({ scheme: 'light', themeName: 'light_blue' }, themes)).toBe('light_blue');
  });

  /** The case that took the canvas down. */
  it('falls back to the scheme when the local table has no such name', () => {
    expect(resolveEnvelopeThemeName({ scheme: 'dark', themeName: 'dark_orange' }, themes)).toBe('dark');
  });

  it('inherits rather than guessing when the table has neither', () => {
    expect(resolveEnvelopeThemeName({ scheme: 'dark', themeName: 'dark_orange' }, { a: {} })).toBeUndefined();
  });

  /**
   * On web there is no config, because the graph renders inside the app's own
   * provider and that provider owns the table. Nothing changes for the platform
   * that already worked.
   */
  it("passes the host's name straight through when no table is given", () => {
    expect(resolveEnvelopeThemeName({ scheme: 'light', themeName: 'anything_at_all' })).toBe('anything_at_all');
    expect(resolveEnvelopeThemeName({ scheme: 'light', themeName: '' })).toBeUndefined();
  });

  /** An inherited `toString` is not a theme. */
  it('does not treat a prototype key as a theme', () => {
    expect(resolveEnvelopeThemeName({ scheme: 'light', themeName: 'toString' }, themes)).toBe('light');
  });
});
