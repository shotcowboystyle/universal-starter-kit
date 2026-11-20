import type { StackStyleBase, TamaDefer, TamaguiComponentPropsBaseBase } from '@tamagui/core';
import { SvgUri as RNSvgUri } from 'react-native-svg';
import type { UriProps } from 'react-native-svg';
import { styled } from 'tamagui';
import type { TamaguiComponent } from 'tamagui';

export const SvgUri: TamaguiComponent<TamaDefer, unknown, TamaguiComponentPropsBaseBase & UriProps, StackStyleBase> =
  styled(RNSvgUri, { name: 'SvgUri', uri: null, color: '$color' });

export type SvgUriProps = React.ComponentProps<typeof SvgUri>;
