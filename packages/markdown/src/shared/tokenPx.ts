import { getTokens, getVariableValue } from 'tamagui';

/**
 * Resolve a Tamagui size/radius/space/fontSize token to CSS pixels so
 * markdown chrome (cutoff, marker column, media fallback) scales with knobs
 * instead of hardcoded geometry.
 */
export function tokenPx(
  token: string | number | undefined,
  fallback: number,
  scale: 'size' | 'radius' | 'space' | 'fontSize' = 'size',
): number {
  if (typeof token === 'number' && Number.isFinite(token)) {
    return token;
  }
  if (token == null) {
    return fallback;
  }
  try {
    const tokens = getTokens();
    const bucket = scale === 'fontSize' ? (tokens as { fontSize?: Record<string, unknown> }).fontSize : tokens[scale];
    const raw = getVariableValue(bucket?.[String(token)] ?? token);
    const n = typeof raw === 'number' ? raw : Number.parseFloat(String(raw));
    return Number.isFinite(n) && n > 0 ? n : fallback;
  } catch {
    return fallback;
  }
}
