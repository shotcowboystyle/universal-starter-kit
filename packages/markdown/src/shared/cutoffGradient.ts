import { useTheme } from 'tamagui';

/**
 * Convert a concrete CSS color into its fully transparent variant so a
 * LinearGradient can fade from transparent into the color.
 */
export function toTransparent(color: string): string {
  const fnMatch = /^(rgb|hsl)a?\(([^)]+)\)$/i.exec(color);
  if (fnMatch) {
    const parts = fnMatch[2].split(',').map((part) => part.trim());
    const [a, b, c] = parts;
    return `${fnMatch[1].toLowerCase()}a(${a}, ${b}, ${c}, 0)`;
  }
  const hexMatch = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color);
  if (hexMatch) {
    let hex = hexMatch[1];
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
}

/**
 * Concrete [transparent, background] colors for cutoff fade gradients.
 * LinearGradient cannot interpolate theme tokens or CSS variables, so the
 * values must be resolved here (SB-M-1203).
 */
export function useCutoffGradientColors(): [string, string] {
  const theme = useTheme();
  const background = theme.background?.val ?? '#ffffff';
  return [toTransparent(background), background];
}
