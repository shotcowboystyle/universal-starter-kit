import { Polyline, Rect, Svg } from '@tamagui/react-native-svg';
import { memo } from 'react';

import { themed } from './themed';

function Icon({
  color = 'currentColor',
  size = 24,
  ...otherProps
}: {
  color?: string;
  size?: number | string;
  [key: string]: unknown;
}) {
  return (
    <Svg viewBox="0 0 256 256" {...otherProps} height={size} width={size}>
      <Rect width="256" height="256" fill="none" />
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
}
Icon.displayName = 'CheckRegular';
const CheckRegular = memo(themed(Icon));
export { CheckRegular };
