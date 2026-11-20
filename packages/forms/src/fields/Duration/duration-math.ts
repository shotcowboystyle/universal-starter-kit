import { sizeRecipeForToken } from '@repo/theme';

export interface DurationParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

const UNIT_SECONDS = { d: 86_400, h: 3600, m: 60, s: 1 } as const;
const SECONDS_BY_UNIT = new Map<string, number>(Object.entries(UNIT_SECONDS));
const CLOCK_PATTERN = /^(?<h>\d+):(?<m>\d{1,2})(?::(?<s>\d{1,2}))?$/u;
const UNIT_PATTERN = /(?<!\d)(?<amount>\d+)\s*(?<unit>[dhms])\b/gu;

export const normalizeSeconds = (value: number): number => {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Math.floor(value);
};

export const secondsToParts = (total: number, hideDays: boolean): DurationParts => {
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
    days: Math.floor(s / 86_400),
    hours: Math.floor((s % 86_400) / 3600),
    minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60,
  };
};

export const partsToSeconds = (parts: DurationParts, hideDays: boolean): number => {
  const days = hideDays ? 0 : Math.max(0, Math.floor(parts.days) || 0);
  const hours = Math.max(0, Math.floor(parts.hours) || 0);
  const minutes = Math.max(0, Math.floor(parts.minutes) || 0);
  const seconds = Math.max(0, Math.floor(parts.seconds) || 0);
  return days * 86_400 + hours * 3600 + minutes * 60 + seconds;
};

/** Unit-suffixed "1d 2h 3m 4s", clock "1:30" / "1:30:00", or raw seconds. */
export const parseDurationText = (text: string): number | null => {
  const trimmed = text.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }
  if (/^-?\d+$/u.test(trimmed)) {
    return normalizeSeconds(Number(trimmed));
  }
  const clock = CLOCK_PATTERN.exec(trimmed)?.groups;
  if (clock) {
    return partsToSeconds(
      {
        days: 0,
        hours: Number(clock.h),
        minutes: Number(clock.m),
        seconds: Number(clock.s ?? 0),
      },
      true,
    );
  }
  const pieces = [...trimmed.matchAll(UNIT_PATTERN)];
  if (pieces.length === 0) {
    return null;
  }
  let total = 0;
  for (const piece of pieces) {
    const { amount, unit } = piece.groups ?? {};
    total += Number(amount) * (SECONDS_BY_UNIT.get(unit ?? '') ?? 0);
  }
  return total;
};

/**
 * Segment box width from the size recipe.
 * Narrow units (min/sec) use 2 digits; wide units (hours/days) use 3.
 */
export const durationSegmentWidth = (sizeToken: string, digits: number): number => {
  const recipe = sizeRecipeForToken(sizeToken);
  return recipe.paddingHorizontal + recipe.fontSize * digits;
};
