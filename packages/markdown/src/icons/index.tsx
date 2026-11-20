import { Circle, Path, Rect, Svg } from '@tamagui/react-native-svg';
import { useTheme } from 'tamagui';

interface IconProps {
  size?: number;
  color?: string;
}

/**
 * Resolve theme tokens like "$color10" to concrete values — raw SVG stroke
 * attributes cannot consume unresolved token strings (SB-M-1206).
 */
const useIconColor = (color?: string): string => {
  const theme: Record<string, { val?: string } | undefined> = useTheme();
  if (color?.startsWith('$') === true) {
    return theme[color.slice(1)]?.val ?? theme.color?.val ?? 'currentColor';
  }
  return color ?? theme.color?.val ?? 'currentColor';
};

export const ClipboardIcon = ({ size = 16, color }: IconProps) => {
  const fill = useIconColor(color);
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none">
      <Rect
        x="9"
        y="2"
        width="6"
        height="4"
        rx="1"
        stroke={fill}
        strokeWidth={2}
      />
      <Path
        d="M9 4H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"
        stroke={fill}
        strokeWidth={2}
      />
    </Svg>
  );
};

export const CheckIcon = ({ size = 16, color, strokeWidth = 2.5 }: IconProps & { strokeWidth?: number }) => {
  const stroke = useIconColor(color);
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none">
      <Path
        d="M4.5 12.75l5.25 5.25L19.5 7.5"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
};

export const CheckCircleIcon = ({ size = 16, color }: IconProps) => {
  const fill = useIconColor(color);
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none">
      <Circle
        cx="12"
        cy="12"
        r="10"
        stroke={fill}
        strokeWidth={2}
      />
      <Path
        d="M9 12l2 2 4-4"
        stroke={fill}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
};

export const LinkIcon = ({ size = 12, color }: IconProps) => {
  const fill = useIconColor(color);
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none">
      <Path
        d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"
        stroke={fill}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
        stroke={fill}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
};

// AlertTriangleIcon / InfoIcon / ChevronRightIcon were removed in the
// duplication census: they duplicated the catalog's intent icons and were
// orphaned when markdown's Notice was replaced by the catalog Alert.
