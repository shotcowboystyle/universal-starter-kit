import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { renderWithProviders } from '@repo/test-utils';
import { Preset, useResolvedKnobs, type Knobs } from '@repo/theme';
import { defaultConfig } from '@tamagui/config/v5';
import { cleanup, render } from '@testing-library/react';
import { Card as TamaguiCard, createTamagui, TamaguiProvider } from 'tamagui';
import { afterEach, describe, expect, it } from 'vitest';

import { Card, CardFooter, CardHeader } from './Card';

const cardConfig = createTamagui(defaultConfig);

function readSibling(name: string) {
  return readFileSync(join(import.meta.dirname, name), 'utf8');
}

function DensityProbe() {
  const { knobProps } = useResolvedKnobs();
  return <span data-child-density={knobProps.density} />;
}

describe('Card named exports', () => {
  it('barrel re-exports the themed surface, not the tamagui primitive', () => {
    const index = readSibling('index.ts');
    expect(index).toMatch(/export \{ Card, CardFooter, CardHeader \} from ["']\.\/Card["']/);
    expect(Card).not.toBe(TamaguiCard);
    expect(Card.Header).toBe(CardHeader);
    expect(Card.Footer).toBe(CardFooter);
  });
});

describe('Card — NestedScale only, no Tint', () => {
  it('source does not wrap Tint; NestedScale is the only nest dialect', () => {
    const src = readSibling('Card.tsx');
    expect(src).not.toMatch(/from ["'][^"']*Tint["']/);
    expect(src).not.toMatch(/<[Tt]int[\s/>]/);
    expect(src).toMatch(/function NestedScale/);
  });
});

describe('Card host data attributes', () => {
  afterEach(cleanup);

  for (const tier of ['content', 'elevated'] as const) {
    for (const [borderRadius, stop] of Object.entries({
      none: 0,
      small: 5,
      medium: 9,
      large: 16,
      full: 50,
    })) {
      for (const [space, inset] of Object.entries({ small: 13, medium: 18, large: 32 })) {
        it(`renders ${tier}/${borderRadius}/${space} with the documented cap`, () => {
          const { container } = render(
            <TamaguiProvider config={cardConfig} defaultTheme="light">
              <Preset
                overrides={{
                  borderRadius: borderRadius as Knobs['borderRadius'],
                  space: space as Knobs['space'],
                  density: 'comfortable',
                }}>
                <Card tier={tier}>Measured Card</Card>
              </Preset>
            </TamaguiProvider>,
          );
          const frame = container.querySelector(`[data-tier="${tier}"]`)!;
          const style = getComputedStyle(frame);
          for (const corner of [
            'borderTopLeftRadius',
            'borderTopRightRadius',
            'borderBottomRightRadius',
            'borderBottomLeftRadius',
          ] as const) {
            expect(style[corner]).toBe(`${Math.min(stop, inset)}px`);
          }
          for (const side of ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'] as const) {
            expect(style[side]).toBe(`${inset}px`);
          }
          expect(frame).toHaveAttribute('data-radius-knob', borderRadius);
          expect(frame).toHaveAttribute('data-space-knob', space);
        });
      }
    }
  }

  for (const [borderRadius, stop] of Object.entries({
    none: 0,
    small: 26,
    medium: 34,
    large: 42,
    full: 50,
  })) {
    for (const [space, inset] of Object.entries({ small: 24, medium: 32, large: 39 })) {
      it(`renders feature/${borderRadius}/${space} at ${stop}px over ${inset}px, uncapped`, () => {
        const { container } = render(
          <TamaguiProvider config={cardConfig} defaultTheme="light">
            <Preset
              overrides={{
                borderRadius: borderRadius as Knobs['borderRadius'],
                space: space as Knobs['space'],
                density: 'comfortable',
              }}>
              <Card tier="feature">Measured Card</Card>
            </Preset>
          </TamaguiProvider>,
        );
        const style = getComputedStyle(container.querySelector('[data-tier="feature"]')!);
        for (const corner of [
          'borderTopLeftRadius',
          'borderTopRightRadius',
          'borderBottomRightRadius',
          'borderBottomLeftRadius',
        ] as const) {
          expect(style[corner]).toBe(`${stop}px`);
        }
        for (const side of ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'] as const) {
          expect(style[side]).toBe(`${inset}px`);
        }
      });
    }
  }

  it('renders the feature tier at the Bento 34px radius over a 32px inset under default knobs', () => {
    const { container } = render(
      <TamaguiProvider config={cardConfig} defaultTheme="light">
        <Card tier="feature">Measured Card</Card>
      </TamaguiProvider>,
    );
    const style = getComputedStyle(container.querySelector('[data-tier="feature"]')!);
    expect(style.borderTopLeftRadius).toBe('34px');
    expect(style.paddingTop).toBe('32px');
  });

  it('does not reclassify the feature tier as a capped container', () => {
    const { container } = renderWithProviders(<Card tier="feature">Feature</Card>);
    expect(container.querySelector('[data-tier="feature"]')).not.toHaveAttribute('data-constraint-container');
  });

  it('declares effective nested radius and space without computing an audit verdict', () => {
    const { container } = renderWithProviders(
      <Preset overrides={{ borderRadius: 'none', space: 'large', density: 'comfortable' }}>
        <Preset overrides={{ borderRadius: 'full', density: 'compact' }}>
          <Card tier="elevated">Nested</Card>
        </Preset>
      </Preset>,
    );
    const frame = container.querySelector('[data-tier="elevated"]');
    expect(frame).toHaveAttribute('data-constraint-container', 'Card');
    expect(frame).toHaveAttribute('data-radius-knob', 'full');
    expect(frame).toHaveAttribute('data-space-knob', 'medium');
  });

  it('writes tier, density, nested-scale and nested-px onto the frame', () => {
    const { container } = renderWithProviders(
      <Card>
        <span>body</span>
      </Card>,
    );
    const frame = container.querySelector('[data-tier]') as HTMLElement;
    expect(frame.getAttribute('data-tier')).toBe('content');
    expect(frame.getAttribute('data-density')).toBe('comfortable');
    expect(frame.getAttribute('data-nested-scale')).toBe('root');
    expect(Number(frame.getAttribute('data-nested-px'))).toBeGreaterThan(0);
    expect(frame.hasAttribute('dataset')).toBe(false);
  });

  it('elevated and feature tiers stamp data-tier', () => {
    const elevated = renderWithProviders(<Card tier="elevated" />);
    expect(elevated.container.querySelector('[data-tier]')?.getAttribute('data-tier')).toBe('elevated');
    cleanup();
    const feature = renderWithProviders(<Card tier="feature" />);
    expect(feature.container.querySelector('[data-tier]')?.getAttribute('data-tier')).toBe('feature');
  });
});

describe('Card NestedScale', () => {
  afterEach(cleanup);

  it('steps nested Card and children to compact density', () => {
    const { container } = renderWithProviders(
      <Card>
        <DensityProbe />
        <Card>
          <DensityProbe />
        </Card>
      </Card>,
    );
    const frames = container.querySelectorAll('[data-tier]');
    expect(frames.length).toBe(2);
    expect(frames[0].getAttribute('data-density')).toBe('comfortable');
    expect(frames[0].getAttribute('data-nested-scale')).toBe('root');
    expect(frames[1].getAttribute('data-density')).toBe('compact');
    expect(frames[1].getAttribute('data-nested-scale')).toBe('nested');
    const probes = container.querySelectorAll('[data-child-density]');
    expect(probes[0].getAttribute('data-child-density')).toBe('compact');
    expect(probes[1].getAttribute('data-child-density')).toBe('compact');
  });

  it('does not step up when the ancestor is already compact', () => {
    const { container } = renderWithProviders(
      <Preset overrides={{ density: 'compact' }}>
        <Card>
          <DensityProbe />
        </Card>
      </Preset>,
    );
    const frame = container.querySelector('[data-tier]') as HTMLElement;
    expect(frame.getAttribute('data-density')).toBe('compact');
    expect(frame.getAttribute('data-nested-scale')).toBe('nested');
    expect(container.querySelector('[data-child-density]')?.getAttribute('data-child-density')).toBe('compact');
  });
});

describe('Card header / footer', () => {
  afterEach(cleanup);

  it('header and footer are zero-padding slots on the shared Card surface', () => {
    // The parts moved out of Card.tsx into their own modules, so
    // the zero-padding contract is read where it now lives. Card.tsx must not grow a
    // Header/Footer of its own again — that is what put the stub back last time.
    expect(readSibling('CardHeader.tsx')).toMatch(/TamaguiCard\.Header[\s\S]*padding=\{0\}/);
    expect(readSibling('CardFooter.tsx')).toMatch(/TamaguiCard\.Footer[\s\S]*padding=\{0\}/);
    const src = readSibling('Card.tsx');
    expect(src).not.toMatch(/function CardHeader\b/);
    expect(src).not.toMatch(/function CardFooter\b/);

    const { container } = renderWithProviders(
      <Card>
        <Card.Header>Title</Card.Header>
        <span>body</span>
        <Card.Footer>Actions</Card.Footer>
      </Card>,
    );
    expect(container.querySelector('[data-slot="header"]')?.textContent).toContain('Title');
    expect(container.querySelector('[data-slot="footer"]')?.textContent).toContain('Actions');
  });
});
