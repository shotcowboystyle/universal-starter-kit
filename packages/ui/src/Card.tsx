import { Preset, borderRadiusMap, useResolvedKnobs } from '@repo/theme';
import type { ReactNode } from 'react';
import { Card as TamaguiCard, type CardProps as TamaguiCardProps, withStaticProperties } from 'tamagui';

import { CardFooter } from './CardFooter';
import { CardHeader } from './CardHeader';

/**
 * Knob-aware Card (+ Header / Footer).
 *
 * Nested hue is opt-in: this module does not wrap a tint surface.
 * NestedScale steps density only so nested chrome goes tighter, never
 * larger.
 *
 * Bento surface tiers:
 * - `content` (default): padded frame, bg only — no border, no shadow.
 * - `elevated`: bordered + elevated (overlay grammar — popovers, dropdowns).
 * - `feature`: big radius + ultra-soft wide shadow (marketing/auth cards).
 *
 * Padding contract: Card owns the inset (knob `panelPadding`) on every tier —
 * Header/Footer are zero-padding rows; vertical rhythm is the Card gap.
 */

export type SurfaceTier = 'content' | 'elevated' | 'feature';

export interface CardProps extends TamaguiCardProps {
  tier?: SurfaceTier;
}

export type { CardFooterProps } from './CardFooter';
export type { CardHeaderProps } from './CardHeader';

function NestedScale({ density, children }: { density: string; children: ReactNode }) {
  if (density === 'compact') {
    return children;
  }
  return <Preset overrides={{ density: 'compact' }}>{children}</Preset>;
}

/**
 * Tamagui styled hosts drop JSX `data-*` on native (Toast gallery hole), so
 * native needs the RN `dataSet` map. On web, spreading `dataSet` onto a DOM
 * host is a React invalid-prop warning (`dataSet` → `dataset`) and is what
 * the knob-fuzz harness recorded as a probe/console failure on every Card
 * consumer. jsdom and Storybook both keep kebab `data-*`, so web writes
 * those only.
 */
function hostData(attrs: Record<string, string>): Record<string, unknown> {
  if (process.env.TAMAGUI_TARGET !== 'native') {
    return attrs;
  }
  const dataSet: Record<string, string> = {};
  for (const [key, value] of Object.entries(attrs)) {
    const camel = key.replace(/^data-/, '').replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    dataSet[camel] = value;
  }
  return { dataSet };
}

function CardRoot({ children, tier = 'content', ...props }: CardProps) {
  const { knobProps } = useResolvedKnobs({ component: 'Card' });
  // Axiom 1 child-clip cap: the padded container's radius may not exceed its
  // own inset. cardSurface carries the cap already; the elevated tier layers
  // containerRadius over elevatedSurface. The feature tier follows the knobs
  // through its own uncapped table (featureSurface), so the cap does not apply.
  const tierProps =
    tier === 'elevated'
      ? { ...knobProps.elevatedSurface, ...knobProps.containerRadius }
      : tier === 'feature'
        ? knobProps.featureSurface
        : knobProps.cardSurface;
  const nested = knobProps.density === 'compact';
  // Decode the uncapped token through the canonical map. This preserves the
  // effective nested knob without asserting anything about the painted cap.
  const radiusKnob = Object.entries(borderRadiusMap).find(
    ([, token]) => token === knobProps.borderRadius.borderRadius,
  )?.[0];
  // panelPadding first so tier recipes may override (feature uses a larger
  // inset); elevatedSurface carries no padding of its own.
  return (
    <TamaguiCard
      {...knobProps.panelPadding}
      {...tierProps}
      {...knobProps.gap}
      {...hostData({
        'data-tier': tier,
        'data-density': knobProps.density,
        'data-nested-scale': nested ? 'nested' : 'root',
        'data-nested-px': String(knobProps.nestedControl.px),
        ...(tier !== 'feature' && radiusKnob
          ? {
              'data-constraint-container': 'Card',
              'data-radius-knob': radiusKnob,
              'data-space-knob': knobProps.space,
            }
          : {}),
      })}
      {...props}>
      <NestedScale density={knobProps.density}>{children}</NestedScale>
    </TamaguiCard>
  );
}

// Header and Footer are NOT defined here. They live in ./CardHeader and
// ./CardFooter, where a bare title/caption string is wrapped so T-HEADING /
// T-BODY ride the TEXT node instead of the View, and
// data-heading-font / data-body-font reach the DOM so the font knobs are
// observable. Card.tsx once carried stub copies that spread knobProps.heading
// onto the host and passed children through untouched; they were an older
// copy reintroduced by a later change and they silently un-did the fix.
// Re-exported here so ./index.ts and ./surfaces.tsx keep importing
// every Card part from one module.
export { CardFooter, CardHeader };

export const Card = withStaticProperties(CardRoot, {
  Header: CardHeader,
  Footer: CardFooter,
});
