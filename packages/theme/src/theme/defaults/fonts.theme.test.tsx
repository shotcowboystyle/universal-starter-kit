/**
 * @vitest-environment happy-dom
 *
 * Theme spec: bodyFont family, size and leading measured on the
 * RENDERED TEXT NODE.
 *
 * Two traps this file exists to stay clear of.
 *
 * The button FRAME is always Inter — measuring it hid mono/serif/rounded
 * collapsing to -apple-system 14px/normal. So walk to the text node.
 *
 * And the measurement must come out of `getComputedStyle`, never out of the
 * class name. An earlier version of this spec read `font_serif` off the
 * element and then looked the family up in the source table, which asserts
 * that the table is the table. It also wrote `expect(parseFloat(lh) || 24)`,
 * which passes when the leading is unreadable, and guarded the size check
 * behind `if (fontSize)`. Every assertion below reads a real computed value
 * and fails when there is none.
 */

import { cleanup, render } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../animations/index', () => ({ animations: {} }));

import { TamaguiProvider, Text } from 'tamagui';

import { createDefaultThemeConfig } from '../createDefaultThemeConfig';
import { defaultKnobs } from '../knobs';
import { resolveKnobs } from '../resolveKnobs';

const themeConfig = createDefaultThemeConfig();

/** The stops the button-knobs board shoots, in board order. */
const BODY_STOPS = [
  { stop: 'sans-serif', token: 'body', firstFamily: 'Inter' },
  { stop: 'serif', token: 'serif', firstFamily: 'Georgia' },
  { stop: 'mono', token: 'mono', firstFamily: 'ui-monospace' },
  { stop: 'rounded', token: 'rounded', firstFamily: 'Nunito' },
] as const;

/** One ladder for every stop: `$true` is the era's body step. */
const LABEL_SIZE_PX = 15;
const LABEL_LEADING_PX = 23;

afterEach(cleanup);

/** Parent of the text node whose data is `label` — never a wrapping frame. */
function textNodeHost(root: HTMLElement, label: string): HTMLElement {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null = walker.nextNode();
  while (node) {
    if (node.textContent?.trim() === label && node.parentElement) {
      return node.parentElement;
    }
    node = walker.nextNode();
  }
  throw new Error(`no text node "${label}"`);
}

function measureLabel(bodyFont: (typeof BODY_STOPS)[number]['stop'], scheme: 'light' | 'dark') {
  const label = `Save-${bodyFont}`;
  const knobs = resolveKnobs({ ...defaultKnobs, bodyFont });
  const { container } = render(
    createElement(
      TamaguiProvider,
      { config: themeConfig.tamagui, defaultTheme: scheme },
      createElement(Text, { ...knobs.knobProps.body, fontSize: '$true' }, label),
    ),
  );
  const host = textNodeHost(container, label);
  const cs = getComputedStyle(host);
  const px = (value: string) => {
    const n = Number.parseFloat(value);
    if (!Number.isFinite(n)) {
      throw new Error(`unreadable length ${JSON.stringify(value)}`);
    }
    return n;
  };
  const family = cs.fontFamily.trim();
  if (!family) {
    throw new Error('no computed font-family on the text node');
  }
  return {
    host,
    knobs,
    family,
    firstFamily: family.split(',')[0]?.replace(/['"]/g, '').trim() ?? '',
    fontSize: px(cs.fontSize),
    lineHeight: cs.lineHeight.trim(),
    lineHeightPx: px(cs.lineHeight),
    letterSpacing: cs.letterSpacing.trim(),
  };
}

describe('bodyFont text-node family, size and leading', () => {
  for (const scheme of ['light', 'dark'] as const) {
    describe(scheme, () => {
      for (const { stop, token, firstFamily } of BODY_STOPS) {
        it(`${stop}: text node is ${firstFamily} ${LABEL_SIZE_PX}px/${LABEL_LEADING_PX}px`, () => {
          const m = measureLabel(stop, scheme);
          expect(m.knobs.knobProps.body.fontFamily).toBe(`$${token}`);

          // Trap: a wrapping frame stays Inter. We measured the text node.
          expect([...m.host.childNodes].some((n) => n.nodeType === Node.TEXT_NODE)).toBe(true);

          expect(m.firstFamily.toLowerCase()).toBe(firstFamily.toLowerCase());
          // The Inter stack legitimately names -apple-system as a fallback;
          // the defect was it arriving FIRST, which is what the text node reads.
          expect(m.firstFamily.toLowerCase()).not.toBe('-apple-system');

          expect(m.lineHeight.toLowerCase()).not.toBe('normal');
          expect(m.lineHeightPx).toBe(LABEL_LEADING_PX);
          expect(m.fontSize).toBe(LABEL_SIZE_PX);
          expect(m.lineHeightPx / m.fontSize).toBeGreaterThanOrEqual(1.4);
        });
      }

      it('the four stops resolve to four distinct family stacks', () => {
        const families = BODY_STOPS.map((s) => measureLabel(s.stop, scheme).firstFamily);
        expect(new Set(families).size).toBe(4);
        expect(families.some((f) => f.toLowerCase() === '-apple-system')).toBe(false);
      });

      it('flipping the family knob moves the family and nothing else', () => {
        const measured = BODY_STOPS.map((s) => measureLabel(s.stop, scheme));
        const sizes = new Set(measured.map((m) => m.fontSize));
        const leadings = new Set(measured.map((m) => m.lineHeightPx));
        expect([...sizes]).toEqual([LABEL_SIZE_PX]);
        expect([...leadings]).toEqual([LABEL_LEADING_PX]);
      });

      it("does not leak Inter's optical tracking onto the other faces", () => {
        for (const { stop } of BODY_STOPS.filter((s) => s.stop !== 'sans-serif')) {
          const m = measureLabel(stop, scheme);
          expect(Number.parseFloat(m.letterSpacing) || 0, `${stop} tracking`).toBe(0);
        }
        // Inter keeps its curve.
        expect(Number.parseFloat(measureLabel('sans-serif', scheme).letterSpacing)).toBeLessThan(0);
      });
    });
  }
});
