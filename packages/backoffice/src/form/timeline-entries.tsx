// Maps a docinfo payload into the flat, newest-first feed FormTimeline
// renders: comments, versions (edits), communications, automated messages,
// and assignment/attachment/like/info logs. Row shapes verified against the
// live bench (get_docinfo):
//   comments  → { name, creation, content, owner, comment_type }
//   versions  → { name, owner, creation, data } with data a JSON string
//               { changed: [[field, old, new]], added, removed, row_changed }
//   user_info → { [user]: { fullname, image, name, email } }
// The input types are deliberately structural ("docinfo-like") so both the
// shared useDocinfo payload and form-core's typed docinfo satisfy them.
import type { TimelineEntry } from '@repo/ui';

import { htmlToText, humanizeFieldname, parseFrappeDate, truncateText } from './timeline-utils';

/** Any docinfo row — fields are unknown and validated at map time. */
export interface TimelineRowLike {
  name?: unknown;
  creation?: unknown;
  owner?: unknown;
  content?: unknown;
  /** Version rows: JSON diff string */
  data?: unknown;
  /** Communication rows */
  sender?: unknown;
  sender_full_name?: unknown;
  subject?: unknown;
  communication_date?: unknown;
  /** Optimistic overlay rows: applied locally, awaiting server ack */
  __optimistic?: unknown;
}

export interface TimelineUserInfoLike {
  fullname?: unknown;
  image?: unknown;
  name?: unknown;
  email?: unknown;
}

/** Structural docinfo shape the timeline can render. */
export interface TimelineDocinfoLike {
  user_info?: Record<string, TimelineUserInfoLike | undefined>;
  comments?: readonly TimelineRowLike[];
  versions?: readonly TimelineRowLike[];
  communications?: readonly TimelineRowLike[];
  automated_messages?: readonly TimelineRowLike[];
  assignment_logs?: readonly TimelineRowLike[];
  attachment_logs?: readonly TimelineRowLike[];
  like_logs?: readonly TimelineRowLike[];
  info_logs?: readonly TimelineRowLike[];
}

export type TimelineFeedKind =
  | 'comment'
  | 'version'
  | 'communication'
  | 'automated'
  | 'assignment'
  | 'attachment'
  | 'like'
  | 'info';

/** Desk-parity filter tabs: All / Comments / Edits. */
export type TimelineFilterValue = 'all' | 'comments' | 'edits';

export interface VersionFieldChange {
  field: string;
  from?: string;
  to?: string;
  /**
   * The raw value was rich markup with no extractable text (an image-only
   * Text Editor value, say) — render an honest "(formatted content)"
   * placeholder instead of pretending the value was empty or dumping tags.
   */
  fromRich?: boolean;
  toRich?: boolean;
}

export interface ParsedVersionData {
  changed: VersionFieldChange[];
  /** Child-table fieldnames with added rows */
  added: string[];
  /** Child-table fieldnames with removed rows */
  removed: string[];
  /** Child-table fieldnames with edited rows */
  rowChanged: string[];
}

export interface TimelineFeedEntry extends TimelineEntry {
  kind: TimelineFeedKind;
  /** Source document name (Comment name for update/delete RPCs) */
  docname: string;
  /** Owning user id — own-comment check for edit/delete */
  ownerId?: string;
  /** Resolved avatar image URL */
  image?: string;
  /** Original comment HTML (edit prefill) */
  html?: string;
  /** Communication subject line */
  subject?: string;
  /** Parsed version diff (undefined when data was malformed) */
  version?: ParsedVersionData;
  /** Epoch millis used for the newest-first sort */
  epoch: number;
  /**
   * Applied locally, awaiting server ack (Axiom 6 HONEST STATE: renders
   * visible but distinct; row actions are withheld until identity is real).
   */
  pending?: boolean;
}

