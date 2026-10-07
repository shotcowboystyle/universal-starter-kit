import { Svg as TSvg } from '@tamagui/react-native-svg';
import type { ComponentType } from 'react';
import { styled } from 'tamagui';

export const Svg = styled(TSvg, { name: 'Svg', color: '$color' });

export type SvgProps = ComponentType<typeof Svg>;
