/**
 * A consumer `getTheme` that returns something CSS
 * cannot resolve must fail at BUILD, not at paint.
 *
 * Two halves, and both are the acceptance criterion: a deliberate violation in
 * a fixture fails, and this package's own defaults pass. A check that only
 * does the first is a check nobody can keep.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('tamagui', () => ({
  createTamagui: vi.fn((config: Record<string, unknown>) => config),
}));
// The reanimated driver imports react-native, which has no Node build.
vi.mock('./animations/index', () => ({ animations: {} }));

import { createDefaultThemeConfig } from './createDefaultThemeConfig';
import { isResolvableThemeValue } from './themeValue';

describe('isResolvableThemeValue', () => {
  it.each([
    ['$color5', 'token reference'],
    ['#fff', '3-digit hex'],
    ['#ff00aa', '6-digit hex'],
    ['#ff00aa80', '8-digit hex'],
    ['rgba(0, 0, 0, 0.5)', 'rgba()'],
    ['hsla(210, 50%, 40%, 0.2)', 'hsla()'],
    ['oklch(0.7 0.1 200)', 'oklch()'],
    ['color-mix(in srgb, red 50%, blue)', 'color-mix()'],
    ['var(--fb-wall)', 'var()'],
    ['transparent', 'keyword'],
    ['currentColor', 'keyword'],
    ['rebeccapurple', 'named colour'],
    [0.5, 'number'],
  ])('accepts %s (%s)', (value, _kind) => {
    expect(isResolvableThemeValue(value)).toBe(true);
  });

  it.each([
    ['', 'empty string'],
    ['   ', 'whitespace'],
    ['undefined', 'the literal string undefined'],
    ['vaR(--x)', 'a misspelled function'],
    ['reddish', 'a word that is not a colour'],
    ['bakcground', 'a typo'],
    ['$', 'a bare dollar'],
    [{}, 'an object'],
  ])('rejects %s (%s)', (value, _kind) => {
    expect(isResolvableThemeValue(value)).toBe(false);
  });

  it('does not accept an arbitrary bare word — the typo case is the whole point', () => {
    // A `/^[a-z]+$/` shortcut would pass all three of these.
    expect(isResolvableThemeValue('backgroundd')).toBe(false);
    expect(isResolvableThemeValue('greeen')).toBe(false);
    expect(isResolvableThemeValue('green')).toBe(true);
  });
});

describe('composeGetTheme validates at build (10 B.3 item 3)', () => {
  it('throws on a deliberate fixture violation, naming theme, key and value', () => {
    expect(() =>
      createDefaultThemeConfig({
        builderOptions: { getTheme: () => ({ borderColor: 'vaR(--x)' }) },
      }),
    ).toThrow(/unresolvable value for "borderColor".*vaR\(--x\)/s);
  });

  it("throws on the literal string 'undefined', which nullish-dropping lets through", () => {
    expect(() =>
      createDefaultThemeConfig({
        builderOptions: { getTheme: () => ({ backgroundPress: 'undefined' }) },
      }),
    ).toThrow(/unresolvable value for "backgroundPress"/);
  });

  it('still drops nullish rather than failing on it (nullish dropping is unchanged)', () => {
    expect(() =>
      createDefaultThemeConfig({
        builderOptions: {
          getTheme: () => ({ borderColor: undefined, outlineColor: undefined }),
        },
      }),
    ).not.toThrow();
  });

  it('passes on a real consumer override', () => {
    expect(() =>
      createDefaultThemeConfig({
        builderOptions: { getTheme: () => ({ borderColor: '#ff00aa' }) },
      }),
    ).not.toThrow();
  });

  it("passes on the mpo tree's own defaults, with no consumer getTheme", () => {
    expect(() => createDefaultThemeConfig()).not.toThrow();
  });
});