interface BuildOptions {
  /** docinfo.user_info — resolves fullname/avatar for owners and senders */
  userInfo?: Record<string, TimelineUserInfoLike | undefined>;
  /** Frappe base URL for resolving relative avatar paths ("/files/…") */
  baseURL?: string;
}

// ── small helpers ──────────────────────────────────────────────────────────

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

function resolveImage(image: string | undefined, baseURL?: string): string | undefined {
  if (!image) {
    return undefined;
  }
  if (/^(https?:)?\/\//.test(image) || image.startsWith('data:')) {
    return image;
  }
  if (!baseURL) {
    return image;
  }
  return `${baseURL.replace(/\/+$/, '')}${image.startsWith('/') ? '' : '/'}${image}`;
}

interface AuthorFields {
  author: string;
  authorName?: string;
  authorEmail?: string;
  image?: string;
}

function authorFields(userId: string | undefined, options: BuildOptions): AuthorFields {
  const info = userId ? options.userInfo?.[userId] : undefined;
  return {
    author: userId ?? 'unknown',
    authorName: str(info?.fullname),
    authorEmail: str(info?.email),
    image: resolveImage(str(info?.image), options.baseURL),
  };
}

interface TimestampFields {
  timestamp: string;
  epoch: number;
}

function timestampFields(raw: unknown): TimestampFields {
  const date = parseFrappeDate(raw);
  return {
    // ISO keeps downstream Date() parsing safe on every JS engine
    timestamp: date ? date.toISOString() : (str(raw) ?? ''),
    epoch: date?.getTime() ?? 0,
  };
}

interface DisplayValue {
  text?: string;
  /** Non-empty rich markup that strips to no text (image-only HTML etc.) */
  rich?: boolean;
}

/** Looks like markup (an opening/closing tag) — worth an htmlToText pass. */
const HTML_TAG = /<[a-z!/][^>]*>/i;

/**
 * Display form of a version diff value: objects JSON-stringify, HTML strips
 * to its text (Text Editor / HTML fields must never leak raw markup into
 * the feed), and everything truncates. Markup with no extractable text
 * flags `rich` so the renderer can show an honest placeholder.
 */
function displayValue(value: unknown): DisplayValue {
  if (value === null || value === undefined) {
    return {};
  }
  if (typeof value === 'object') {
    try {
      return { text: truncateText(JSON.stringify(value)) };
    } catch {
      return {};
    }
  }
  const text = String(value).trim();
  if (!text) {
    return {};
  }
  if (HTML_TAG.test(text)) {
    const stripped = htmlToText(text);
    return stripped ? { text: truncateText(stripped) } : { rich: true };
  }
  return { text: truncateText(text) };
}

// ── version data parsing ───────────────────────────────────────────────────

/**
 * Parse a Version doc's `data` JSON string defensively — malformed or empty
 * payloads yield undefined and render as a plain "made changes" row.
 */
export function parseVersionData(data: unknown): ParsedVersionData | undefined {
  if (typeof data !== 'string' || !data) {
    return undefined;
  }
  let parsed: Record<string, unknown>;
  try {
    const raw: unknown = JSON.parse(data);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return undefined;
    }
    parsed = raw as Record<string, unknown>;
  } catch {
    return undefined;
  }
  const changed: VersionFieldChange[] = [];
  if (Array.isArray(parsed.changed)) {
    for (const row of parsed.changed) {
      if (!Array.isArray(row) || row.length === 0) {
        continue;
      }
      const field = str(row[0]);
      if (!field) {
        continue;
      }
      const from = displayValue(row[1]);
      const to = displayValue(row[2]);
      changed.push({
        field,
        ...(from.text === undefined ? {} : { from: from.text }),
        ...(to.text === undefined ? {} : { to: to.text }),
        ...(from.rich ? { fromRich: true } : {}),
        ...(to.rich ? { toRich: true } : {}),
      });
    }
  }
  const tableFields = (value: unknown): string[] => {
    if (!Array.isArray(value)) {
      return [];
    }
    const fields = value
      .filter((row): row is unknown[] => Array.isArray(row) && row.length > 0)
      .map((row) => str(row[0]))
      .filter((field): field is string => Boolean(field));
    return [...new Set(fields)];
  };
  const added = tableFields(parsed.added);
  const removed = tableFields(parsed.removed);
  const rowChanged = tableFields(parsed.row_changed);
  if (!changed.length && !added.length && !removed.length && !rowChanged.length) {
    return undefined;
  }
  return { changed, added, removed, rowChanged };
}

