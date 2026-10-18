// Cross-platform helpers for the form activity timeline: frappe datetime
// parsing (bench sends naive "YYYY-MM-DD HH:mm:ss.ffffff" strings that
// JSC/Hermes will not parse natively), a relative-time register, safe
// HTML → plain-text conversion (no DOM APIs and no raw-HTML rendering on
// any platform), plain text → comment HTML for the desk RPCs, and the
// cached session-user lookup shared by every timeline instance.
import type { FrappeApp } from '@repo/frappe';
import { useEffect, useState } from 'react';

import { useFrappeApp } from '../shared/use-frappe-app';

// ── frappe datetime parsing ────────────────────────────────────────────────

const FRAPPE_DATETIME =
  /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})(?:[ T](?<hour>\d{2}):(?<minute>\d{2})(?::(?<second>\d{2}))?(?:\.(?<fraction>\d+))?(?<utc>Z)?)?$/u;

/**
 * Parse a frappe datetime ("2026-08-12 09:35:11.836712", date-only, or ISO)
 * into a Date. Bench datetimes are naive site-local time, so date parts are
 * constructed in local time; a trailing `Z` is honored as UTC. Returns
 * undefined for unparseable input (honest passthrough happens at render).
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- parse boundary for raw frappe datetimes (string, epoch or Date)
export const parseFrappeDate = (value: unknown): Date | undefined => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value;
  }
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- parse boundary: an epoch number
  if (typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- parse boundary: anything else must be a non-blank string
  if (typeof value !== 'string' || !value.trim()) {
    return undefined;
  }
  const match = FRAPPE_DATETIME.exec(value.trim());
  if (match?.groups) {
    const { year, month, day, hour, minute, second, fraction, utc } = match.groups;
    const ms = fraction === undefined ? 0 : Math.round(Number(`0.${fraction}`) * 1000);
    if (utc !== undefined) {
      return new Date(
        Date.UTC(
          Number(year),
          Number(month) - 1,
          Number(day),
          Number(hour ?? 0),
          Number(minute ?? 0),
          Number(second ?? 0),
          ms,
        ),
      );
    }
    return new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour ?? 0),
      Number(minute ?? 0),
      Number(second ?? 0),
      ms,
    );
  }
  const native = new Date(value);
  return Number.isNaN(native.getTime()) ? undefined : native;
};

/** Epoch millis for sorting; unparseable input sorts last (0). */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- forwards a raw frappe datetime to parseFrappeDate
export const frappeDateEpoch = (value: unknown): number => parseFrappeDate(value)?.getTime() ?? 0;

/**
 * Relative timestamp in the house feed register ("just now", "5m ago",
 * "2h ago", "3 days ago", "2mo ago", "1y ago") on top of frappe-safe
 * parsing. Unparseable strings pass through unchanged.
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- forwards a raw frappe datetime to parseFrappeDate
export const formatRelativeTime = (value: unknown, now: number = Date.now()): string => {
  const date = parseFrappeDate(value);
  if (!date) {
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- unparseable strings pass through verbatim; other raw values render empty
    return typeof value === 'string' ? value : '';
  }
  const sec = Math.floor(Math.max(0, now - date.getTime()) / 1000);
  if (sec < 60) {
    return 'just now';
  }
  const min = Math.floor(sec / 60);
  if (min < 60) {
    return `${min}m ago`;
  }
  const hr = Math.floor(min / 60);
  if (hr < 24) {
    return `${hr}h ago`;
  }
  const day = Math.floor(hr / 24);
  if (day < 30) {
    return `${day} day${day === 1 ? '' : 's'} ago`;
  }
  const mo = Math.floor(day / 30);
  if (mo < 12) {
    return `${mo}mo ago`;
  }
  const yr = Math.floor(day / 365);
  return `${Math.max(1, yr)}y ago`;
};

// ── HTML ↔ text ────────────────────────────────────────────────────────────

const codePointToChar = (code: number): string => {
  if (!Number.isFinite(code) || code < 0 || code > 0x10_ff_ff) {
    return '';
  }
  try {
    return String.fromCodePoint(code);
  } catch {
    return '';
  }
};

const decodeEntities = (text: string): string =>
  text
    .replaceAll(/&#x(?<hex>[0-9a-f]+);/giu, (_, hex: string) => codePointToChar(Number.parseInt(hex, 16)))
    .replaceAll(/&#(?<dec>\d+);/gu, (_, dec: string) => codePointToChar(Math.trunc(Number(dec))))
    .replaceAll(/&nbsp;/giu, ' ')
    .replaceAll(/&quot;/giu, '"')
    .replaceAll('&#39;', "'")
    .replaceAll(/&apos;/giu, "'")
    .replaceAll(/&lt;/giu, '<')
    .replaceAll(/&gt;/giu, '>')
    .replaceAll(/&amp;/giu, '&');

/**
 * Strip HTML down to display text without touching a DOM (works on web,
 * iOS/Android, and GTK alike). Block ends and <br> become newlines, list
 * items get a bullet, script/style/comment bodies are dropped, and common
 * entities are decoded. The result renders only as plain <Text> content —
 * markup from the server is never re-emitted as markup.
 */
