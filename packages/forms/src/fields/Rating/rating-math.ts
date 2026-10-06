/**
 * Map a 0–1 rating fraction onto a discrete filled-star count.
 * Overflow, negatives, and non-finite values clamp; a non-positive
 * `maxStars` is zero stars (no crash).
 */
export function filledCount(value: number, maxStars: number): number {
  if (!(maxStars > 0)) {
    return 0;
  }
  if (!Number.isFinite(value)) {
    return value > 0 ? maxStars : 0;
  }
  const n = Math.round(value * maxStars);
  if (!Number.isFinite(n)) {
    return 0;
  }
  return Math.max(0, Math.min(maxStars, n));
}
