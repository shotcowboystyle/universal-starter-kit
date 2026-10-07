import type { useTheme } from 'tamagui';

import type { ElevationWrapperProps } from '../shared/utils';

export const isString = (value: unknown): value is string => typeof value === 'string';

/** True for anything `typeof` calls an object, including arrays and null (spreading either is harmless). */
export const isObjectLike = (value: unknown): value is object => typeof value === 'object';

export const isNumber = (value: unknown): value is number => typeof value === 'number';

/** True when the field's elevation recipe resolved to a real elevation (not unset or zero). */
export const hasElevationProp = ({ elevation }: Pick<ElevationWrapperProps, 'elevation'>): boolean =>
  elevation !== undefined && elevation !== 0;

const hasStringVal = (entry: unknown): entry is { val: string } =>
  entry instanceof Object && 'val' in entry && isString(entry.val);

/**
 * Resolved value of a theme token looked up by a dynamic name, or undefined when
 * the theme has no such token. The theme is a proxy keyed by generated token
 * names, which a string cannot index without erasing the type.
 */
export const themeTokenValue = (theme: ReturnType<typeof useTheme>, name: string): string | undefined => {
  // SAFETY: callers pass generated theme token names (e.g. "outlineColor", "accent9"); a token the theme lacks reads as undefined below.
  const entry = theme[name as keyof typeof theme];
  return hasStringVal(entry) ? entry.val : undefined;
};
