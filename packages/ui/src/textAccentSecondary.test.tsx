import { renderWithProviders } from '@repo/test-utils';
import { Preset, useResolvedKnobs } from '@repo/theme';
/**
 * `textAccent` reaches SECONDARY text, not just body text.
 *
 * The `secondary` / `muted` keys on componentColors' text table were a static
 * `$color11` read straight into the `color` prop, so every helper, caption and
 * inactive label rendered the same ink at `low`, `medium` and `high`. The resolver
 * already answers this: `knobProps.textAccentColor` is `$color11` at the two
 * dim stops (the AA legibility floor) and `$color` at `high`.
 *
 * Measurement follows the Text.test.tsx discipline: read the TEXT NODE's
 * `_col-` atomic class, compare between knob stops by identity, never against
 * a hashed literal. Meter publishes its resolved value ink on
 * `data-meter-value-color`, so that surface asserts the token directly.
 *
 * Both schemes are covered because `textAccent` is scheme-independent by
 * construction — the tokens are theme-relative — and a regression that
 * re-pins one scheme would show up here.
 */
import { cleanup, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { SizableText, Theme } from 'tamagui';
import { afterEach, describe, expect, it } from 'vitest';

import { Accordion } from './Accordion';
import { componentColors } from './componentColors';
import { Meter } from './Meter';
import { Quote } from './Quote';
import { Tabs } from './Tabs';

afterEach(cleanup);

type Accent = 'low' | 'medium' | 'high';
type Scheme = 'light' | 'dark';

function inScheme(scheme: Scheme, node: ReactElement): ReactElement {
  return scheme === 'dark' ? <Theme name="dark">{node}</Theme> : node;
}

/** The TEXT NODE's colour atom, by identity — hashed names never asserted. */
function inkAtoms(el: Element): string[] {
  return String((el as HTMLElement).className || '')
    .split(' ')
    .filter((c) => c.startsWith('_col-'))
    .sort();
}

function inkOf(scheme: Scheme, accent: Accent, label: string, node: ReactElement): string[] {
  renderWithProviders(inScheme(scheme, <Preset overrides={{ textAccent: accent }}>{node}</Preset>));
  const atoms = inkAtoms(screen.getByText(label));
  cleanup();
  return atoms;
}

const schemes: Scheme[] = ['light', 'dark'];

describe('Tabs — textAccent reaches the inactive tab label', () => {
  const items = [
    { value: 'address', label: 'Address & Contact', content: <>address panel</> },
    { value: 'settings', label: 'Settings', content: <>settings panel</> },
  ];
  const tabs = <Tabs items={items} defaultValue="address" />;

  for (const scheme of schemes) {
    it(`${scheme}: the inactive label moves between low and high`, () => {
      const low = inkOf(scheme, 'low', 'Settings', tabs);
      const high = inkOf(scheme, 'high', 'Settings', tabs);
      expect(low).not.toHaveLength(0);
      expect(high).not.toHaveLength(0);
      expect(high).not.toEqual(low);
    });

    it(`${scheme}: the inactive label keeps the AA floor at low and medium`, () => {
      expect(inkOf(scheme, 'low', 'Settings', tabs)).toEqual(inkOf(scheme, 'medium', 'Settings', tabs));
    });
  }
});

describe('Accordion — textAccent reaches the section description', () => {
  const description = 'Where should we deliver the order?';
  const accordion = (
    <Accordion defaultValue="shipping">
      <Accordion.Item value="shipping">
        <Accordion.Trigger description={description}>Shipping details</Accordion.Trigger>
        <Accordion.Content>ship</Accordion.Content>
      </Accordion.Item>
    </Accordion>
  );

  for (const scheme of schemes) {
    it(`${scheme}: the description moves between low and high`, () => {
      const low = inkOf(scheme, 'low', description, accordion);
      const high = inkOf(scheme, 'high', description, accordion);
      expect(low).not.toHaveLength(0);
      expect(high).not.toHaveLength(0);
      expect(high).not.toEqual(low);
    });

    it(`${scheme}: the description keeps the AA floor at low and medium`, () => {
      expect(inkOf(scheme, 'low', description, accordion)).toEqual(inkOf(scheme, 'medium', description, accordion));
    });
  }
});

describe('Quote — textAccent reaches the attribution', () => {
  const quote = <Quote cite="Alan Kay">The best way to predict the future.</Quote>;

  // The attribution renders as `<cite>— {name}</cite>`, two text runs in one
  // node, so getByText cannot reach it. Read the cite element itself.
  function citeInk(scheme: Scheme, accent: Accent): string[] {
    const { container } = renderWithProviders(
      inScheme(scheme, <Preset overrides={{ textAccent: accent }}>{quote}</Preset>),
    );
    const cite = container.querySelector('cite');
    expect(cite?.textContent).toContain('Alan Kay');
    const atoms = inkAtoms(cite as Element);
    cleanup();
    return atoms;
  }

  for (const scheme of schemes) {
    it(`${scheme}: the attribution moves between low and high`, () => {
      const low = citeInk(scheme, 'low');
      const high = citeInk(scheme, 'high');
      expect(low).not.toHaveLength(0);
      expect(high).not.toHaveLength(0);
      expect(high).not.toEqual(low);
    });

    it(`${scheme}: the attribution keeps the AA floor at low and medium`, () => {
      expect(citeInk(scheme, 'low')).toEqual(citeInk(scheme, 'medium'));
    });
  }
});

describe('Meter — textAccent reaches the ok-zone value readout', () => {
  const meter = <Meter label="Disk usage" value={6.2} min={0} max={8} unit="GB" />;

  function valueInk(scheme: Scheme, accent: Accent): string | null {
    const { container } = renderWithProviders(
      inScheme(scheme, <Preset overrides={{ textAccent: accent }}>{meter}</Preset>),
    );
    const token = container.querySelector('[data-meter-value]')?.getAttribute('data-meter-value-color');
    cleanup();
    return token ?? null;
  }

  for (const scheme of schemes) {
    it(`${scheme}: the ok value readout rides the resolver, not a static $color11`, () => {
      expect(valueInk(scheme, 'low')).toBe('$color11');
      expect(valueInk(scheme, 'medium')).toBe('$color11');
      expect(valueInk(scheme, 'high')).toBe('$color');
    });
  }

  it('a verdict zone keeps its semantic ink at every stop', () => {
    const warned = (accent: Accent) => {
      const { container } = renderWithProviders(
        <Preset overrides={{ textAccent: accent }}>
          <Meter label="Disk usage" value={7.5} min={0} max={8} low={2} high={6} unit="GB" />
        </Preset>,
      );
      const token = container.querySelector('[data-meter-value]')?.getAttribute('data-meter-value-color');
      cleanup();
      return token;
    };
    expect(warned('low')).toBe('$orange11');
    expect(warned('high')).toBe('$orange11');
  });
});

/**
 * low == medium alone also passes a surface pinned to a static step, so the
 * dim stops are checked against a probe painting the resolver's own colour.
 */
function restInk(el: Element): string | undefined {
  for (const cls of Array.from(el.classList)) {
    if (!cls.startsWith('_col-')) {
      continue;
    }
    const value = cls.slice('_col-'.length);
    if (/^\d*(hover|active|focus|press|disabled)/.test(value)) {
      continue;
    }
    return value;
  }
  return undefined;
}

function ResolverInk() {
  const { knobProps } = useResolvedKnobs();
  return (
    <SizableText data-resolver-ink={knobProps.textAccentColor} color={knobProps.textAccentColor}>
      resolver ink
    </SizableText>
  );
}

function againstResolver(
  scheme: Scheme,
  accent: Accent,
  node: ReactElement,
  pick: (container: HTMLElement) => Element | null,
) {
  const { container } = renderWithProviders(
    inScheme(
      scheme,
      <Preset overrides={{ textAccent: accent }}>
        {node}
        <ResolverInk />
      </Preset>,
    ),
  );
  const surface = pick(container);
  const probe = container.querySelector('[data-resolver-ink]');
  const result = {
    surface: surface ? restInk(surface) : undefined,
    resolver: probe ? restInk(probe) : undefined,
    token: probe?.getAttribute('data-resolver-ink') ?? null,
  };
  cleanup();
  return result;
}

describe("the dim stops paint the resolver's AA floor, not a pinned step", () => {
  const surfaces: Array<[string, ReactElement, (container: HTMLElement) => Element | null]> = [
    [
      'Tabs inactive label',
      <Tabs
        key="tabs"
        items={[
          { value: 'address', label: 'Address & Contact', content: <>address panel</> },
          { value: 'settings', label: 'Settings', content: <>settings panel</> },
        ]}
        defaultValue="address"
      />,
      () => screen.getByText('Settings'),
    ],
    [
      'Accordion description',
      <Accordion key="accordion" defaultValue="shipping">
        <Accordion.Item value="shipping">
          <Accordion.Trigger description="Where should we deliver the order?">Shipping details</Accordion.Trigger>
          <Accordion.Content>ship</Accordion.Content>
        </Accordion.Item>
      </Accordion>,
      () => screen.getByText('Where should we deliver the order?'),
    ],
    [
      'Quote attribution',
      <Quote key="quote" cite="Alan Kay">
        The best way to predict the future.
      </Quote>,
      (container) => container.querySelector('cite'),
    ],
  ];

  for (const scheme of schemes) {
    for (const [name, node, pick] of surfaces) {
      for (const accent of ['low', 'medium'] as const) {
        it(`${scheme}: ${name} at ${accent} equals the resolver's textAccentColor`, () => {
          const { surface, resolver, token } = againstResolver(scheme, accent, node, pick);
          expect(token).toBe('$color11');
          expect(resolver).toBeDefined();
          expect(surface).toBe(resolver);
        });
      }
    }
  }
});

describe('componentColors keeps no second answer for secondary ink', () => {
  it('the text table exposes no static secondary or muted step', () => {
    const text = componentColors.text as Record<string, string | undefined>;
    expect(text.secondary).toBeUndefined();
    expect(text.muted).toBeUndefined();
    expect(text.primary).toBe('$color');
  });
});
