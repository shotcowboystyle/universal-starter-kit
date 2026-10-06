import { useTouchSurface, sizeRecipeForToken } from '@repo/theme';
import type { FC } from 'react';
import { getVariable, useProps, useTheme } from 'tamagui';

/**
 * Theme-aware icon wrapper. Colour resolves theme key → caller colour →
 * scheme-aware `theme.color`. Never black / `#000` (CheckRegular /
 * MinusRegular contract: SVG defaults MUST NOT fall back to black).
 */
export function themed<A extends FC>(Component: A) {
  return ((props: any) => {
    const touch = useTouchSurface();
    const { color, disableTheme, size } = useProps(props);
    const theme = useTheme();
    const fromTheme = typeof color === 'string' && color in theme ? theme[color as keyof typeof theme] : undefined;
    const resolved = fromTheme || color || (disableTheme ? undefined : theme.color);
    const colorValue = resolved == null ? 'currentColor' : getVariable(resolved);
    return (
      <Component
        {...props}
        color={colorValue}
        size={typeof size === 'string' ? sizeRecipeForToken(size, { touch }).iconSize : size}
      />
    );
  }) as A;
}
