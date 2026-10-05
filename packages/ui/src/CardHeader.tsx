import { useResolvedKnobs } from '@repo/theme';
import type { ReactNode } from 'react';
import { Card as TamaguiCard, SizableText, type ViewProps } from 'tamagui';

import { wrapBareTextChildren } from './shared/textRidesText';

/**
 * Card.Header title row.
 *
 * Nested hue is opt-in on the Card frame — this part does not wrap Tint.
 * NestedScale stays on Card. This host is a zero-padding slot;
 * T-HEADING rides the title TEXT node, never the View.
 */

export type CardHeaderProps = ViewProps & { children?: ReactNode };

/**
 * Tamagui styled hosts drop JSX `data-*` on native (Toast gallery hole), so
 * native needs the RN `dataSet` map. On web, spreading `dataSet` onto a DOM
 * host is a React invalid-prop warning (`dataSet` → `dataset`). jsdom and
 * Storybook keep kebab `data-*`, so web writes those only.
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

export function CardHeader({ children, ...props }: CardHeaderProps) {
  const { knobProps } = useResolvedKnobs({ component: 'Card' });
  return (
    <TamaguiCard.Header padding={0} {...knobProps.gap} {...hostData({ 'data-slot': 'header' })} {...props}>
      {wrapBareTextChildren(children, (label, key) => (
        <SizableText
          key={key}
          flexShrink={1}
          {...knobProps.heading}
          {...hostData({ 'data-heading-font': String(knobProps.heading.fontFamily) })}>
          {label}
        </SizableText>
      ))}
    </TamaguiCard.Header>
  );
}
