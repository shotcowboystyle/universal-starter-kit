/**
 * The token bridge, checked against the INSTALLED React Flow stylesheet.
 *
 * A map written from the docs goes stale the first time upstream adds a
 * variable, and nothing notices until a designer asks why one thing is the
 * wrong colour. So the vocabulary is re-derived from
 * `@xyflow/react/dist/style.css` on every run: a new name that is neither
 * mapped nor allowlisted fails here, and so does an allowlist entry whose
 * stated reason stops being true of the sheet.
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defaultKnobs, isResolvableThemeValue, resolveKnobs } from '@repo/theme';
import type { Knobs, ResolvedKnobs } from '@repo/theme';
import { describe, expect, it } from 'vitest';

import {
  edgeStrokeWidthPx,
  graphCssVars,
  graphTransitionCss,
  graphVarValues,
  spaceTokenPx,
  withAlpha,
  xyVarAllowlist,
} from './graphVars';
import type { GraphThemeAccess } from './graphVars';

const requireFromHere = createRequire(import.meta.url);
const packageRoot = path.resolve(import.meta.dirname, '../..');
const styleCssPath = requireFromHere.resolve('@xyflow/react/dist/style.css');
const styleCss = readFileSync(styleCssPath, 'utf-8');
const graphVarsSource = readFileSync(path.join(packageRoot, 'src/theme/graphVars.ts'), 'utf-8');

/**
 * `var(--xy-NAME, var(--xy-SOMETHING-default))` — the settable half of every pair.
 *
 * No backreference between the two names, deliberately. `--xy-background-pattern-color`
 * falls back to one of THREE per-pattern defaults
 * (`--xy-background-pattern-{cross,dots,lines}-color-default`), so a regex that
 * insists the fallback echo the settable name drops it and counts 34.
 */
const SETTABLE_PAIR = /var\(\s*(--xy-[a-z0-9-]+)\s*,\s*var\(\s*--xy-[a-z0-9-]+-default\s*\)\s*\)/g;

function settableNames(css: string): string[] {
  const names = new Set<string>();
  for (const match of css.matchAll(SETTABLE_PAIR)) {
    names.add(match[1]);
  }
  return [...names].sort();
}

/**
 * The selector of the rule a given offset sits inside: walk back to the
 * unmatched `{`, then back again to the end of the previous block.
 */
function enclosingSelector(css: string, index: number): string {
  let depth = 0;
  let open = -1;
  for (let i = index; i >= 0; i -= 1) {
    if (css[i] === '}') {
      depth += 1;
    } else if (css[i] === '{') {
      if (depth === 0) {
        open = i;
        break;
      }
      depth -= 1;
    }
  }
  if (open === -1) {
    return '';
  }
  let start = 0;
  for (let i = open - 1; i >= 0; i -= 1) {
    if (css[i] === '}' || css[i] === '{' || css[i] === ';') {
      start = i + 1;
      break;
    }
  }
  return css.slice(start, open).trim();
}

// ── A theme fixture with HEX raws, so the hex ban is not vacuous ──────────────

const fixtureRaw: Record<string, string> = {
  color: 'hsl(0, 0%, 9.0%)',
  color1: '#ffffff',
  color4: 'hsl(0, 0%, 94.1%)',
  color6: 'hsl(0, 0%, 90.0%)',
  color8: '#cfcfcf',
  color9: 'hsl(0, 0%, 56.1%)',
  color12: '#000000',
  borderColor: 'hsl(0, 0%, 92.0%)',
  outlineColor: '#3b82f6',
  background: '#ffffff',
};

const fixtureTheme: GraphThemeAccess = {
  css: (key) => (key in fixtureRaw ? `var(--${key})` : undefined),
  raw: (key) => fixtureRaw[key],
};

function resolveFor(knobs: Partial<Knobs>, scheme: 'light' | 'dark' = 'light'): ResolvedKnobs {
  return resolveKnobs({ ...defaultKnobs, ...knobs } as Knobs, undefined, scheme);
}

const defaultResolved = resolveFor({});

// ── Specs ────────────────────────────────────────────────────────────────────

