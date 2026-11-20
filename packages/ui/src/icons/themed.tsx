import { useTouchSurface, sizeRecipeForToken } from '@repo/theme';
import type { ComponentType } from 'react';
import { getVariable, useProps, useTheme } from 'tamagui';

interface ThemedIconProps {
  color?: string;
  disableTheme?: boolean;
  size?: number | string;
}

/**
 * Theme-aware icon wrapper. Color resolves theme key → caller color →
 * scheme-aware `theme.color`. Never black / `#000` (CheckRegular /
 * MinusRegular contract: SVG defaults MUST NOT fall back to black).
 */
export function themed<A extends ComponentType<never>>(Component: A): A;
export function themed(Component: ComponentType<ThemedIconProps>): ComponentType<ThemedIconProps> {
  const Themed = (props: ThemedIconProps) => {
    const touch = useTouchSurface();
    const { color, disableTheme, size } = useProps(props);
    const theme = useTheme();
    // SAFETY: the `in` check guarantees `color` is a key of the theme proxy.
    const fromTheme = color != null && color in theme ? theme[color as keyof typeof theme] : undefined;
    const callerColor = color === '' ? undefined : color;
    const resolved = fromTheme ?? callerColor ?? (disableTheme ? undefined : theme.color);
    // oxlint-disable-next-line typescript/no-unsafe-assignment -- tamagui declares getVariable's return as `any`
    const colorValue: string = resolved == null ? 'currentColor' : getVariable(resolved);
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- size is a token string or a numeric px at runtime; only tokens go through the recipe
    const iconSize = typeof size === 'string' ? sizeRecipeForToken(size, { touch }).iconSize : size;
    return (
      <Component
        {...props}
        color={colorValue}
        size={iconSize}
      />
    );
  };
  return Themed;
}
