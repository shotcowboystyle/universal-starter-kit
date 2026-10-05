import { Circle, Svg } from 'react-native-svg';
import { getVariable, useTheme } from 'tamagui';

const VB = 24;
const CX = VB / 2;
const R = 9;
const STROKE = 2.5;
const CIRCUMFERENCE = 2 * Math.PI * R;
const ARC = CIRCUMFERENCE * 0.75;

export function useSpinnerStroke(color?: string): string {
  const theme = useTheme();
  if (color && !color.startsWith('$')) {
    return color;
  }
  const key = (color ?? '$color').replace(/^\$/, '');
  const token = theme[key as keyof typeof theme];
  if (!token) {
    return color ?? 'currentColor';
  }
  return String(getVariable((token as { get?: (p: string) => unknown }).get?.('web') ?? token));
}

/** Linear/Polaris arc: round-cap 270° head on a faint track. Scales with the box. */
export function SpinnerGlyph({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${VB} ${VB}`} pointerEvents="none">
      <Circle cx={CX} cy={CX} r={R} fill="none" stroke={color} strokeWidth={STROKE} opacity={0.2} />
      <Circle
        cx={CX}
        cy={CX}
        r={R}
        fill="none"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeDasharray={`${ARC} ${CIRCUMFERENCE - ARC}`}
        transform={`rotate(-90 ${CX} ${CX})`}
      />
    </Svg>
  );
}
