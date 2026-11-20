import type { Variable } from 'tamagui';
import { getTokens, getVariableValue } from 'tamagui';

type TokenScale = 'size' | 'radius' | 'space' | 'fontSize';
type TokenBuckets = Partial<Record<TokenScale, Partial<Record<string, Variable>>>>;

/**
 * Resolve a Tamagui size/radius/space/fontSize token to CSS pixels so
 * markdown chrome (cutoff, marker column, media fallback) scales with knobs
 * instead of hardcoded geometry.
 */
export const tokenPx = (token: string | number | undefined, fallback: number, scale: TokenScale = 'size'): number => {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- discriminates the declared string | number token union
  if (typeof token === 'number' && Number.isFinite(token)) {
    return token;
  }
  if (token == null) {
    return fallback;
  }
  try {
    const tokens: TokenBuckets = getTokens();
    const raw: unknown = getVariableValue(tokens[scale]?.[String(token)] ?? token);
    // oxlint-disable-next-line unicorn/prefer-number-coercion -- parseFloat keeps the number in unit strings like "12px"; Number() would give NaN
    const n = Number.parseFloat(String(raw));
    return Number.isFinite(n) && n > 0 ? n : fallback;
  } catch {
    // Safe to continue: an unresolvable token falls back to the caller's default geometry
    return fallback;
  }
};
