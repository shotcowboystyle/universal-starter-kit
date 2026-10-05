/**
 * Cookie utilities for the semantic component theming system.
 *
 * Uses two cookie families:
 *   - `mp.preset` — preset name string
 *   - `mp.ov.0`, `mp.ov.1`, … — JSON of only changed knobs (partial Knobs),
 *     chunked to stay under 4 KB per cookie
 *
 * Old cookie formats (`mp.overrides`, `mp.overrides0`, …) are NOT migrated —
 * stale cookies are silently ignored/overwritten.
 */

import { getCookie, setCookie, deleteCookie } from '@repo/platform';

import type { Knobs } from './knobs';

// ---------------------------------------------------------------------------
// Cookie key constants
// ---------------------------------------------------------------------------

/** Cookie key for the active preset name. */
export const cookiePreset = 'mp.preset';

/** Cookie key prefix for knob overrides (chunked). */
export const cookieOverridesPrefix = 'mp.ov';

/** Maximum size (in characters) before splitting a cookie value. ~3.5 KB */
const cookieSplitThreshold = 3500;

/** Upper bound on the number of split chunks we scan for. */
const maxChunks = 10;

// ---------------------------------------------------------------------------
// Cookie splitting / reconstruction
// ---------------------------------------------------------------------------

/**
 * Split a cookie value string into chunks if it exceeds the threshold.
 * Returns an array of chunks — if the value is small enough, the array
 * contains a single element.
 */
export function splitCookieValue(value: string): string[] {
  if (value.length <= cookieSplitThreshold) {
    return [value];
  }
  const chunks: string[] = [];
  for (let i = 0; i < value.length; i += cookieSplitThreshold) {
    chunks.push(value.slice(i, i + cookieSplitThreshold));
  }
  return chunks;
}

/**
 * Reconstruct a cookie value from its split chunks.
 */
export function joinSplitCookieValues(chunks: string[]): string {
  return chunks.join('');
}

// ---------------------------------------------------------------------------
// Internal: chunk key helpers
// ---------------------------------------------------------------------------

/** Build the cookie key for a given chunk index: `mp.ov.0`, `mp.ov.1`, … */
function chunkKey(index: number): string {
  return `${cookieOverridesPrefix}.${index}`;
}

// ---------------------------------------------------------------------------
// Cookie read helpers (work with raw cookie objects from react-cookie)
// ---------------------------------------------------------------------------

/**
 * Shape-validate a parsed overrides payload before it reaches knob
 * resolution: keep knob-shaped entries — string values plus one-level
 * StateKnobs-style objects of string values (`hover`, `press`, …) — and drop
 * everything else, so a corrupt or foreign cookie can never spread garbage
 * (arrays, numbers, deep objects) into `{ ...preset.knobs, ...overrides }`.
 */
function sanitizeOverrides(parsed: unknown): Partial<Knobs> {
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return {};
  }
  const overrides: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === 'string') {
      overrides[key] = value;
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const nested: Record<string, string> = {};
      for (const [stateKey, stateValue] of Object.entries(value)) {
        if (typeof stateValue === 'string') {
          nested[stateKey] = stateValue;
        }
      }
      overrides[key] = nested;
    }
  }
  return overrides as Partial<Knobs>;
}

/**
 * Read the overrides cookie value, handling chunked cookies.
 *
 * Accepts BOTH value shapes a cookie jar can deliver:
 *   - already-parsed OBJECTS — react-cookie's `useCookies()` jar
 *     (universal-cookie) auto-JSON-parses every cookie value it can (its
 *     `readCookie` tries `JSON.parse` unless `doNotParse` is set), so a
 *     single-chunk overrides cookie arrives here as an object, not a string;
 *   - raw JSON STRINGS — direct `document.cookie` / SSR cookie-header reads
 *     (`loadPresetOverrides`), and multi-chunk payloads on every path (a
 *     fragment of a split JSON document does not parse on its own, so even
 *     universal-cookie leaves those chunks as strings).
 *
 * Anything else (numbers, arrays, mixed chunk types, malformed JSON) reads
 * as no overrides, and every parsed payload is shape-validated before use.
 */
