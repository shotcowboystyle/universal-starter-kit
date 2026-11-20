// @vitest-environment jsdom
/**
 * Separator paints a line.
 *
 * What this locks: the house rule paints, at 1 CSS px, in $borderColor, in
 * both schemes, and cannot flex-grow (the raw primitive it
 * replaced declares `flex: 1`). Asserting a separator's height and never its
 * color is how a transparent rule ships, so this spec asserts the painted
 * color first.
 *
 * Note: the ticket's "96 of 96 paint nothing" reading was a probe artifact — it
 * read borderTopWidth on a primitive that paints borderBottomWidth. See the
 * component header. The assertions below are unaffected: they are about what
 * the HOUSE rule paints, not about what the raw one did.
 *
 * jsdom cannot CASCADE Tamagui's class-based CSS, so `getComputedStyle` on the
 * element reads nothing — but Tamagui does INJECT its atomic rules into
 * `document.styleSheets`, so the declaration behind each of the element's own
 * atoms is readable and is what this spec asserts. That is deliberate: the
 * first version of this file matched atom NAMES (`/_o-0d0t5/`), the encoder
 * emits `_o-0--5`, and the quiet test was red from the day it merged without
 * anyone seeing it — CI runs `turbo run build` only. A declaration is
 * the law; an atom name is an implementation detail of the encoder.
 */
import { renderWithProviders } from '@repo/test-utils';
import { cleanup } from '@testing-library/react';
import { Theme, getConfig } from 'tamagui';
import { afterEach, describe, expect, it } from 'vitest';

import { Separator } from './index';

const getSeparator = (container: HTMLElement): HTMLElement => {
  const el = container.querySelector('[role="separator"]');
  expect(el, "a Separator must render role='separator'").toBeTruthy();
  return el as HTMLElement;
};

const escapeForRegExp = (value: string) => value.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&');

const readRules = (sheet: CSSStyleSheet): CSSRule[] => {
  try {
    return [...sheet.cssRules];
  } catch {
    // cross-origin sheet; nothing of ours lives there
    return [];
  }
};

/**
 * Every value Tamagui declared for `property` through one of THIS element's
 * atomic classes. Empty means the element does not carry that property at all.
 */
const declared = (el: HTMLElement, property: string): string[] => {
  const atoms = el.className.split(/\s+/u).filter(Boolean);
  const declRe = new RegExp(`(?:^|[;\\s])${escapeForRegExp(property)}\\s*:\\s*([^;]+)`, 'u');
  const values: string[] = [];
  for (const sheet of document.styleSheets) {
    for (const rule of readRules(sheet)) {
      const groups = /^(?<selector>[^{]+)\{(?<body>[^}]*)\}$/u.exec(rule.cssText)?.groups;
      const decl =
        groups !== undefined &&
        atoms.some((atom) => new RegExp(`\\.${escapeForRegExp(atom)}(?![\\w-])`, 'u').test(groups.selector))
          ? declRe.exec(groups.body)
          : null;
      if (decl) {
        values.push(decl[1].trim());
      }
    }
  }
  return values;
};

/** Resolve a theme color Variable to its raw value string. */
const themeColorVal = (scheme: 'light' | 'dark', key: string): string => {
  const themes = getConfig().themes as Record<string, Record<string, { val?: string }>>;
  const variable = themes[scheme]?.[key];
  return variable?.val ?? '';
};

const isVisibleColor = (value: string): boolean => {
  if (!value) {
    return false;
  }
  if (value === 'transparent') {
    return false;
  }
  // rgba/hsla with a 0 alpha channel paints nothing.
  return !/(?:rgba|hsla)\([^)]*,\s*0(?:\.0+)?\s*\)/u.test(value);
};

describe('Separator — painted color (the regression this component exists for)', () => {
  afterEach(cleanup);

  it('paints its 1px box with the $borderColor token, not a transparent box', () => {
    const { container } = renderWithProviders(<Separator />);
    const separator = getSeparator(container);
    // PAINT: the declared background is the borderColor token, not transparent.
    expect(declared(separator, 'background-color')).toStrictEqual(['var(--borderColor)']);
    // GEOMETRY: exactly 1 CSS px tall — never 0.5.
    expect(declared(separator, 'height')).toStrictEqual(['1px']);
  });

  it('carries a visible $borderColor in BOTH schemes (token values are real colors)', () => {
    // The component paints one token; the scheme resolves it. Prove the token
    // itself is a visible color on both sides so the indirection cannot hide
    // a transparent value in either scheme.
    renderWithProviders(<Separator />);
    for (const scheme of ['light', 'dark'] as const) {
      const value = themeColorVal(scheme, 'borderColor');
      expect(value, `${scheme} theme must define borderColor`).not.toBe('');
      expect(isVisibleColor(value), `${scheme} borderColor "${value}" must be visible`).toBe(true);
    }
  });

  it('paints the same token under an explicit dark theme subtree', () => {
    const { container } = renderWithProviders(
      <Theme name="dark">
        <Separator />
      </Theme>,
    );
    const separator = getSeparator(container);
    expect(declared(separator, 'background-color')).toStrictEqual(['var(--borderColor)']);
    expect(declared(separator, 'height')).toStrictEqual(['1px']);
  });
});

describe('Separator — quiet variant (opacity 0.5, never a lighter color)', () => {
  afterEach(cleanup);

  it('dims with opacity 0.5 and keeps the exact same paint token', () => {
    const { container } = renderWithProviders(<Separator quiet />);
    const separator = getSeparator(container);
    expect(declared(separator, 'opacity')).toStrictEqual(['0.5']);
    // Never a lighter color: the paint token is unchanged from the default.
    expect(declared(separator, 'background-color')).toStrictEqual(['var(--borderColor)']);
  });

  it('default separator carries no opacity dim', () => {
    const { container } = renderWithProviders(<Separator />);
    expect(declared(getSeparator(container), 'opacity')).toStrictEqual([]);
  });
});

describe('Separator — vertical (vertical separators are 1px wide)', () => {
  afterEach(cleanup);

  it('is 1px wide, releases the horizontal height, and declares its orientation', () => {
    const { container } = renderWithProviders(<Separator vertical />);
    const separator = getSeparator(container);
    expect(declared(separator, 'width')).toStrictEqual(['1px']);
    expect(declared(separator, 'height')).toStrictEqual(['auto']);
    expect(separator.getAttribute('aria-orientation')).toBe('vertical');
  });

  it('horizontal default does not claim a vertical orientation', () => {
    const { container } = renderWithProviders(<Separator />);
    expect(getSeparator(container).getAttribute('aria-orientation')).toBeNull();
  });
});

describe('Separator — never leftover space', () => {
  afterEach(cleanup);

  it('cannot grow or shrink (flex: none discipline on the painting edge)', () => {
    const { container } = renderWithProviders(<Separator />);
    const separator = getSeparator(container);
    // The raw primitive it replaced declares `flex: 1` — the defect this block
    // measures — so both ends of the flex story are pinned here.
    expect(declared(separator, 'flex-grow')).toStrictEqual(['0']);
    expect(declared(separator, 'flex-shrink')).toStrictEqual(['0']);
  });
});

describe('Separator — consumer eject stays the last word (STD-EJECT-LAST)', () => {
  afterEach(cleanup);

  it('an explicit backgroundColor prop wins over the house paint', () => {
    const { container } = renderWithProviders(<Separator backgroundColor="$red9" />);
    const separator = getSeparator(container);
    expect(declared(separator, 'background-color')).toStrictEqual(['var(--red9)']);
  });
});