describe('the installed React Flow vocabulary', () => {
  it('exposes exactly 35 settable names', () => {
    expect(settableNames(styleCss)).toHaveLength(35);
  });

  it('has every name either mapped or allowlisted with a reason', () => {
    const mapped = new Set(Object.keys(graphCssVars(defaultResolved, fixtureTheme)));
    const unhandled: string[] = [];
    for (const name of settableNames(styleCss)) {
      if (mapped.has(name)) {
        continue;
      }
      const reason = xyVarAllowlist[name];
      if (typeof reason !== 'string' || reason.trim() === '') {
        unhandled.push(name);
      }
    }
    expect(unhandled).toEqual([]);
  });

  it('maps 28 and allowlists 7', () => {
    const settable = new Set(settableNames(styleCss));
    const mapped = Object.keys(graphCssVars(defaultResolved, fixtureTheme)).filter((name) => settable.has(name));
    expect(mapped).toHaveLength(28);
    expect(Object.keys(xyVarAllowlist)).toHaveLength(7);
  });

  it('allowlists nothing that is already mapped', () => {
    const mapped = new Set(Object.keys(graphCssVars(defaultResolved, fixtureTheme)));
    for (const name of Object.keys(xyVarAllowlist)) {
      expect(mapped.has(name)).toBe(false);
    }
  });

  it('re-derives each allowlist reason: the 7 bind only to built-in node classes', () => {
    const builtIn = /^\.react-flow__node-(input|default|output|group)\b/;
    for (const name of Object.keys(xyVarAllowlist)) {
      const uses = [...styleCss.matchAll(new RegExp(`var\\(${name},`, 'g'))];
      expect(uses.length, `${name} is never used by the installed sheet`).toBeGreaterThan(0);
      for (const use of uses) {
        const selector = enclosingSelector(styleCss, use.index ?? 0);
        const parts = selector
          .split(',')
          .map((part) => part.trim())
          .filter(Boolean);
        expect(parts.length, `${name}: empty selector`).toBeGreaterThan(0);
        for (const part of parts) {
          expect(builtIn.test(part), `${name} also binds to "${part}"`).toBe(true);
        }
      }
    }
  });
});