export function readOverridesCookie(cookies: Record<string, unknown>): Partial<Knobs> {
  // Reconstruct from chunked cookies: mp.ov.0, mp.ov.1, …
  const chunks: unknown[] = [];
  for (let i = 0; i < maxChunks; i++) {
    const chunk = cookies[chunkKey(i)];
    if (!chunk) {
      break;
    }
    chunks.push(chunk);
  }
  if (chunks.length === 0) {
    return {};
  }

  // universal-cookie path: the jar already parsed the JSON for us.
  if (chunks.length === 1 && typeof chunks[0] === 'object') {
    return sanitizeOverrides(chunks[0]);
  }

  // Raw string path: join chunks and parse the canonical JSON serialization.
  if (!chunks.every((chunk): chunk is string => typeof chunk === 'string')) {
    return {};
  }
  try {
    return sanitizeOverrides(JSON.parse(joinSplitCookieValues(chunks)));
  } catch {
    return {};
  }
}

/**
 * Read the preset name from the cookie. universal-cookie auto-JSON-parses
 * jar values, so a numeric-looking name would arrive as a number — preset
 * names are strings by contract, anything else reads as no preset.
 */
export function readPresetCookie(cookies: Record<string, unknown>): string | undefined {
  const value = cookies[cookiePreset];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

// ---------------------------------------------------------------------------
// Cookie write helpers
// ---------------------------------------------------------------------------

/**
 * Write the preset name cookie.
 * Returns the cookie key and value for the caller to pass to setCookie.
 */
export function writePresetCookie(presetName: string): { key: string; value: string } {
  return { key: cookiePreset, value: presetName };
}

/**
 * Write overrides cookie, splitting if necessary.
 * Returns an array of { key, value } pairs for the caller to pass to setCookie.
 * Also returns keys to remove (old split cookies that are no longer needed).
 */
export function writeOverridesCookie(overrides: Partial<Knobs>): {
  toSet: Array<{ key: string; value: string }>;
  toRemove: string[];
} {
  const json = JSON.stringify(overrides);
  const chunks = splitCookieValue(json);

  const toSet = chunks.map((chunk, i) => ({
    key: chunkKey(i),
    value: chunk,
  }));

  // Clean up any leftover chunks beyond what we wrote
  const toRemove: string[] = [];
  for (let i = chunks.length; i < chunks.length + maxChunks; i++) {
    toRemove.push(chunkKey(i));
  }

  return { toSet, toRemove };
}

// ---------------------------------------------------------------------------
// Overrides diff
// ---------------------------------------------------------------------------

/**
 * Compute the diff between a base knobs object and the current knobs to
 * produce minimal overrides. Only includes keys where the value differs.
 */
export function computeOverrides(base: Knobs, current: Knobs): Partial<Knobs> {
  const overrides: Partial<Knobs> = {};
  for (const key of Object.keys(base) as Array<keyof Knobs>) {
    if (current[key] !== base[key]) {
      (overrides as Record<string, unknown>)[key] = current[key];
    }
  }
  return overrides;
}

// ---------------------------------------------------------------------------
// Convenience persistence functions
// ---------------------------------------------------------------------------

/**
 * Build the list of cookie keys to watch for react-cookie.
 */
export function getCookieWatchList(): string[] {
  const keys = [cookiePreset];
  for (let i = 0; i < maxChunks; i++) {
    keys.push(chunkKey(i));
  }
  return keys;
}

/**
 * Persist knob overrides to document cookies directly (no react-cookie).
 * Useful outside of React component trees.
 */
export function persistPresetOverrides(overrides: Partial<Knobs>): void {
  const { toSet, toRemove } = writeOverridesCookie(overrides);
  for (const { key, value } of toSet) {
    setCookie(key, value, { days: 365, sameSite: 'Strict' });
  }
  for (const key of toRemove) {
    deleteCookie(key);
  }
}

/**
 * Load knob overrides from document cookies directly (no react-cookie).
 * Useful outside of React component trees and during SSR when given raw
 * cookie headers.
 */
export function loadPresetOverrides(rawCookies?: Record<string, string | undefined>): Partial<Knobs> {
  const cookies = rawCookies ?? parseBrowserCookies();
  return readOverridesCookie(cookies);
}

/**
 * Read the cookies relevant to the theme system into a key/value map.
 */
function parseBrowserCookies(): Record<string, string | undefined> {
  const map: Record<string, string | undefined> = {};
  for (const key of getCookieWatchList()) {
    const value = getCookie(key);
    if (value !== null) {
      map[key] = value;
    }
  }
  return map;
}
