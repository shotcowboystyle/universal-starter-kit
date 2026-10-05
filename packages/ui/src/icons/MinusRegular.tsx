import { Line, Rect, Svg } from '@tamagui/react-native-svg';
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
      <Line
        x1="40"
        y1="128"
        x2="216"
        y2="128"
        fill="none"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="16"
      />
    </Svg>
  );
}
Icon.displayName = 'MinusRegular';
const MinusRegular = memo(themed(Icon));
export { MinusRegular };
