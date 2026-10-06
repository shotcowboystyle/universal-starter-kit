import { useResolvedKnobs } from '@repo/theme';
import type { ReactNode } from 'react';
import { Card as TamaguiCard, SizableText } from 'tamagui';
import type { ViewProps } from 'tamagui';

import { hostData } from './host-data';
import { wrapBareTextChildren } from './shared/text-rides-text';

/**
 * Card.Footer action/caption row.
 *
 * Nested hue is opt-in on the Card frame — this part does not wrap Tint.
 * NestedScale stays on Card. This host is a zero-padding slot;
 * children own their row layout and wrap within the card width.
 * T-BODY rides caption TEXT nodes, never the View.
 */

export type CardFooterProps = Omit<ViewProps, 'children'> & { children?: ReactNode };

export const CardFooter = ({ children, ...props }: CardFooterProps) => {
  const { knobProps } = useResolvedKnobs({ component: 'Card' });
  return (
    <TamaguiCard.Footer
      padding={0}
      flexDirection="column"
      {...knobProps.gap}
      {...hostData({ 'data-slot': 'footer' })}
      {...props}>
      {wrapBareTextChildren(children, (label, key) => (
        <SizableText
          key={key}
          {...knobProps.body}
          {...hostData({ 'data-body-font': knobProps.body.fontFamily })}>
          {label}
        </SizableText>
      ))}
    </TamaguiCard.Footer>
  );
};