export const htmlToText = (html: string | null | undefined): string => {
  if (html == null || html === '') {
    return '';
  }
  let text = html.replaceAll(/\r\n?/gu, '\n');
  text = text.replaceAll(/<(?<tag>script|style)\b[^>]*>[\s\S]*?<\/\k<tag>\s*>/giu, '');
  text = text.replaceAll(/<!--[\s\S]*?-->/gu, '');
  text = text.replaceAll(/<br\s*\/?>/giu, '\n');
  text = text.replaceAll(/<li\b[^>]*>/giu, '\n• ');
  text = text.replaceAll(/<\/(?:p|div|li|tr|h[1-6]|blockquote|pre|table|ul|ol)\s*>/giu, '\n');
  // oxlint-disable-next-line sonarjs/super-linear-regex -- bounded comment/version HTML from the bench; the tag scan stops at the first `>`
  text = text.replaceAll(/<[^>]+>/gu, '');
  text = decodeEntities(text);
  text = text.replaceAll('\u00A0', ' ');
  text = text
    // oxlint-disable-next-line sonarjs/super-linear-regex -- bounded comment/version text from the bench
    .replaceAll(/[ \t]+\n/gu, '\n')
    .replaceAll(/\n{3,}/gu, '\n\n')
    .trim();
  return text;
};

/** Escape text for embedding inside HTML (comment payloads). */
export const escapeHtml = (text: string): string =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

/**
 * Desk sends comment content as HTML; encode the plain composer text the
 * same way (escaped, newlines as <br>, wrapped in one div) so the payload
 * matches what `frappe.desk.form.utils.add_comment` expects.
 */
export const textToCommentHtml = (text: string): string =>
  `<div>${escapeHtml(text.trim()).replaceAll('\n', '<br>')}</div>`;

/** Truncate display text with an ellipsis (version values, error copy). */
export const truncateText = (text: string, max = 50): string =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

/** "sales_order_item" → "Sales Order Item" (no meta available here). */
export const humanizeFieldname = (fieldname: string): string =>
  fieldname
    .split(/[_\s]+/u)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ') || fieldname;

// ── session user ───────────────────────────────────────────────────────────

interface SessionUserEntry {
  promise: Promise<string>;
  value?: string;
}

// Keyed by FrappeApp instance (useFrappeApp memoizes per connection config),
// so every timeline on a page shares one get_logged_user round trip.
const sessionUserCache = new WeakMap<FrappeApp, SessionUserEntry>();

const fetchSessionUser = async (app: FrappeApp): Promise<string> => {
  const res = await app.call().get<{ message?: string }>('frappe.auth.get_logged_user');
  const value = res.payload?.message;
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- get_logged_user is wire data; only a non-empty string is a user
  if (typeof value !== 'string' || !value) {
    throw new Error('No logged user returned');
  }
  return value;
};

/** Record the resolved user on its cache entry, or evict a failed probe so the next mount retries. */
const settleSessionUser = async (app: FrappeApp, entry: SessionUserEntry): Promise<void> => {
  try {
    const value = await entry.promise;
    if (sessionUserCache.get(app) === entry) {
      entry.value = value;
    }
  } catch {
    // allow a retry on the next mount instead of caching the failure
    if (sessionUserCache.get(app) === entry) {
      sessionUserCache.delete(app);
    }
  }
};

/** The shared get_logged_user probe for an app, started on first use. */
const sessionUserEntry = (app: FrappeApp): SessionUserEntry => {
  const cached = sessionUserCache.get(app);
  if (cached) {
    return cached;
  }
  const created: SessionUserEntry = { promise: fetchSessionUser(app) };
  sessionUserCache.set(app, created);
  void settleSessionUser(app, created);
  return created;
};

/**
 * Session user via `frappe.auth.get_logged_user`, cached per FrappeApp.
 * Drives the own-comment edit/delete affordances and the add_comment
 * payload (`comment_email` / `comment_by`).
 */
export const useSessionUser = (enabled = true): string | undefined => {
  const app = useFrappeApp();
  const [user, setUser] = useState<string | undefined>(() =>
    enabled && app ? sessionUserCache.get(app)?.value : undefined,
  );

  useEffect(() => {
    if (!app || !enabled) {
      // oxlint-disable-next-line unicorn/no-useless-undefined -- the effect returns a cleanup on other paths; a bare return trips consistent-return
      return undefined;
    }
    const entry = sessionUserEntry(app);
    let cancelled = false;
    const load = async () => {
      try {
        const value = await entry.promise;
        if (!cancelled) {
          setUser(value);
        }
      } catch {
        // stay undefined; composer simply hides until a session is known
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [app, enabled]);

  return user;
};
