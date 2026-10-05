import { sizeRecipeForToken } from '@repo/theme';

export interface DurationParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

const UNIT_SECONDS = { d: 86400, h: 3600, m: 60, s: 1 } as const;

export function normalizeSeconds(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) {
    return 0;
  }
  return Math.floor(n);
}

export function secondsToParts(total: number, hideDays: boolean): DurationParts {
  const s = normalizeSeconds(total);
  if (hideDays) {
    return {
      days: 0,
      hours: Math.floor(s / 3600),
      minutes: Math.floor((s % 3600) / 60),
      seconds: s % 60,
    };
  }
  return {
    days: Math.floor(s / 86400),
    hours: Math.floor((s % 86400) / 3600),
    minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60,
  };
}

export function partsToSeconds(parts: DurationParts, hideDays: boolean): number {
  const days = hideDays ? 0 : Math.max(0, Math.floor(Number(parts.days)) || 0);
  const hours = Math.max(0, Math.floor(Number(parts.hours)) || 0);
  const minutes = Math.max(0, Math.floor(Number(parts.minutes)) || 0);
  const seconds = Math.max(0, Math.floor(Number(parts.seconds)) || 0);
  return days * 86400 + hours * 3600 + minutes * 60 + seconds;
}

/** Frappe-style "1d 2h 3m 4s", clock "1:30" / "1:30:00", or raw seconds. */
export function parseDurationText(text: string): number | null {
  const trimmed = text.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }
  if (/^-?\d+$/.test(trimmed)) {
    return normalizeSeconds(Number(trimmed));
  }
  const clock = trimmed.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/);
  if (clock) {
    return partsToSeconds(
      {
        days: 0,
        hours: Number(clock[1]),
        minutes: Number(clock[2]),
        seconds: Number(clock[3] || 0),
      },
      true,
    );
  }
  const pieces = [...trimmed.matchAll(/(\d+)\s*(d|h|m|s)\b/g)];
  if (pieces.length === 0) {
    return null;
  }
  let total = 0;
  for (const piece of pieces) {
    const unit = piece[2] as keyof typeof UNIT_SECONDS;
    total += Number(piece[1]) * UNIT_SECONDS[unit];
  }
  return total;
}

/**
 * Segment box width from the size recipe.
 * Narrow units (min/sec) use 2 digits; wide units (hours/days) use 3.
 */
export function durationSegmentWidth(sizeToken: string, digits: number): number {
  const recipe = sizeRecipeForToken(sizeToken);
  return recipe.paddingHorizontal + recipe.fontSize * digits;
}
