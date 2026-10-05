/**
 * Derive up to two initials from a display name or email local-part.
 * "Ada Lovelace" → "AL", "john.doe@x" → "JD", "Ada" → "AD".
 */
export function getInitials(name: string): string {
  const trimmed = (name ?? '').trim();
  if (!trimmed) {
    return '?';
  }
  const parts = trimmed.split(/[\s@._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    const a = parts[0][0] ?? '';
    const b = parts[1][0] ?? '';
    return (a + b).toUpperCase();
  }
  return trimmed.substring(0, 2).toUpperCase();
}

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

export function fallbackToneIndex(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (Math.imul(hash, 31) + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % FALLBACK_TONES.length;
}

export function fallbackTone(seed: string | undefined): FallbackTone | undefined {
  const trimmed = (seed ?? '').trim();
  if (!trimmed) {
    return undefined;
  }
  return FALLBACK_TONES[fallbackToneIndex(trimmed)];
}
