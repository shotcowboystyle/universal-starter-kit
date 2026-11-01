/**
 * listFormat — frappe datetime parsing and desk-style list-cell display
 * helpers. Time-ago fixtures anchor `now` to the parsed date itself so the
 * assertions are timezone-independent.
 */
import { describe, expect, it } from 'vitest';

import {
  formatDateCell,
  formatTimeAgo,
  parseFrappeDate,
  parseTagsField,
  parseUserListField,
  stripHtmlPreview,
} from './list-format';

describe(parseFrappeDate, () => {
  it('parses frappe datetime strings (space-separated, microseconds)', () => {
    const date = parseFrappeDate('2026-08-12 08:50:24.691936');
    expect(date).toBeInstanceOf(Date);
    expect(date?.getFullYear()).toBe(2026);
    // August.
    expect(date?.getMonth()).toBe(7);
    expect(date?.getDate()).toBe(12);
    expect(date?.getHours()).toBe(8);
    expect(date?.getMinutes()).toBe(50);
    expect(date?.getSeconds()).toBe(24);
  });

  it('parses plain dates', () => {
    const date = parseFrappeDate('2026-08-12');
    expect(date).toBeInstanceOf(Date);
    expect(Number.isNaN(date?.getTime())).toBe(false);
  });

  it('returns undefined for invalid input', () => {
    expect(parseFrappeDate('not a date')).toBeUndefined();
    expect(parseFrappeDate('')).toBeUndefined();
  });
});

describe('formatDateCell (LC-12 compact-absolute display register)', () => {
  // Anchor `now` inside the stamp's year so current-year elision is stable.
  const now = parseFrappeDate('2026-01-01 00:00:00')!;

  it('renders the house compact-absolute register, never raw ISO', () => {
    expect(formatDateCell('2026-08-12 08:50:24', now)).toBe('Aug 12');
    expect(formatDateCell('2026-08-12 08:50:24.691936', now)).toBe('Aug 12');
    expect(formatDateCell('2026-08-12', now)).toBe('Aug 12');
  });

  it('keeps the year when not current (display register year:auto)', () => {
    expect(formatDateCell('2025-07-01', now)).toBe('Jul 1, 2025');
  });

  it('passes unparseable input through unchanged (honest passthrough)', () => {
    expect(formatDateCell('garbage', now)).toBe('garbage');
  });
});

describe('formatTimeAgo (LC-12 relative register)', () => {
  const stamp = '2026-08-12 08:00:00';
  const base = parseFrappeDate(stamp)!;
  const after = (ms: number) => new Date(base.getTime() + ms);
  const MINUTE = 60_000;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;

  it('speaks the house relative register — one voice, unambiguous units', () => {
    expect(formatTimeAgo(stamp, after(0))).toBe('just now');
    expect(formatTimeAgo(stamp, after(59_000))).toBe('just now');
    expect(formatTimeAgo(stamp, after(MINUTE))).toBe('1m ago');
    expect(formatTimeAgo(stamp, after(59 * MINUTE))).toBe('59m ago');
    expect(formatTimeAgo(stamp, after(HOUR))).toBe('1h ago');
    expect(formatTimeAgo(stamp, after(23 * HOUR + 59 * MINUTE))).toBe('23h ago');
    expect(formatTimeAgo(stamp, after(DAY))).toBe('1 day ago');
    expect(formatTimeAgo(stamp, after(29 * DAY))).toBe('29 days ago');
  });

  it("months use 'mo', never an ambiguous capital M", () => {
    expect(formatTimeAgo(stamp, after(31 * DAY))).toBe('1mo ago');
    expect(formatTimeAgo(stamp, after(330 * DAY))).toBe('11mo ago');
  });

  it('shows years beyond ~12 months', () => {
    expect(formatTimeAgo(stamp, after(366 * DAY))).toBe('1y ago');
    expect(formatTimeAgo(stamp, after(2 * 366 * DAY))).toBe('2y ago');
  });

  it('returns the raw value when unparseable', () => {
    expect(formatTimeAgo('garbage', new Date())).toBe('garbage');
  });

  it('treats future timestamps as just now (clamped, never negative)', () => {
    expect(formatTimeAgo(stamp, after(-5 * HOUR))).toBe('just now');
  });
});

describe('parseUserListField (_assign / _liked_by JSON-array-string columns)', () => {
  it('parses the bench shape: a JSON array string', () => {
    expect(parseUserListField('["admin@example.com", "test@example.com"]')).toStrictEqual([
      'admin@example.com',
      'test@example.com',
    ]);
  });

  it('passes real arrays through, stringifying members', () => {
    expect(parseUserListField(['a@b.c', 42])).toStrictEqual(['a@b.c', '42']);
  });

  it('returns [] for empty, malformed, or non-array JSON', () => {
    expect(parseUserListField('')).toStrictEqual([]);
    expect(parseUserListField(null)).toStrictEqual([]);
    // oxlint-disable-next-line unicorn/no-useless-undefined -- the parser's input is required; an absent column value is the case under test
    expect(parseUserListField(undefined)).toStrictEqual([]);
    expect(parseUserListField('not json')).toStrictEqual([]);
    expect(parseUserListField('{"a":1}')).toStrictEqual([]);
    expect(parseUserListField(42)).toStrictEqual([]);
  });
});

describe('stripHtmlPreview (rich-text cell previews, desk strip_html parity)', () => {
  it('strips Text Editor markup down to its text', () => {
    expect(stripHtmlPreview('<div class="ql-editor read-mode"><p>Call the vendor</p></div>')).toBe('Call the vendor');
  });

  it('collapses tags and entities into single spaces', () => {
    expect(stripHtmlPreview('<p>a</p><p>b&nbsp;c</p>')).toBe('a b c');
    expect(stripHtmlPreview('x &amp; y &lt;z&gt;')).toBe('x & y <z>');
  });

  it('passes plain text through untouched (fast path)', () => {
    expect(stripHtmlPreview('plain description')).toBe('plain description');
  });
});

describe('parseTagsField (_user_tags comma-joined column)', () => {
  it('parses the bench shape: leading-comma joined tags', () => {
    expect(parseTagsField(',Urgent,Follow Up')).toStrictEqual(['Urgent', 'Follow Up']);
  });

  it('trims whitespace and drops empty segments', () => {
    expect(parseTagsField(' ,  a , ,b, ')).toStrictEqual(['a', 'b']);
  });

  it('returns [] for empty or non-string values', () => {
    expect(parseTagsField('')).toStrictEqual([]);
    expect(parseTagsField(null)).toStrictEqual([]);
    // oxlint-disable-next-line unicorn/no-useless-undefined -- the parser's input is required; an absent column value is the case under test
    expect(parseTagsField(undefined)).toStrictEqual([]);
    expect(parseTagsField(['a'])).toStrictEqual([]);
  });
});
