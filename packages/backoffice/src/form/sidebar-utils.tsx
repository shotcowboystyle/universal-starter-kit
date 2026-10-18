/**
 * Pure helpers for the form sidebar: frappe timestamp parsing, relative
 * time (byline), tag-string parsing, file-url resolution, and web-guarded
 * platform affordances (new tab, file picker). No React, no DOM assumptions
 * outside the explicit guards — safe on web, iOS/Android (Hermes), and GTK
 * (GJS, no DOM). External links ride the platform-split openUrl.
 */

import { openUrl as platformOpenUrl } from '@repo/platform';

/** i18next-compatible translate signature (key, default, interpolation). */
export type SidebarTranslate = (key: string, defaultValue: string, options?: Record<string, unknown>) => string;

/** Parse a frappe timestamp ("2026-08-12 09:35:15.684756" or ISO). */
export function parseFrappeDate(value: unknown): Date | undefined {
  if (typeof value !== 'string' || !value) {
    return undefined;
  }
  const iso = value.includes('T') ? value : value.replace(' ', 'T');
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

/**
 * Desk-style relative time ("just now", "5 minutes ago", "3 weeks ago").
 * Future timestamps (clock skew) collapse to "just now".
 */
export function formatRelativeTime(value: unknown, t: SidebarTranslate, nowMs = Date.now()): string | undefined {
  const date = parseFrappeDate(value);
  if (!date) {
    return undefined;
  }
  const diff = nowMs - date.getTime();
  if (diff < MINUTE) {
    return t('justNow', 'just now');
  }
  const unit = (count: number, one: [string, string], other: [string, string]) =>
    count === 1 ? t(one[0], one[1]) : t(other[0], other[1], { count });
  if (diff < HOUR) {
    return unit(Math.floor(diff / MINUTE), ['minuteAgo', '1 minute ago'], ['minutesAgo', '{{count}} minutes ago']);
  }
  if (diff < DAY) {
    return unit(Math.floor(diff / HOUR), ['hourAgo', '1 hour ago'], ['hoursAgo', '{{count}} hours ago']);
  }
  if (diff < WEEK) {
    return unit(Math.floor(diff / DAY), ['dayAgo', '1 day ago'], ['daysAgo', '{{count}} days ago']);
  }
  if (diff < MONTH) {
    return unit(Math.floor(diff / WEEK), ['weekAgo', '1 week ago'], ['weeksAgo', '{{count}} weeks ago']);
  }
  if (diff < YEAR) {
    return unit(Math.floor(diff / MONTH), ['monthAgo', '1 month ago'], ['monthsAgo', '{{count}} months ago']);
  }
  return unit(Math.floor(diff / YEAR), ['yearAgo', '1 year ago'], ['yearsAgo', '{{count}} years ago']);
}

/**
 * docinfo `tags` is a comma-joined string ("probe-two,sidebar-probe" on the
 * live bench; older payloads may carry a leading comma or JSON "[]").
 */
export function parseTagString(tags: unknown): string[] {
  if (typeof tags !== 'string' || !tags) {
    return [];
  }
  let raw = tags;
  if (raw.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return [...new Set(parsed.map(String).filter(Boolean))];
      }
    } catch {
      // fall through to comma parsing
    }
    raw = raw.replaceAll(/[[\]"]/g, ',');
  }
  return [
    ...new Set(
      raw
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  ];
}

/** Resolve a (possibly relative) file_url against the bench base URL. */
export function toAbsoluteUrl(baseURL: string | undefined, url: string): string {
  if (/^https?:\/\//i.test(url) || !baseURL) {
    return url;
  }
  const base = baseURL.replace(/\/+$/, '');
  return `${base}${url.startsWith('/') ? url : `/${url}`}`;
}

/** External-URL capability — platform openUrl has a twin on every target. */
export function canOpenUrl(): boolean {
  return true;
}

/** Open a URL externally (web new tab / native Linking / GNOME Gio). */
export function openUrl(url: string): boolean {
  platformOpenUrl(url, '_blank');
  return true;
}

/** True when a DOM file picker is available (web). */
export function canPickFile(): boolean {
  return typeof document !== 'undefined' && typeof document.createElement === 'function';
}

/**
 * Web file picker via a transient `<input type="file">` (imperative — no DOM
 * JSX so native/GTK bundles never see browser intrinsics). Resolves with the
 * picked file, or undefined on cancel / unsupported platform.
 */
export async function pickFile(accept?: string): Promise<File | undefined> {
  if (!canPickFile()) {
    return undefined;
  }
  return await new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    if (accept) {
      input.accept = accept;
    }
    input.style.display = 'none';
    input.onchange = () => {
      resolve(input.files?.[0] ?? undefined);
      input.remove();
    };
    // Modern browsers fire "cancel" when the dialog is dismissed.
    input.addEventListener('cancel', () => {
      resolve(undefined);
      input.remove();
    });
    document.body.append(input);
    input.click();
  });
}
