import { Svg as RNSvg } from 'react-native-svg';
import { styled } from 'tamagui';

export const Svg = styled(RNSvg, { name: 'Svg', color: '$color' });

export type SvgProps = React.ComponentProps<typeof Svg>;
