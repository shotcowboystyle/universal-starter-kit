import { useResolvedKnobs } from '@repo/theme';
import type { ReactNode } from 'react';
import { Card as TamaguiCard, SizableText } from 'tamagui';
import type { ViewProps } from 'tamagui';

import { hostData } from './host-data';
import { wrapBareTextChildren } from './shared/text-rides-text';

/**
 * Card.Header title row.
 *
 * Nested hue is opt-in on the Card frame — this part does not wrap Tint.
 * NestedScale stays on Card. This host is a zero-padding slot;
 * T-HEADING rides the title TEXT node, never the View.
 */

export type CardHeaderProps = Omit<ViewProps, 'children'> & { children?: ReactNode };

export const CardHeader = ({ children, ...props }: CardHeaderProps) => {
  const { knobProps } = useResolvedKnobs({ component: 'Card' });
  return (
    <TamaguiCard.Header
      padding={0}
      {...knobProps.gap}
      {...hostData({ 'data-slot': 'header' })}
      {...props}>
      {wrapBareTextChildren(children, (label, key) => (
        <SizableText
          key={key}
          flexShrink={1}
          {...knobProps.heading}
          {...hostData({ 'data-heading-font': knobProps.heading.fontFamily })}>
          {label}
        </SizableText>
      ))}
    </TamaguiCard.Header>
  );
};
