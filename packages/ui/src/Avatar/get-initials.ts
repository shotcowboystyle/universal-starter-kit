/**
 * Derive up to two initials from a display name or email local-part.
 * "Ada Lovelace" → "AL", "john.doe@x" → "JD", "Ada" → "AD".
 */
export const getInitials = (name: string): string => {
  const trimmed = (name ?? '').trim();
  if (!trimmed) {
    return '?';
  }
  const parts = trimmed.split(/[\s@._-]+/u).filter(Boolean);
  if (parts.length >= 2) {
    const a = parts[0][0] ?? '';
    const b = parts[1][0] ?? '';
    return (a + b).toUpperCase();
  }
  return trimmed.slice(0, 2).toUpperCase();
};

/**
 * Polaris-style deterministic initials fill. Tokens only — the same seed
 * always lands on the same ramp pair so two "AB" avatars match.
 */
export const FALLBACK_TONES = [
  { bg: '$blue4', fg: '$blue12' },
  { bg: '$green4', fg: '$green12' },
  { bg: '$orange4', fg: '$orange12' },
  { bg: '$purple4', fg: '$purple12' },
  { bg: '$yellow4', fg: '$yellow12' },
  { bg: '$red4', fg: '$red12' },
] as const;

export type FallbackTone = (typeof FALLBACK_TONES)[number];

export const fallbackToneIndex = (seed: string): number => {
  let hash = 0;
  // split('') walks UTF-16 code units; codePointAt(0) of a one-unit string is that unit (same value charCodeAt gave).
  for (const unit of seed.split('')) {
    // Math.imul(x, 1) is ToInt32(x), i.e. the int32 wrap the original `| 0` performed.
    hash = Math.imul(Math.imul(hash, 31) + (unit.codePointAt(0) ?? 0), 1);
  }
  return Math.abs(hash) % FALLBACK_TONES.length;
};

export const fallbackTone = (seed: string | undefined): FallbackTone | undefined => {
  const trimmed = (seed ?? '').trim();
  if (!trimmed) {
    return undefined;
  }
  return FALLBACK_TONES[fallbackToneIndex(trimmed)];
};
