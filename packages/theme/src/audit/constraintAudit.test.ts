import { defaultConfig } from '@tamagui/config/v5';
import { afterEach, describe, expect, it } from 'vitest';

import { defaultHeadingFont } from '../theme/defaults/fonts';
import { defaultKnobs } from '../theme/knobs';
import { resolveKnobs } from '../theme/resolveKnobs';

import { GAP_KNOB, GAP_LG_KNOB, runConstraintAudit } from './constraintAudit';

afterEach(() => {
  document.body.innerHTML = '';
});

// Deliberately loses module scope, like Playwright page.evaluate.
const audit = new Function(`return (${runConstraintAudit.toString()})()`) as typeof runConstraintAudit;

function specimen(style: string, attrs: Record<string, string> = {}) {
  const el = document.createElement('div');
  el.id = 'specimen';
  el.style.cssText = style;
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, value);
  }
  document.body.append(el);
  return el;
}

function measured() {
  return audit().elements.find((el) => el.id === 'specimen');
}

function card(radius: string, space: string, tier = 'content') {
  return {
    'data-constraint-container': 'Card',
    'data-tier': tier,
    'data-radius-knob': radius,
    'data-space-knob': space,
  };
}

describe('Card container cap, independently measured against canonical stops', () => {
  for (const tier of ['content', 'elevated']) {
    for (const [radius, stop] of Object.entries({
      none: 0,
      small: 5,
      medium: 9,
      large: 16,
      full: 50,
    })) {
      for (const [space, inset] of Object.entries({ small: 13, medium: 18, large: 32 })) {
        it(`${tier}/${radius}/${space} accepts all four capped corners`, () => {
          specimen(`border-radius:${Math.min(stop, inset)}px;padding:${inset}px`, card(radius, space, tier));
          expect(measured()?.violations).toEqual([]);
          expect(measured()?.paddingTop?.value).toBe(inset);
        });
      }
    }
  }

  it.each([
    ['unrelated 13px', 'border-radius:13px;padding:13px', {}],
    ['tier alone is not Card provenance', 'border-radius:13px;padding:13px', { 'data-tier': 'content' }],
    ['16 exceeds 13 inset', 'border-radius:16px;padding:13px', card('large', 'small')],
    ['wrong last corner', 'border-radius:13px 13px 13px 9px;padding:13px', card('full', 'small')],
    ['nonzero at none', 'border-radius:5px;padding:13px', card('none', 'small')],
    ['arbitrary matching inset', 'border-radius:14px;padding:14px', card('full', 'small')],
    ['wrong canonical inset', 'border-radius:18px;padding:18px', card('full', 'small')],
    ['missing inset', 'border-radius:0;padding:0', card('none', 'small')],
    ['wrong individual inset', 'border-radius:13px;padding:13px 18px 13px 13px', card('full', 'small')],
    ['percent radius cannot bypass cap', 'border-radius:50%;padding:13px', card('full', 'small')],
    ['elliptical corner cannot bypass cap', 'border-radius:13px / 16px;padding:13px', card('full', 'small')],
  ])('rejects %s', (_label, style, attrs) => {
    specimen(style, attrs);
    expect(measured()?.violations.length).toBeGreaterThan(0);
  });

  it('leaves ordinary control radius rules intact', () => {
    specimen('border-radius:16px;padding:13px');
    expect(measured()?.violations).toEqual([]);
  });

  it.each([
    'border-top-left-radius',
    'border-top-right-radius',
    'border-bottom-right-radius',
    'border-bottom-left-radius',
  ])('rejects a wrong %s even when every radius is on the generic scale', (corner) => {
    const el = specimen('border-radius:9px;padding:13px', card('medium', 'small'));
    el.style.setProperty(corner, '5px');
    expect(measured()?.borderRadius?.offScale).toBe(true);
    expect(measured()?.violations).toHaveLength(1);
  });
});

describe('canonical gapLg parity in the serialized audit', () => {
  for (const space of ['small', 'medium', 'large'] as const) {
    it(space, () => {
      const token = resolveKnobs({ ...defaultKnobs, space }).knobProps.gapLg.gap;
      const px = defaultConfig.tokens.space[token as keyof typeof defaultConfig.tokens.space];
      expect(GAP_LG_KNOB[space]).toBe(px);
      const gapToken = resolveKnobs({ ...defaultKnobs, space }).knobProps.gap.gap;
      const gapPx = defaultConfig.tokens.space[gapToken as keyof typeof defaultConfig.tokens.space];
      expect(GAP_KNOB[space]).toBe(gapPx);
      specimen(`row-gap:${px}px;column-gap:${gapPx}px`);
      expect(measured()?.rowGap?.offScale).toBe(false);
      expect(measured()?.columnGap?.offScale).toBe(false);
    });
  }
  it.each([22, 25, 31, 33])('rejects non-recipe gap %i', (gap) => {
    specimen(`row-gap:${gap}px`);
    expect(measured()?.rowGap?.offScale).toBe(true);
  });
});

