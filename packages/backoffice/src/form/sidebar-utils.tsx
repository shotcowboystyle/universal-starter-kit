/**
 * Pure helpers for the form sidebar: frappe timestamp parsing, relative
 * time (byline), tag-string parsing, file-url resolution, and web-guarded
 * platform affordances (new tab, file picker). No React, no DOM assumptions
 * outside the explicit guards — safe on web, iOS/Android (Hermes), and GTK
 * (GJS, no DOM). External links ride the platform-split openUrl.
 */

import { openUrl as platformOpenUrl } from '@repo/platform';

/** i18next-compatible translate signature (key, default, interpolation). */
export type SidebarTranslate = (key: string, defaultValue: string, options?: Record<string, string | number>) => string;

/** Sidebar row type/icon/avatar steps for the density knob's size token ($3 compact, $5 roomy). */
export const sidebarRowScale = (sizeToken: string) => {
  if (sizeToken === '$3') {
    return { fontSize: '$1', iconSize: 12, avatarSize: '$1' } as const;
  }
  if (sizeToken === '$5') {
    return { fontSize: '$4', iconSize: 16, avatarSize: '$3' } as const;
  }
  return { fontSize: '$2', iconSize: 14, avatarSize: '$2' } as const;
};

/** Parse a frappe timestamp ("2026-08-12 09:35:15.684756" or ISO). */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- parse boundary for raw docinfo timestamps
export const parseFrappeDate = (value: unknown): Date | undefined => {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- parse boundary: only a non-empty string is a timestamp
  if (typeof value !== 'string' || !value) {
    return undefined;
  }
  const iso = value.includes('T') ? value : value.replace(' ', 'T');
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

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
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- forwards a raw docinfo timestamp to parseFrappeDate
export const formatRelativeTime = (value: unknown, t: SidebarTranslate, nowMs = Date.now()): string | undefined => {
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
};

/**
 * docinfo `tags` is a comma-joined string ("probe-two,sidebar-probe" on the
 * live bench; older payloads may carry a leading comma or JSON "[]").
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- parse boundary for the raw docinfo `tags` payload
export const parseTagString = (tags: unknown): string[] => {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- parse boundary: only a non-empty string carries tags
  if (typeof tags !== 'string' || !tags) {
    return [];
  }
  let raw = tags;
  if (raw.trim().startsWith('[')) {
    try {
      // SAFETY: widens JSON.parse's `any` to `unknown`; Array.isArray narrows it below
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        const unique = new Set<string>();
        for (const entry of parsed) {
          const tag = String(entry);
          if (tag !== '') {
            unique.add(tag);
          }
        }
        return [...unique];
      }
    } catch {
      // fall through to comma parsing
    }
    raw = raw.replaceAll(/[[\]"]/gu, ',');
  }
  return [
    ...new Set(
      raw
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  ];
};

/** Resolve a (possibly relative) file_url against the bench base URL. */
export const toAbsoluteUrl = (baseURL: string | undefined, url: string): string => {
  if (/^https?:\/\//iu.test(url) || baseURL === undefined || baseURL === '') {
    return url;
  }
  // oxlint-disable-next-line sonarjs/super-linear-regex -- the bench base URL is short host config, never user-sized input
  const base = baseURL.replace(/\/+$/u, '');
  const path = url.startsWith('/') ? url : `/${url}`;
  return `${base}${path}`;
};

/** External-URL capability — platform openUrl has a twin on every target. */
export const canOpenUrl = (): boolean => true;

/** Open a URL externally (web new tab / native Linking / GNOME Gio). */
export const openUrl = (url: string): boolean => {
  platformOpenUrl(url, '_blank');
  return true;
};

/** True when a DOM file picker is available (web). */
export const canPickFile = (): boolean =>
  // oxlint-disable-next-line anti-slop/no-runtime-typeof, typescript/no-deprecated -- feature detection of the host's DOM, not data parsing
  typeof document !== 'undefined' && typeof document.createElement === 'function';

/**
 * Web file picker via a transient `<input type="file">` (imperative — no DOM
 * JSX so native/GTK bundles never see browser intrinsics). Resolves with the
 * picked file, or undefined on cancel / unsupported platform.
 */
export const pickFile = async (accept?: string): Promise<File | undefined> => {
  if (!canPickFile()) {
    return undefined;
  }
  const { promise, resolve } = Promise.withResolvers<File | undefined>();
  const input = document.createElement('input');
  input.type = 'file';
  if (accept !== undefined && accept !== '') {
    input.accept = accept;
  }
  input.style.display = 'none';
  input.addEventListener('change', () => {
    resolve(input.files?.[0] ?? undefined);
    input.remove();
  });
  // Modern browsers fire "cancel" when the dialog is dismissed.
  input.addEventListener('cancel', () => {
    // oxlint-disable-next-line unicorn/no-useless-undefined -- resolve's parameter is required; omitting it is a type error
    resolve(undefined);
    input.remove();
  });
  document.body.append(input);
  input.click();
  return await promise;
};
