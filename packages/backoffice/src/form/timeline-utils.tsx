// Cross-platform helpers for the form activity timeline: frappe datetime
// parsing (bench sends naive "YYYY-MM-DD HH:mm:ss.ffffff" strings that
// JSC/Hermes will not parse natively), a relative-time register, safe
// HTML → plain-text conversion (no DOM APIs and no raw-HTML rendering on
// any platform), plain text → comment HTML for the desk RPCs, and the
// cached session-user lookup shared by every timeline instance.
import type { FrappeApp } from '@repo/frappe';
import { useEffect, useState } from 'react';

import { useFrappeApp } from '../shared/useFrappeApp';

// ── frappe datetime parsing ────────────────────────────────────────────────

const FRAPPE_DATETIME = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?(?:\.(\d+))?(Z)?)?$/;

/**
 * Parse a frappe datetime ("2026-08-12 09:35:11.836712", date-only, or ISO)
 * into a Date. Bench datetimes are naive site-local time, so date parts are
 * constructed in local time; a trailing `Z` is honored as UTC. Returns
 * undefined for unparseable input (honest passthrough happens at render).
 */
export function parseFrappeDate(value: unknown): Date | undefined {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value;
  }
  if (typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
  if (typeof value !== 'string' || !value.trim()) {
    return undefined;
  }
  const match = FRAPPE_DATETIME.exec(value.trim());
  if (match) {
    const [, year, month, day, hour, minute, second, fraction, utc] = match;
    const ms = fraction ? Math.round(Number(`0.${fraction}`) * 1000) : 0;
    if (utc) {
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
}

/** Epoch millis for sorting; unparseable input sorts last (0). */
export function frappeDateEpoch(value: unknown): number {
  return parseFrappeDate(value)?.getTime() ?? 0;
}

/**
 * Relative timestamp in the house feed register ("just now", "5m ago",
 * "2h ago", "3 days ago", "2mo ago", "1y ago") on top of frappe-safe
 * parsing. Unparseable strings pass through unchanged.
 */
export function formatRelativeTime(value: unknown, now: number = Date.now()): string {
  const date = parseFrappeDate(value);
  if (!date) {
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
}

// ── HTML ↔ text ────────────────────────────────────────────────────────────

function codePointToChar(code: number): string {
  if (!Number.isFinite(code) || code < 0 || code > 0x10_ff_ff) {
    return '';
  }
  try {
    return String.fromCodePoint(code);
  } catch {
    return '';
  }
}

function decodeEntities(text: string): string {
  return text
    .replaceAll(/&#x([0-9a-f]+);/gi, (_, hex: string) => codePointToChar(Number.parseInt(hex, 16)))
    .replaceAll(/&#(\d+);/g, (_, dec: string) => codePointToChar(Number.parseInt(dec, 10)))
    .replaceAll(/&nbsp;/gi, ' ')
    .replaceAll(/&quot;/gi, '"')
    .replaceAll('&#39;', "'")
    .replaceAll(/&apos;/gi, "'")
    .replaceAll(/&lt;/gi, '<')
    .replaceAll(/&gt;/gi, '>')
    .replaceAll(/&amp;/gi, '&');
}

/**
 * Strip HTML down to display text without touching a DOM (works on web,
 * iOS/Android, and GTK alike). Block ends and <br> become newlines, list
 * items get a bullet, script/style/comment bodies are dropped, and common
 * entities are decoded. The result renders only as plain <Text> content —
 * markup from the server is never re-emitted as markup.
 */
export function htmlToText(html: string | null | undefined): string {
  if (!html) {
    return '';
  }
  let text = String(html).replaceAll(/\r\n?/g, '\n');
  text = text.replaceAll(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  text = text.replaceAll(/<!--[\s\S]*?-->/g, '');
  text = text.replaceAll(/<br\s*\/?>/gi, '\n');
  text = text.replaceAll(/<li\b[^>]*>/gi, '\n• ');
  text = text.replaceAll(/<\/(p|div|li|tr|h[1-6]|blockquote|pre|table|ul|ol)\s*>/gi, '\n');
  text = text.replaceAll(/<[^>]+>/g, '');
  text = decodeEntities(text);
  text = text.replaceAll('\u00A0', ' ');
  text = text
    .replaceAll(/[ \t]+\n/g, '\n')
    .replaceAll(/\n{3,}/g, '\n\n')
    .trim();
  return text;
}

/** Escape text for embedding inside HTML (comment payloads). */
export function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Desk sends comment content as HTML; encode the plain composer text the
 * same way (escaped, newlines as <br>, wrapped in one div) so the payload
 * matches what `frappe.desk.form.utils.add_comment` expects.
 */
export function textToCommentHtml(text: string): string {
  return `<div>${escapeHtml(text.trim()).replaceAll('\n', '<br>')}</div>`;
}

/** Truncate display text with an ellipsis (version values, error copy). */
export function truncateText(text: string, max = 50): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** "sales_order_item" → "Sales Order Item" (no meta available here). */
export function humanizeFieldname(fieldname: string): string {
  return (
    fieldname
      .split(/[_\s]+/)
      .filter(Boolean)
      .map((word) => word[0].toUpperCase() + word.slice(1))
      .join(' ') || fieldname
  );
}

// ── session user ───────────────────────────────────────────────────────────

interface SessionUserEntry {
  promise: Promise<string>;
  value?: string;
}

// Keyed by FrappeApp instance (useFrappeApp memoizes per connection config),
// so every timeline on a page shares one get_logged_user round trip.
const sessionUserCache = new WeakMap<FrappeApp, SessionUserEntry>();

/**
 * Session user via `frappe.auth.get_logged_user`, cached per FrappeApp.
 * Drives the own-comment edit/delete affordances and the add_comment
 * payload (`comment_email` / `comment_by`).
 */
export function useSessionUser(enabled = true): string | undefined {
  const app = useFrappeApp();
  const [user, setUser] = useState<string | undefined>(() =>
    enabled && app ? sessionUserCache.get(app)?.value : undefined,
  );

  useEffect(() => {
    if (!app || !enabled) {
      return;
    }
    let entry = sessionUserCache.get(app);
    if (!entry) {
      const promise = app
        .call()
        .get<{ message?: string }>('frappe.auth.get_logged_user')
        .then((res) => {
          const value = res.payload?.message;
          if (typeof value !== 'string' || !value) {
            throw new Error('No logged user returned');
          }
          return value;
        });
      const created: SessionUserEntry = { promise };
      entry = created;
      sessionUserCache.set(app, created);
      promise
        .then((value) => {
          if (sessionUserCache.get(app) === created) {
            created.value = value;
          }
        })
        .catch(() => {
          // allow a retry on the next mount instead of caching the failure
          if (sessionUserCache.get(app) === created) {
            sessionUserCache.delete(app);
          }
        });
    }
    let cancelled = false;
    entry.promise
      .then((value) => {
        if (!cancelled) {
          setUser(value);
        }
      })
      .catch(() => {
        // stay undefined; composer simply hides until a session is known
      });
    return () => {
      cancelled = true;
    };
  }, [app, enabled]);

  return user;
}