describe('font weight provenance', () => {
  it('pins the configured heading source behind the self-contained whitelist', () => {
    expect([...new Set(Object.values(defaultHeadingFont.weight).map(Number))].sort()).toEqual([600, 700, 800]);
  });
  it.each([600, 800])('accepts configured heading weight %i as unitless', (weight) => {
    expect(Object.values(defaultConfig.fonts.heading.weight)).toContain(String(weight));
    specimen(`font-weight:${weight}`, { class: 'font_heading' });
    expect(measured()?.fontWeight).toMatchObject({ value: weight, unit: '', offScale: false });
    expect(measured()?.fontWeight?.knob).toContain('configured heading');
  });
  it.each([500, 650, 900])('rejects unconfigured weight %i', (weight) => {
    specimen(`font-weight:${weight}`, { class: 'font_heading' });
    expect(measured()?.fontWeight?.offScale).toBe(true);
    expect(measured()?.violations.join(' ')).not.toContain(`${weight}px`);
  });
  it('does not grant arbitrary elements heading weights', () => {
    specimen('font-weight:800');
    expect(measured()?.fontWeight?.offScale).toBe(true);
  });
  it.each([
    ['regular', 700],
    ['bold', 800],
    ['bold', 400],
  ])('checks explicit %s recipe against %i even when configured', (knob, weight) => {
    specimen(`font-weight:${weight}`, { class: 'font_heading', 'data-font-weight-knob': knob });
    expect(measured()?.fontWeight?.offScale).toBe(true);
  });
});

function laidOut(el: HTMLElement, width: number, height: number) {
  Object.defineProperty(el, 'offsetWidth', { configurable: true, value: width });
  Object.defineProperty(el, 'offsetHeight', { configurable: true, value: height });
  return el;
}

describe('BINARY parts measure 0 or their own h/2', () => {
  const binary = { 'data-radius-resolution': 'BINARY' };

  it.each([
    ['switch track', 88, 44, 22],
    ['bold thumb', 40, 40, 20],
    ['default thumb', 38, 38, 19],
  ])('accepts a %s at h/2', (_part, width, height, radius) => {
    laidOut(specimen(`border-radius:${radius}px`, binary), width, height);
    expect(measured()?.violations).toEqual([]);
    expect(measured()?.borderRadius?.knob).toBe('BINARY 0 | h/2');
  });

  it('accepts a square BINARY part at none', () => {
    laidOut(specimen('border-radius:0', binary), 88, 44);
    expect(measured()?.violations ?? []).toEqual([]);
  });

  it.each([
    ['an intermediate radius', 'border-radius:9px'],
    ['the uncapped token', 'border-radius:50px'],
    ['h/2 of the longer edge', 'border-radius:44px'],
    ['one corner off h/2', 'border-radius:22px 22px 22px 16px'],
    ['a percentage', 'border-radius:50%'],
  ])('rejects %s', (_label, style) => {
    laidOut(specimen(style, binary), 88, 44);
    expect(measured()?.borderRadius?.offScale).toBe(true);
    expect(measured()?.violations.length).toBeGreaterThan(0);
  });

  it('keeps an undeclared h/2 radius off-scale', () => {
    laidOut(specimen('border-radius:22px'), 88, 44);
    expect(measured()?.borderRadius?.offScale).toBe(true);
  });
});

describe('declared capped containers beyond Card', () => {
  const declared = (container: string, radius: string, space: string) => ({
    'data-constraint-container': container,
    'data-radius-knob': radius,
    'data-space-knob': space,
  });

  it('accepts a PageSection surface capped at its own panelPadding', () => {
    specimen('border-radius:13px;padding:13px', declared('PageSection', 'full', 'small'));
    expect(measured()?.violations).toEqual([]);
  });

  it("measures a PageSection surface inset like a Card's", () => {
    specimen('border-radius:13px;padding:12px', declared('PageSection', 'full', 'small'));
    expect(measured()?.violations.join(' ')).toContain('PageSection panelPadding:small');
  });

  it('accepts a TextArea box at the cap whatever its field inset', () => {
    specimen('border-radius:13px;padding:0', declared('TextArea', 'full', 'small'));
    expect(measured()?.violations).toEqual([]);
    expect(measured()?.borderRadius?.knob).toBe('TextArea min(radius:full, panelPadding:small)');
  });

  it("audits a TextArea box's own padding on the ordinary scale", () => {
    specimen('border-radius:9px;padding:15px', declared('TextArea', 'medium', 'medium'));
    expect(measured()?.violations.join(' ')).toContain('paddingTop: 15px is off-scale');
  });

  it.each([
    ['the uncapped token', 'border-radius:50px', declared('TextArea', 'full', 'small')],
    ['a cap for another space', 'border-radius:18px', declared('TextArea', 'full', 'small')],
    ['the token past the cap', 'border-radius:16px', declared('TextArea', 'large', 'small')],
    ['an unknown radius stop', 'border-radius:13px', declared('TextArea', 'round', 'small')],
  ])('rejects %s', (_label, style, attrs) => {
    specimen(style, attrs);
    expect(measured()?.borderRadius?.offScale).toBe(true);
  });

  it('names a container the audit does not know instead of trusting it', () => {
    specimen('border-radius:13px;padding:13px', declared('Tile', 'full', 'small'));
    expect(measured()?.violations.join(' ')).toContain('"Tile" is not a container');
  });
});

