import { useTheme } from 'tamagui';

const COLOR_FUNCTION_REGEX = /^(?<fn>rgb|hsl)a?\((?<args>[^)]+)\)$/iu;
const HEX_COLOR_REGEX = /^#(?<hex>[0-9a-f]{3}|[0-9a-f]{6})$/iu;
const FALLBACK_BACKGROUND = '#ffffff';

/**
 * Convert a concrete CSS color into its fully transparent variant so a
 * LinearGradient can fade from transparent into the color.
 */
export const toTransparent = (color: string): string => {
  const fnGroups = COLOR_FUNCTION_REGEX.exec(color)?.groups;
  if (fnGroups) {
    const [a, b, c] = fnGroups.args.split(',').map((part) => part.trim());
    return `${fnGroups.fn.toLowerCase()}a(${a}, ${b}, ${c}, 0)`;
  }
  const hexGroups = HEX_COLOR_REGEX.exec(color)?.groups;
  if (hexGroups) {
    let { hex } = hexGroups;
    if (hex.length === 3) {
      hex = hex
        .split('')
        .map((char) => char + char)
        .join('');
    }
    const r = Number.parseInt(hex.slice(0, 2), 16);
    const g = Number.parseInt(hex.slice(2, 4), 16);
    const b = Number.parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, 0)`;
  }
  return 'transparent';
};

/**
 * Concrete [transparent, background] colors for cutoff fade gradients.
 * LinearGradient cannot interpolate theme tokens or CSS variables, so the
 * values must be resolved here (SB-M-1203).
 */
export const useCutoffGradientColors = (): [string, string] => {
  const theme = useTheme();
  const background = String(theme.background?.val ?? FALLBACK_BACKGROUND);
  return [toTransparent(background), background];
};
