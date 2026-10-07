import { Paragraph, styled } from 'tamagui';

export const LI = styled(Paragraph, {
  name: 'LI',
  display: 'list-item' as any,
  render: 'li',
  size: '$5',
  paddingBottom: '$1',
  style: {
    listStyleType: 'disc',
  },
});

export type LIProps = React.ComponentProps<typeof LI>;
