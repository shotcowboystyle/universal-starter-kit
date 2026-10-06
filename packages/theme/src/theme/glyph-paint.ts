import { useTheme } from 'tamagui';

interface ThemeToken {
  val?: unknown;
}

/**
 * Resolve a concrete glyph paint from a Tamagui theme token.
 * Phosphor (and any SVG that defaults to `#000` / `currentColor` without a
 * parent color) MUST receive this, never `theme.x.get("web")` which is
 * undefined off-web and leaves the glyph black in dark mode.
 *
 * Never returns undefined.
 */
const isPaintString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value !== 'undefined';

export const resolveGlyphPaint = (theme: Record<string, ThemeToken | undefined>, color?: string | null): string => {
  // Priority order: the token the caller named, a literal CSS color, then theme ink.
  const candidates: unknown[] = [];

  if (color != null && color.length > 0) {
    const key = color.startsWith('$') ? color.slice(1) : color;
    candidates.push(theme[key]?.val);
    // Literal CSS colors may pass through; an unresolved theme token cannot paint.
    const isLiteralColor = color.startsWith('#') || color.startsWith('rgb') || color.startsWith('hsl');
    if (isLiteralColor || (!theme[key] && !color.startsWith('$'))) {
      candidates.push(color);
    }
  }

  candidates.push(theme.color?.val, theme.color12?.val, theme.color11?.val);
  return candidates.find(isPaintString) ?? 'currentColor';
};

/** Live theme ink for Phosphor / SVG carets. Never undefined. */
export const useGlyphColor = (color?: string): string => {
  const theme: Record<string, ThemeToken | undefined> = useTheme();
  return resolveGlyphPaint(theme, color);
};
