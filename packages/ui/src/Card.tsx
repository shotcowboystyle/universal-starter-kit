import { Preset, borderRadiusMap, useResolvedKnobs } from '@repo/theme';
import type { KnobProps } from '@repo/theme';
import type { ReactNode } from 'react';
import { Card as TamaguiCard, withStaticProperties } from 'tamagui';
import type { CardProps as TamaguiCardProps } from 'tamagui';

import { CardFooter } from './CardFooter';
import { CardHeader } from './CardHeader';
import { hostData } from './host-data';

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

const NestedScale = ({ density, children }: { density: string; children: ReactNode }): ReactNode => {
  if (density === 'compact') {
    return children;
  }
  return <Preset overrides={{ density: 'compact' }}>{children}</Preset>;
};

const tierSurface = (knobProps: KnobProps, tier: SurfaceTier) => {
  if (tier === 'elevated') {
    return { ...knobProps.elevatedSurface, ...knobProps.containerRadius };
  }
  return tier === 'feature' ? knobProps.featureSurface : knobProps.cardSurface;
};

const CardRoot = ({ children, tier = 'content', ...props }: CardProps) => {
  const { knobProps } = useResolvedKnobs({ component: 'Card' });
  // Axiom 1 child-clip cap: the padded container's radius may not exceed its
  // own inset. cardSurface carries the cap already; the elevated tier layers
  // containerRadius over elevatedSurface. The feature tier follows the knobs
  // through its own uncapped table (featureSurface), so the cap does not apply.
  const tierProps = tierSurface(knobProps, tier);
  const nested = knobProps.density === 'compact';
  // Decode the uncapped token through the canonical map. This preserves the
  // effective nested knob without asserting anything about the painted cap.
  const radiusKnob = Object.entries(borderRadiusMap).find(
    ([, token]) => token === knobProps.borderRadius.borderRadius,
  )?.[0];
  const constraintAttrs =
    tier !== 'feature' && radiusKnob !== undefined && radiusKnob !== ''
      ? {
          'data-constraint-container': 'Card',
          'data-radius-knob': radiusKnob,
          'data-space-knob': knobProps.space,
        }
      : undefined;
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
        ...constraintAttrs,
      })}
      {...props}>
      <NestedScale density={knobProps.density}>{children}</NestedScale>
    </TamaguiCard>
  );
};

// Header and Footer are NOT defined here. They live in ./CardHeader and
// ./CardFooter, where a bare title/caption string is wrapped so T-HEADING /
// T-BODY ride the TEXT node instead of the View, and
// data-heading-font / data-body-font reach the DOM so the font knobs are
// observable. Card.tsx once carried stub copies that spread knobProps.heading
// onto the host and passed children through untouched; they were an older
// copy reintroduced by a later change and they silently un-did the fix.
// Re-exported here so ./index.ts and ./surfaces.tsx keep importing
// every Card part from one module.
export { CardFooter } from './CardFooter';
export { CardHeader } from './CardHeader';

// oxlint-disable-next-line react-doctor/only-export-components -- Card is a compound component built with withStaticProperties, which the rule does not recognize as a component
export const Card = withStaticProperties(CardRoot, {
  Header: CardHeader,
  Footer: CardFooter,
});
