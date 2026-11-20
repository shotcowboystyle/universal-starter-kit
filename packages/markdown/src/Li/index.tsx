import { Paragraph, styled } from 'tamagui';

export const LI = styled(Paragraph, {
  name: 'LI',
  // SAFETY: web-only CSS display value; React Native's display type omits 'list-item'.
  // oxlint-disable-next-line typescript/no-explicit-any, typescript/no-unsafe-assignment, typescript/no-unsafe-type-assertion -- see SAFETY above
  display: 'list-item' as any,
  render: 'li',
  size: '$5',
  paddingBottom: '$1',
  style: {
    listStyleType: 'disc',
  },
});

export type LIProps = React.ComponentProps<typeof LI>;
