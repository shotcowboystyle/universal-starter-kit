// Cross-platform display helpers for list cells — frappe datetimes like
// "2026-08-12 08:50:24.691936". Formatting routes through the house date
// channel (LC-12 DATA-REGISTER-CHANNEL): one formatter owns each register,
// this module only parses the frappe wire format and picks the register.
import { formatAbsoluteDate, formatRelativeTimestamp } from '@repo/theme';

/** Parse a frappe date/datetime string into a Date (undefined when invalid). */
export const parseFrappeDate = (value: string): Date | undefined => {
  // "YYYY-MM-DD HH:mm:ss.SSSSSS" → ISO-ish so JSC/Hermes parse it too.
  const isoish = value.includes(' ') ? value.replace(' ', 'T') : value;
  const date = new Date(isoish);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

/**
 * Table date cell — the house compact-absolute display register
 * ("Aug 12" / "Jul 1, 2025", current year elided). Raw ISO wire format
 * never reaches the cell (LC-12); unparseable input passes through.
 * The STRING (not a parsed Date) rides into the channel so its date-only
 * UTC branch engages — a parsed "YYYY-MM-DD" would shift a day in
 * negative-offset timezones.
 */
export const formatDateCell = (value: string, now?: Date): string => {
  if (!parseFrappeDate(value)) {
    return value;
  }
  const isoish = value.includes(' ') ? value.replace(' ', 'T') : value;
  return formatAbsoluteDate(isoish, now ? { now } : undefined);
};

/**
 * Recency column ("Last Updated On") — the house relative register
 * ("just now", "5m ago", "2h ago", "2mo ago"). One voice, unambiguous
 * units (LC-12); unparseable input passes through.
 */
export const formatTimeAgo = (value: string, now: Date = new Date()): string => {
  const date = parseFrappeDate(value);
  if (!date) {
    return value;
  }
  return formatRelativeTimestamp(date, now.getTime());
};

/**
 * Plain-text preview of rich/HTML field content for list cells (desk
 * `strip_html` parity): tags dropped, entities collapsed, whitespace
 * normalized. A Text Editor value like `<div class="ql-editor"><p>Call the
 * vendor</p></div>` renders as "Call the vendor" — markup never paints in
 * a one-line cell (LC-06/LC-10 containment; cell-containment rule candidate).
 */
export const stripHtmlPreview = (value: string): string => {
  if (!value.includes('<') && !value.includes('&')) {
    return value;
  }
  return (
    value
      // oxlint-disable-next-line sonarjs/super-linear-regex -- `[^>]*` cannot match the closing `>`, so each tag is scanned once (linear)
      .replaceAll(/<[^>]*>/gu, ' ')
      .replaceAll(/&nbsp;/giu, ' ')
      .replaceAll(/&amp;/giu, '&')
      .replaceAll(/&lt;/giu, '<')
      .replaceAll(/&gt;/giu, '>')
      .replaceAll(/&#39;|&apos;/giu, "'")
      .replaceAll(/&quot;/giu, '"')
      .replaceAll(/\s+/gu, ' ')
      .trim()
  );
};

/** Parse frappe's `_assign` / `_liked_by` JSON-array-string columns. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- takes the raw doctype column straight off the wire; this is its parse boundary
export const parseUserListField = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map(String);
  }
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- wire value probed at its parse boundary
  if (typeof value !== 'string' || !value) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
};

/** Parse frappe's `_user_tags` comma-joined column (",a,b" → ["a","b"]). */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- takes the raw doctype column straight off the wire; this is its parse boundary
export const parseTagsField = (value: unknown): string[] => {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- wire value probed at its parse boundary
  if (typeof value !== 'string') {
    return [];
  }
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
};
