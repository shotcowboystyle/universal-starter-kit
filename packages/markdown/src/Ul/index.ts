import { YStack, styled } from 'tamagui';

export const UL = styled(YStack, {
  name: 'UL',
  render: 'ul',
  marginVertical: '$1',
  marginInlineStart: '$4',
  marginInlineEnd: '$2',
});

export type ULProps = React.ComponentProps<typeof UL>;
