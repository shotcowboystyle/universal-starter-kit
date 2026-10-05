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
export function resolveGlyphPaint(theme: Record<string, ThemeToken | undefined>, color?: string | null): string {
  const seen = new Set<string>();
  const push = (value: unknown) => {
    if (typeof value === 'string' && value.length > 0 && value !== 'undefined') {
      seen.add(value);
    }
  };

  if (typeof color === 'string' && color.length > 0) {
    const key = color.startsWith('$') ? color.slice(1) : color;
    push(theme[key]?.val);
    if (color.startsWith('#') || color.startsWith('rgb') || color.startsWith('hsl')) {
      push(color);
    } else if (!theme[key] && !color.startsWith('$')) {
      // Literal CSS colors may pass through; an unresolved theme token cannot paint.
      push(color);
    }
  }

  push(theme.color?.val);
  push(theme.color12?.val);
  push(theme.color11?.val);

  for (const value of seen) {
    return value;
  }
  return 'currentColor';
}

/** Live theme ink for Phosphor / SVG carets. Never undefined. */
export function useGlyphColor(color?: string): string {
  const theme = useTheme() as unknown as Record<string, ThemeToken | undefined>;
  return resolveGlyphPaint(theme, color);
}