describe('every mapped value resolves', () => {
  const schemes = ['light', 'dark'] as const;
  const knobSweep: Partial<Knobs>[] = [
    {},
    { fillStyle: 'outlined', borderWidth: 'none', elevation: 'none', size: 'small' },
    { borderWidth: 'small', elevation: 'medium', space: 'small', size: 'large' },
    { borderWidth: 'large', elevation: 'large', space: 'large', animation: 'none' },
    { animation: 'bouncy', density: 'compact', textAccent: 'low' },
  ];

  for (const scheme of schemes) {
    for (const [index, knobs] of knobSweep.entries()) {
      it(`passes isResolvableThemeValue on every atom (${scheme}, combo ${index})`, () => {
        const values = graphVarValues(resolveFor(knobs, scheme), fixtureTheme);
        for (const [name, value] of Object.entries(values)) {
          if (value.kind === 'color') {
            expect(isResolvableThemeValue(value.color), `${name}: ${value.color}`).toBe(true);
          } else if (value.kind === 'length') {
            expect(Number.isFinite(value.px), `${name}: ${value.px}`).toBe(true);
            expect(isResolvableThemeValue(value.px), `${name}: ${value.px}`).toBe(true);
          } else {
            expect(value.css.trim(), `${name} is empty`).not.toBe('');
            for (const atom of value.colors) {
              expect(isResolvableThemeValue(atom), `${name}: ${atom}`).toBe(true);
            }
          }
        }
      });

      it(`emits no hex and no color-mix (${scheme}, combo ${index})`, () => {
        const emitted = graphCssVars(resolveFor(knobs, scheme), fixtureTheme);
        for (const [name, value] of Object.entries(emitted)) {
          expect(/#[0-9a-f]{3,8}\b/i.test(value), `${name}: ${value}`).toBe(false);
          expect(value).not.toContain('color-mix(');
        }
      });
    }
  }

  it("bans a hex literal in the map's own source", () => {
    const withoutComments = graphVarsSource.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/^\s*\/\/.*$/gm, '');
    expect(/#[0-9a-f]{3,8}\b/i.test(withoutComments)).toBe(false);
    expect(withoutComments).not.toContain('color-mix(');
  });

  it('blends in JS rather than passing a hex through', () => {
    // The mask is 70% color1, and color1 is #ffffff in the fixture. A pass-through
    // would put that hex straight into the sheet, which is what the ban is for.
    const emitted = graphCssVars(defaultResolved, fixtureTheme);
    expect(emitted['--xy-minimap-mask-background-color']).toBe('rgba(255, 255, 255, 0.7)');
    expect(emitted['--xy-selection-background-color']).toBe('rgba(59, 130, 246, 0.12)');
  });

  it('converts hex, rgb and hsl and refuses anything it cannot read', () => {
    expect(withAlpha('#fff', 0.5)).toBe('rgba(255, 255, 255, 0.5)');
    expect(withAlpha('#1a192b', 0.25)).toBe('rgba(26, 25, 43, 0.25)');
    expect(withAlpha('rgb(1, 2, 3)', 0.4)).toBe('rgba(1, 2, 3, 0.4)');
    expect(withAlpha('hsl(0, 0%, 9.0%)', 0.12)).toBe('hsla(0, 0%, 9.0%, 0.12)');
    expect(withAlpha('var(--color9)', 0.5)).toBeUndefined();
    expect(withAlpha('oklch(0.5 0.1 200)', 0.5)).toBeUndefined();
  });
});

describe('the knob laws this layer owns', () => {
  it('remaps the edge stroke to 1 / 1.5 / 2 / 3 under a filled fill style', () => {
    const widths = (['none', 'small', 'medium', 'large'] as const).map((borderWidth) => {
      const emitted = graphCssVars(resolveFor({ fillStyle: 'filled', borderWidth }), fixtureTheme);
      return emitted['--xy-edge-stroke-width'];
    });
    expect(widths).toEqual(['1px', '1.5px', '2px', '3px']);
  });

  it('never lets the edge stroke reach 0', () => {
    for (const fillStyle of ['filled', 'outlined'] as const) {
      for (const borderWidth of ['none', 'small', 'medium', 'large'] as const) {
        const emitted = graphCssVars(resolveFor({ fillStyle, borderWidth }), fixtureTheme);
        expect(Number.parseFloat(emitted['--xy-edge-stroke-width'])).toBeGreaterThan(0);
      }
    }
  });

  it('moves the painted handle with `size` and never paints it at 44', () => {
    const painted = (['small', 'medium', 'large'] as const).map(
      (size) => graphCssVars(resolveFor({ size }), fixtureTheme)['--mpo-graph-handle-size'],
    );
    expect(painted).toEqual(['8px', '10px', '12px']);
    expect(painted).not.toContain('44px');
  });

  it('floors the handle HIT at 44 on coarse and at max(painted, 24) on fine', () => {
    const coarse = graphCssVars(resolveFor({ size: 'small' }), fixtureTheme, {
      pointer: 'coarse',
    });
    const fine = graphCssVars(resolveFor({ size: 'small' }), fixtureTheme, { pointer: 'fine' });
    expect(coarse['--mpo-graph-handle-hit']).toBe('44px');
    expect(fine['--mpo-graph-handle-hit']).toBe('24px');
  });

  it('keeps the guide at a hairline, undivided by pixel ratio', () => {
    expect(graphCssVars(defaultResolved, fixtureTheme)['--mpo-graph-guide-width']).toBe('0.5px');
  });

  it('emits a complete CSS transition shorthand, or `none`', () => {
    expect(graphCssVars(resolveFor({ animation: 'quick' }), fixtureTheme)['--mpo-graph-transition']).toBe(
      'all ease-in 100ms',
    );
    expect(graphCssVars(resolveFor({ animation: 'none' }), fixtureTheme)['--mpo-graph-transition']).toBe('none');
  });

  it('emits no `$token` — a CSS variable whose value is a token is dead', () => {
    for (const knobs of [{}, { space: 'small' as const }, { space: 'large' as const }]) {
      for (const [name, value] of Object.entries(graphCssVars(resolveFor(knobs), fixtureTheme))) {
        expect(value).not.toContain('$');
      }
    }
  });
});

describe('the mirrored token tables', () => {
  it('mirrors @tamagui/themes space tokens', async () => {
    const { tokens } = (await import('@tamagui/themes')) as {
      tokens: { space: Record<string, { val: number }> };
    };
    for (const [token, px] of Object.entries(spaceTokenPx)) {
      const installed = tokens.space[token.slice(1)];
      expect(installed, `space ${token} is not in the installed token table`).toBeDefined();
      expect(installed.val, `space ${token}`).toBe(px);
    }
  });

  it("mirrors the theme package's own CSS animation timings", () => {
    // Read as TEXT, not imported. `animations/index` is a platform twin and
    // resolves to the react-native spring table off the web, and the package's
    // exports map does not carry this subpath through the workspace alias —
    // both of which would make an import prove something other than the claim.
    const source = readFileSync(path.resolve(packageRoot, '../theme/src/theme/animations/css.ts'), 'utf-8');
    const block = /export const animationConfig = \{([\s\S]*?)\n\} as const;/.exec(source);
    expect(block, 'animationConfig is no longer an object literal in css.ts').not.toBeNull();
    const installed: Record<string, string> = {};
    for (const entry of block![1].matchAll(/(\w+):\s*"([^"]+)"/g)) {
      installed[entry[1]] = entry[2];
    }
    expect(Object.keys(installed).length).toBeGreaterThan(0);
    expect(Object.keys(graphTransitionCss).sort()).toEqual(Object.keys(installed).sort());
    for (const [name, timing] of Object.entries(installed)) {
      expect(graphTransitionCss[name], name).toBe(`all ${timing}`);
    }
  });

  it('keys the edge stroke remap by the four unclamped border numbers', () => {
    expect(Object.keys(edgeStrokeWidthPx).sort()).toEqual(['0', '0.5', '1', '2'].sort());
  });
});
