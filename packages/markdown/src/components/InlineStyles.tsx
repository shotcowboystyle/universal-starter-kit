import { useResolvedKnobs } from '@repo/theme';
import { Text } from 'tamagui';

import type { InlineProps } from '../types';

export function Strong({ children }: InlineProps) {
  const { knobProps } = useResolvedKnobs();
  return (
    <Text
      render="strong"
      {...knobProps.body}
      fontWeight="700">
      {children}
    </Text>
  );
}

export function Emphasis({ children }: InlineProps) {
  const { knobProps } = useResolvedKnobs();
  return (
    <Text
      render="em"
      {...knobProps.body}
      fontStyle="italic">
      {children}
    </Text>
  );
}

export function Strikethrough({ children }: InlineProps) {
  const { knobProps } = useResolvedKnobs();
  return (
    <Text
      render="del"
      {...knobProps.body}
      textDecorationLine="line-through">
      {children}
    </Text>
  );
}