export type TimelineTranslate = (key: string, options: { defaultValue: string } & Record<string, unknown>) => string;

/**
 * Display form of one side of a field change: value text, or an honest
 * placeholder — "(empty)" for a truly empty value, "(formatted content)"
 * for rich markup that strips to no text (never the raw tags).
 */
function changeSideLabel(text: string | undefined, rich: boolean | undefined, translate: TimelineTranslate): string {
  if (text !== undefined) {
    return text;
  }
  if (rich) {
    return translate('timeline.richContent', { defaultValue: '(formatted content)' });
  }
  return translate('timeline.emptyValue', { defaultValue: '(empty)' });
}

/**
 * Desk-parity version sentence: every changed field renders its old → new
 * values ("changed value of X from a to b"; multi-field changes list each
 * field's from/to). Child-table changes stay field lists ("added rows for
 * Z"). Values arrive pre-truncated and markup-stripped from
 * parseVersionData.
 */
export function versionSummary(version: ParsedVersionData, translate: TimelineTranslate): string {
  const parts: string[] = [];
  const fieldList = (fields: string[]) => fields.map(humanizeFieldname).join(', ');
  if (version.changed.length === 1) {
    const change = version.changed[0];
    parts.push(
      translate('timeline.changedValue', {
        defaultValue: 'changed value of {{field}} from {{from}} to {{to}}',
        field: humanizeFieldname(change.field),
        from: changeSideLabel(change.from, change.fromRich, translate),
        to: changeSideLabel(change.to, change.toRich, translate),
      }),
    );
  } else if (version.changed.length > 1) {
    // Desk shows each field's from → to; keep that honesty here instead of
    // collapsing to bare field names.
    const fragments = version.changed.map((change) =>
      translate('timeline.changedValueItem', {
        defaultValue: '{{field}} from {{from}} to {{to}}',
        field: humanizeFieldname(change.field),
        from: changeSideLabel(change.from, change.fromRich, translate),
        to: changeSideLabel(change.to, change.toRich, translate),
      }),
    );
    parts.push(
      translate('timeline.changedValues', {
        defaultValue: 'changed values for {{fields}}',
        fields: fragments.join(', '),
      }),
    );
  }
  if (version.added.length) {
    parts.push(
      translate('timeline.addedRows', {
        defaultValue: 'added rows for {{fields}}',
        fields: fieldList(version.added),
      }),
    );
  }
  if (version.removed.length) {
    parts.push(
      translate('timeline.removedRows', {
        defaultValue: 'removed rows for {{fields}}',
        fields: fieldList(version.removed),
      }),
    );
  }
  if (version.rowChanged.length) {
    parts.push(
      translate('timeline.changedRows', {
        defaultValue: 'changed rows for {{fields}}',
        fields: fieldList(version.rowChanged),
      }),
    );
  }
  return parts.join(', ');
}

// ── entry builders ─────────────────────────────────────────────────────────

function commentEntry(row: TimelineRowLike, options: BuildOptions): TimelineFeedEntry | undefined {
  const docname = str(row.name);
  if (!docname) {
    return undefined;
  }
  const html = str(row.content);
  return {
    id: `comment:${docname}`,
    type: 'comment',
    kind: 'comment',
    docname,
    ownerId: str(row.owner),
    ...authorFields(str(row.owner), options),
    ...timestampFields(row.creation),
    content: htmlToText(html),
    html,
    ...(row.__optimistic === true ? { pending: true } : {}),
  };
}

