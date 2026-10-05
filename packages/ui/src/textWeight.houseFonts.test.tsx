import { createDefaultThemeConfig, Preset } from '@repo/theme';
/**
 * Weight-rides-last on the HOUSE font tables, read as computed weight on the text node.
 *
 * The class-identity matrix (../tests/textWeightMatrix.tsx) runs on the stock
 * test config, which registers no `$serif`, so a family swap to serif there
 * resolves no font at all and cannot show the defect the portal did: a Band
 * H2 at Inter 600 falling to Georgia 400 under `headingFont: serif`. Here
 * the provider carries `createDefaultThemeConfig()`, the tables the live
 * apps ship (Inter heading ramp 600/700/800, category fonts 400 at every
 * step), and every assertion is a `getComputedStyle` value.
 */
import { cleanup, render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { TamaguiProvider } from 'tamagui';
import { afterEach, describe, expect, it } from 'vitest';

import { H1, H2, Heading } from './Heading';
import { Paragraph, SizableText, Text } from './Text';

const themeConfig = createDefaultThemeConfig();
const LABEL = 'Sign in to see your clusters';

afterEach(cleanup);

function textNodeHost(root: HTMLElement): HTMLElement {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.textContent?.trim() === LABEL && node.parentElement) {
      return node.parentElement;
    }
  }
  throw new Error(`no text node "${LABEL}"`);
}

function measure(node: ReactElement, scheme: 'light' | 'dark') {
  const { container } = render(
    <TamaguiProvider config={themeConfig.tamagui} defaultTheme={scheme}>
      {node}
    </TamaguiProvider>,
  );
  const cs = getComputedStyle(textNodeHost(container));
  const weight = cs.fontWeight.trim();
  const family = cs.fontFamily.split(',')[0]?.replace(/['"]/g, '').trim() ?? '';
  cleanup();
  if (!weight) {
    throw new Error('no computed font-weight on the text node');
  }
  if (!family) {
    throw new Error('no computed font-family on the text node');
  }
  return { weight, family };
}

const schemes = ['light', 'dark'] as const;
const headingSizes = ['$1', '$4', '$6', '$9'] as const;
const knobWeights = [
  ['regular', '400'],
  ['bold', '700'],
] as const;

describe('house headings keep their weight across headingFont', () => {
  for (const scheme of schemes) {
    for (const [name, Voice] of [
      ['Heading', Heading],
      ['H1', H1],
      ['H2', H2],
    ] as const) {
      it(`${scheme}: ${name} weight is the knob's at every size, sans-serif and serif alike`, () => {
        for (const [fontWeight, expected] of knobWeights) {
          for (const size of headingSizes) {
            const at = (headingFont: 'sans-serif' | 'serif') =>
              measure(
                <Preset overrides={{ fontWeight, headingFont }}>
                  <Voice size={size}>{LABEL}</Voice>
                </Preset>,
                scheme,
              );
            const sans = at('sans-serif');
            const serif = at('serif');
            expect(sans.family).toBe('Inter');
            expect(serif.family).toBe('Georgia');
            expect({ size, fontWeight, sans: sans.weight, serif: serif.weight }).toEqual({
              size,
              fontWeight,
              sans: expected,
              serif: expected,
            });
          }
        }
      });
    }

    it(`${scheme}: the portal Band heading keeps its explicit 700 under serif`, () => {
      for (const [fontWeight] of knobWeights) {
        for (const headingFont of ['sans-serif', 'serif'] as const) {
          const { weight } = measure(
            <Preset overrides={{ fontWeight, headingFont }}>
              <H2 margin={0} size="$1" fontWeight="700" color="$color12">
                {LABEL}
              </H2>
            </Preset>,
            scheme,
          );
          expect({ fontWeight, headingFont, weight }).toEqual({
            fontWeight,
            headingFont,
            weight: '700',
          });
        }
      }
    });
  }
});

describe('sized body voices take fontWeight and bodyFont together', () => {
  for (const scheme of schemes) {
    for (const [name, Voice] of [
      ['Text', Text],
      ['SizableText', SizableText],
      ['Paragraph', Paragraph],
    ] as const) {
      it(`${scheme}: ${name} size $3 is 700 Georgia under bold + serif`, () => {
        const m = measure(
          <Preset overrides={{ fontWeight: 'bold', bodyFont: 'serif' }}>
            <Voice size="$3">{LABEL}</Voice>
          </Preset>,
          scheme,
        );
        expect(m).toEqual({ weight: '700', family: 'Georgia' });
      });
    }
  }
});