describe('stacked rows cap their outer corners and square the inner ones', () => {
  const row = (position: string, radius: string, space: string) => ({
    'data-constraint-container': 'StackedRow',
    'data-stack-position': position,
    'data-radius-knob': radius,
    'data-space-knob': space,
  });
  const corners = (tl: number, tr: number, br: number, bl: number) =>
    `border-top-left-radius:${tl}px;border-top-right-radius:${tr}px;` +
    `border-bottom-right-radius:${br}px;border-bottom-left-radius:${bl}px;padding:7px 13px`;

  it.each([
    ['first', corners(13, 13, 0, 0)],
    ['middle', corners(0, 0, 0, 0)],
    ['last', corners(0, 0, 13, 13)],
    ['only', corners(13, 13, 13, 13)],
  ])('accepts a %s row capped at the row padding', (position, style) => {
    specimen(style, row(position, 'large', 'small'));
    expect(measured()?.violations).toEqual([]);
  });

  it('names the stop it resolved on an outer corner', () => {
    specimen(corners(18, 18, 0, 0), row('first', 'full', 'medium'));
    expect(measured()?.borderTopLeftRadius?.knob).toBe('StackedRow min(radius:full, panelPadding:medium)');
  });

  it.each([
    ['an uncapped outer corner', corners(16, 16, 0, 0), row('first', 'large', 'small')],
    ['a rounded inner corner', corners(13, 13, 13, 0), row('first', 'large', 'small')],
    ['a rounded middle row', corners(13, 0, 0, 0), row('middle', 'large', 'small')],
    ['a missing position', corners(13, 13, 13, 13), row('', 'large', 'small')],
  ])('rejects %s', (_label, style, attrs) => {
    specimen(style, attrs);
    expect(measured()?.borderRadius?.offScale).toBe(true);
  });

  it('says which corner is inner', () => {
    specimen(corners(0, 0, 13, 9), row('last', 'large', 'small'));
    expect(measured()?.violations).toEqual(['borderBottomLeftRadius: 9px does not match StackedRow cap (13px)']);
    specimen(corners(9, 0, 13, 13), row('last', 'large', 'small')).id = 'other';
    const other = audit().elements.find((el) => el.id === 'other');
    expect(other?.violations).toEqual(['borderTopLeftRadius: 9px is an inner corner of a last StackedRow (0px)']);
  });
});

describe('element labels hold nothing a knob or a mount writes', () => {
  it('drops React useId ids and Tamagui atomic classes', () => {
    const el = specimen('border-radius:12px');
    el.id = '_r_3i_';
    el.className = 'is_View _borderStartStartRadius-0hover-c-radius-12 _outlineWidth-0focus-0px';
    expect(measured()).toBeUndefined();
    const found = audit().elements.find((entry) => entry.label.startsWith('div'));
    expect(found?.label).toBe('div.is_View');
  });

  it('keeps an authored id', () => {
    specimen('border-radius:12px');
    expect(audit().elements[0]?.label).toBe('div#specimen');
  });
});

describe('a fixed-padding container caps at the padding it has', () => {
  const own = (radius: string) => ({
    'data-constraint-container': 'OwnInset',
    'data-radius-knob': radius,
    'data-space-knob': 'medium',
  });

  it('accepts full capped at its own 13px padding whatever the space stop', () => {
    specimen('border-radius:13px;padding:13px', own('full'));
    expect(measured()?.violations).toEqual([]);
    expect(measured()?.borderRadius?.knob).toBe('OwnInset min(radius:full, own padding)');
  });

  it('accepts the token while it fits', () => {
    specimen('border-radius:9px;padding:13px', own('medium'));
    expect(measured()?.violations).toEqual([]);
  });

  it.each([
    ['the panelPadding cap instead of its own', 'border-radius:18px;padding:13px', own('full')],
    ['the token past its padding', 'border-radius:16px;padding:13px', own('large')],
  ])('rejects %s', (_label, style, attrs) => {
    specimen(style, attrs);
    expect(measured()?.borderRadius?.offScale).toBe(true);
  });
});
