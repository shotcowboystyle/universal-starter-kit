import type { StackStyleBase, TamaDefer, TamaguiComponentPropsBaseBase } from '@tamagui/core';
import { SvgUri as RNSvgUri, type UriProps } from 'react-native-svg';
import { styled, type TamaguiComponent } from 'tamagui';

export const SvgUri: TamaguiComponent<
  TamaDefer,
  unknown,
  TamaguiComponentPropsBaseBase & UriProps,
  StackStyleBase,
  {}
> = styled(RNSvgUri, { name: 'SvgUri', uri: null, color: '$color' });

export type SvgUriProps = React.ComponentProps<typeof SvgUri>;
