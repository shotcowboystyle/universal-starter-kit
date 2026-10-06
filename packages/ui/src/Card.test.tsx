import { readFileSync } from 'node:fs';
import path from 'node:path';

import { renderWithProviders } from '@repo/test-utils';
import { Preset, useResolvedKnobs } from '@repo/theme';
import type { Knobs } from '@repo/theme';
import { defaultConfig } from '@tamagui/config/v5';
import { cleanup, render } from '@testing-library/react';
import { Card as TamaguiCard, createTamagui, TamaguiProvider } from 'tamagui';
import { afterEach, describe, expect, it } from 'vitest';

import { Card, CardFooter, CardHeader } from './Card';

const cardConfig = createTamagui(defaultConfig);

const readSibling = (name: string) => readFileSync(path.join(import.meta.dirname, name), 'utf-8');

const DensityProbe = () => {
  const { knobProps } = useResolvedKnobs();
  return <span data-child-density={knobProps.density} />;
};

describe('Card named exports', () => {
  it('barrel re-exports the themed surface, not the tamagui primitive', () => {
    const index = readSibling('index.ts');
    expect(index).toMatch(/export \{ Card, CardFooter, CardHeader \} from ["']\.\/Card["']/u);
    expect(Card).not.toBe(TamaguiCard);
    expect(Card.Header).toBe(CardHeader);
    expect(Card.Footer).toBe(CardFooter);
  });
});

describe('Card — NestedScale only, no Tint', () => {
  it('source does not wrap Tint; NestedScale is the only nest dialect', () => {
    const src = readSibling('Card.tsx');
    expect(src).not.toMatch(/from ["'][^"']*Tint["']/u);
    expect(src).not.toMatch(/<[Tt]int[\s/>]/u);
    expect(src).toMatch(/const NestedScale = /u);
  });
});

const cornerRadii = [
  'borderTopLeftRadius',
  'borderTopRightRadius',
  'borderBottomRightRadius',
  'borderBottomLeftRadius',
] as const;
const paddingSides = ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'] as const;

const cappedCases = (['content', 'elevated'] as const).flatMap((tier) =>
  Object.entries({ none: 0, small: 5, medium: 9, large: 16, full: 50 }).flatMap(([borderRadius, stop]) =>
    Object.entries({ small: 13, medium: 18, large: 32 }).map(([space, inset]) => ({
      tier,
      borderRadius,
      space,
      stop,
      inset,
    })),
  ),
);

const featureCases = Object.entries({ none: 0, small: 26, medium: 34, large: 42, full: 50 }).flatMap(
  ([borderRadius, stop]) =>
    Object.entries({ small: 24, medium: 32, large: 39 }).map(([space, inset]) => ({
      borderRadius,
      space,
      stop,
      inset,
    })),
);

describe('Card host data attributes', () => {
  afterEach(cleanup);

  it.each(cappedCases)(
    'renders $tier/$borderRadius/$space with the documented cap',
    ({ tier, borderRadius, space, stop, inset }) => {
      const { container } = render(
        <TamaguiProvider
          config={cardConfig}
          defaultTheme="light">
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
      const frame = container.querySelector<HTMLElement>(`[data-tier="${tier}"]`)!;
      const style = getComputedStyle(frame);
      for (const corner of cornerRadii) {
        expect(style[corner]).toBe(`${Math.min(stop, inset)}px`);
      }
      for (const side of paddingSides) {
        expect(style[side]).toBe(`${inset}px`);
      }
      expect(frame.dataset.radiusKnob).toBe(borderRadius);
      expect(frame.dataset.spaceKnob).toBe(space);
    },
  );

  it.each(featureCases)(
    'renders feature/$borderRadius/$space at $stop px over $inset px, uncapped',
    ({ borderRadius, space, stop, inset }) => {
      const { container } = render(
        <TamaguiProvider
          config={cardConfig}
          defaultTheme="light">
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
      for (const corner of cornerRadii) {
        expect(style[corner]).toBe(`${stop}px`);
      }
      for (const side of paddingSides) {
        expect(style[side]).toBe(`${inset}px`);
      }
    },
  );

  it('renders the feature tier at the Bento 34px radius over a 32px inset under default knobs', () => {
    const { container } = render(
      <TamaguiProvider
        config={cardConfig}
        defaultTheme="light">
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
    const frame = container.querySelector<HTMLElement>('[data-tier]')!;
    expect(frame.dataset.tier).toBe('content');
    expect(frame.dataset.density).toBe('comfortable');
    expect(frame.dataset.nestedScale).toBe('root');
    expect(Number(frame.dataset.nestedPx)).toBeGreaterThan(0);
    expect(frame.hasAttribute('dataset')).toBe(false);
  });

  it('elevated and feature tiers stamp data-tier', () => {
    const elevated = renderWithProviders(<Card tier="elevated" />);
    expect(elevated.container.querySelector<HTMLElement>('[data-tier]')?.dataset.tier).toBe('elevated');
    cleanup();
    const feature = renderWithProviders(<Card tier="feature" />);
    expect(feature.container.querySelector<HTMLElement>('[data-tier]')?.dataset.tier).toBe('feature');
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
    const frames = container.querySelectorAll<HTMLElement>('[data-tier]');
    expect(frames).toHaveLength(2);
    expect(frames[0].dataset.density).toBe('comfortable');
    expect(frames[0].dataset.nestedScale).toBe('root');
    expect(frames[1].dataset.density).toBe('compact');
    expect(frames[1].dataset.nestedScale).toBe('nested');
    const probes = container.querySelectorAll<HTMLElement>('[data-child-density]');
    expect(probes[0].dataset.childDensity).toBe('compact');
    expect(probes[1].dataset.childDensity).toBe('compact');
  });

  it('does not step up when the ancestor is already compact', () => {
    const { container } = renderWithProviders(
      <Preset overrides={{ density: 'compact' }}>
        <Card>
          <DensityProbe />
        </Card>
      </Preset>,
    );
    const frame = container.querySelector<HTMLElement>('[data-tier]')!;
    expect(frame.dataset.density).toBe('compact');
    expect(frame.dataset.nestedScale).toBe('nested');
    expect(container.querySelector<HTMLElement>('[data-child-density]')?.dataset.childDensity).toBe('compact');
  });
});

describe('Card header / footer', () => {
  afterEach(cleanup);

  it('header and footer are zero-padding slots on the shared Card surface', () => {
    // The parts moved out of Card.tsx into their own modules, so
    // the zero-padding contract is read where it now lives. Card.tsx must not grow a
    // Header/Footer of its own again — that is what put the stub back last time.
    expect(readSibling('CardHeader.tsx')).toMatch(/TamaguiCard\.Header[\s\S]*padding=\{0\}/u);
    expect(readSibling('CardFooter.tsx')).toMatch(/TamaguiCard\.Footer[\s\S]*padding=\{0\}/u);
    const src = readSibling('Card.tsx');
    expect(src).not.toMatch(/const CardHeader\b/u);
    expect(src).not.toMatch(/const CardFooter\b/u);

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