function versionEntry(row: TimelineRowLike, options: BuildOptions): TimelineFeedEntry | undefined {
  const docname = str(row.name);
  if (!docname) {
    return undefined;
  }
  return {
    id: `version:${docname}`,
    type: 'version',
    kind: 'version',
    docname,
    ownerId: str(row.owner),
    ...authorFields(str(row.owner), options),
    ...timestampFields(row.creation),
    version: parseVersionData(row.data),
  };
}

function communicationEntry(
  row: TimelineRowLike,
  kind: 'communication' | 'automated',
  options: BuildOptions,
): TimelineFeedEntry | undefined {
  const docname = str(row.name);
  if (!docname) {
    return undefined;
  }
  const sender = str(row.sender) ?? str(row.owner);
  const fields = authorFields(sender, options);
  return {
    id: `${kind}:${docname}`,
    type: 'info',
    kind,
    docname,
    ownerId: sender,
    ...fields,
    // Communication rows carry their own display name; prefer it
    authorName: str(row.sender_full_name) ?? fields.authorName,
    ...timestampFields(row.communication_date ?? row.creation),
    subject: htmlToText(str(row.subject)),
    content: htmlToText(str(row.content)),
  };
}

function logEntry(
  row: TimelineRowLike,
  kind: 'assignment' | 'attachment' | 'like' | 'info',
  options: BuildOptions,
): TimelineFeedEntry | undefined {
  const docname = str(row.name);
  if (!docname) {
    return undefined;
  }
  const type: TimelineEntry['type'] =
    kind === 'assignment' ? 'assignment' : kind === 'attachment' ? 'attachment' : 'info';
  return {
    id: `${kind}:${docname}`,
    type,
    kind,
    docname,
    ownerId: str(row.owner),
    ...authorFields(str(row.owner), options),
    ...timestampFields(row.creation),
    content: htmlToText(str(row.content)),
  };
}

// ── public API ─────────────────────────────────────────────────────────────

/** Merge every docinfo activity stream into one newest-first feed. */
export function buildTimelineFeed(
  docinfo: TimelineDocinfoLike | undefined,
  options: BuildOptions = {},
): TimelineFeedEntry[] {
  if (!docinfo) {
    return [];
  }
  const entries: TimelineFeedEntry[] = [];
  const push = (entry: TimelineFeedEntry | undefined) => {
    if (entry) {
      entries.push(entry);
    }
  };
  for (const row of docinfo.comments ?? []) {
    push(commentEntry(row, options));
  }
  for (const row of docinfo.versions ?? []) {
    push(versionEntry(row, options));
  }
  for (const row of docinfo.communications ?? []) {
    push(communicationEntry(row, 'communication', options));
  }
  for (const row of docinfo.automated_messages ?? []) {
    push(communicationEntry(row, 'automated', options));
  }
  for (const row of docinfo.assignment_logs ?? []) {
    push(logEntry(row, 'assignment', options));
  }
  for (const row of docinfo.attachment_logs ?? []) {
    push(logEntry(row, 'attachment', options));
  }
  for (const row of docinfo.like_logs ?? []) {
    push(logEntry(row, 'like', options));
  }
  for (const row of docinfo.info_logs ?? []) {
    push(logEntry(row, 'info', options));
  }
  return entries.sort((a, b) => b.epoch - a.epoch);
}

/** Apply the All / Comments / Edits filter tabs. */
export function filterTimelineFeed(entries: TimelineFeedEntry[], filter: TimelineFilterValue): TimelineFeedEntry[] {
  if (filter === 'comments') {
    return entries.filter((entry) => entry.kind === 'comment');
  }
  if (filter === 'edits') {
    return entries.filter((entry) => entry.kind === 'version');
  }
  return entries;
}
