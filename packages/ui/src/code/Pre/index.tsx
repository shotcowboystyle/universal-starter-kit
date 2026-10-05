import { useResolvedKnobs } from '@repo/theme';
import { YStack, styled } from 'tamagui';

const PreFrame = styled(YStack, {
  name: 'Pre',
  overflow: 'visible',
  render: 'pre',
  flex: 1,
  flexBasis: 'auto',
  padding: '$4',
  borderRadius: '$4',
  backgroundColor: '$background',
});

export const Pre = PreFrame.styleable((props, ref) => {
  const { knobProps } = useResolvedKnobs();
  return <PreFrame ref={ref} {...knobProps.borderRadius} {...knobProps.panelPadding} {...props} />;
});
