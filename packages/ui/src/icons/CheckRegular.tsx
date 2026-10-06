import { Polyline, Rect, Svg } from '@tamagui/react-native-svg';
import { memo } from 'react';
import type { ComponentProps } from 'react';

import { themed } from './themed';

const Icon = ({
  color = 'currentColor',
  size = 24,
  ...otherProps
}: Omit<ComponentProps<typeof Svg>, 'color'> & {
  color?: string;
  size?: number | string;
}) => (
  <Svg
    viewBox="0 0 256 256"
    {...otherProps}
    height={size}
    width={size}>
    <Rect
      width="256"
      height="256"
      fill="none"
    />
    <Polyline
      points="216 72 104 184 48 128"
      fill="none"
      stroke={color}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="16"
    />
  </Svg>
);
Icon.displayName = 'CheckRegular';
const CheckRegular = memo(themed(Icon));
CheckRegular.displayName = 'CheckRegular';
export { CheckRegular };
