import { Path } from '@tamagui/react-native-svg';

import { Svg } from './index';

export default {
  title: 'Components/Svg',
  component: Svg,
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          'SVG primitive. Owns no chrome (SF-TRANSPARENT). Default color is `$color`; marks use currentColor — never hardcoded hex.',
      },
    },
  },
};

export const main = {
  name: 'Main',
  render: () => (
    <Svg width={304} height={290} color="$color">
      <Path
        d="M2,111 h300 l-242.7,176.3 92.7,-285.3 92.7,285.3 z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth={15}
        strokeLinejoin="round"
      />
    </Svg>
  ),
};
