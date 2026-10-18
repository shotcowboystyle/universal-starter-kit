/**
 * Pure parsing helpers for the Workspace `content` block JSON and the
 * JSON filter strings carried by shortcuts / quick lists / number cards.
 * No DOM: HTML in header/paragraph blocks is stripped with a regex-based
 * text extractor so this runs on native and gjs too.
 */
import type { FrappeFilterTuple, WorkspaceBlock, WorkspaceDoc, WorkspaceLinkGroup, WorkspaceLinkRow } from './types';

/** Parse the workspace `content` JSON string into blocks (bad JSON → []). */
/** I/O boundary guard: an editorjs block is an object with a string `type`. */
const isWorkspaceBlock = (value: unknown): value is WorkspaceBlock =>
  typeof value === 'object' && value !== null && 'type' in value && typeof value.type === 'string';

export const parseWorkspaceContent = (content?: string | null): WorkspaceBlock[] => {
  if (content == null || content === '') {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(content);
    return Array.isArray(parsed) ? parsed.filter((block) => isWorkspaceBlock(block)) : [];
  } catch {
    // Safe to continue: malformed content renders as an empty workspace.
    return [];
  }
};

const NAMED_ENTITIES = new Map([
  ['amp', '&'],
  ['lt', '<'],
  ['gt', '>'],
  ['quot', '"'],
  ['apos', "'"],
  ['nbsp', ' '],
]);

const BR_TAG = /<br\s*\/?>/giu;
// oxlint-disable-next-line sonarjs/super-linear-regex -- input is a short desk header/paragraph wrapper, not arbitrary user HTML
const ANY_TAG = /<[^>]*>/gu;
const HTML_ENTITY = /&(?<entity>#[xX]?[0-9a-fA-F]+|[a-zA-Z]+);/gu;
const HEADER_CLASS = /class="[^"]*\bh(?<level>[1-6])\b[^"]*"/u;

/**
 * Extract plain text from desk's rich-text wrappers, e.g.
 * `<span class="h4"><b>Reports &amp; Masters</b></span>` → "Reports & Masters".
 */
export const stripHtml = (html?: string | null): string => {
  if (html == null || html === '') {
    return '';
  }
  const withoutTags = html.replaceAll(BR_TAG, '\n').replaceAll(ANY_TAG, '');
  return withoutTags
    .replaceAll(HTML_ENTITY, (match, entity: string) => {
      if (entity.startsWith('#x') || entity.startsWith('#X')) {
        const code = Number.parseInt(entity.slice(2), 16);
        return Number.isNaN(code) ? match : String.fromCodePoint(code);
      }
      if (entity.startsWith('#')) {
        // oxlint-disable-next-line unicorn/prefer-number-coercion -- lenient: keeps the leading digits of a malformed entity
        const code = Number.parseInt(entity.slice(1), 10);
        return Number.isNaN(code) ? match : String.fromCodePoint(code);
      }
      return NAMED_ENTITIES.get(entity.toLowerCase()) ?? match;
    })
    .trim();
};

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Heading level from a desk header block's HTML wrapper: `class="h4"` →
 * 4. Desk also emits raw font-size styles (Build workspace uses
 * `font-size: 18px`); those and unclassed headers fall back to 4 — the
 * visual scale desk uses for workspace section headings.
 */
export const headerLevel = (html?: string | null): HeadingLevel => {
  const level = HEADER_CLASS.exec(html ?? '')?.groups?.level;
  // SAFETY: HEADER_CLASS only captures a single digit in [1-6].
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see the SAFETY note above
  return level === undefined ? 4 : (Number(level) as HeadingLevel);
};

/**
 * Group the flat `links` child table into cards: each "Card Break" row
 * opens a group that collects the following "Link" rows (hidden rows are
 * dropped). Link rows before any Card Break are ignored — desk does the
 * same (they are unreachable from card blocks).
 */
export const groupLinks = (links?: WorkspaceLinkRow[]): WorkspaceLinkGroup[] => {
  const groups: WorkspaceLinkGroup[] = [];
  let current: WorkspaceLinkGroup | null = null;
  for (const row of links ?? []) {
    const isHidden = (row.hidden ?? 0) !== 0;
    if (row.type === 'Card Break') {
      // A hidden Card Break hides its whole card: close the current group so
      // its following Link rows are dropped, not leaked into the prior card.
      current = isHidden ? null : { label: row.label, breakRow: row, links: [] };
      if (current !== null) {
        groups.push(current);
      }
    } else if (row.type === 'Link' && current !== null && !isHidden) {
      current.links.push(row);
    }
  }
  return groups;
};

/**
 * Case-insensitive filter over a link group: a match on the group label
 * keeps the whole card; otherwise the card narrows to its matching links
 * (and disappears when none match).
 */
export const filterLinkGroup = (group: WorkspaceLinkGroup, query: string): WorkspaceLinkGroup | undefined => {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return group;
  }
  if (group.label.toLowerCase().includes(needle)) {
    return group;
  }
  const links = group.links.filter((row) => row.label.toLowerCase().includes(needle));
  return links.length > 0 ? { ...group, links } : undefined;
};

/**
 * Desk Card Break `link_count`: how many links to show before "+ N more".
 * Filter path passes collapse=false so matching rows are never hidden.
 */
export interface CollapsedLinkRows {
  shown: WorkspaceLinkRow[];
  hiddenCount: number;
  showMore: boolean;
}

export const collapseLinkRows = (
  links: WorkspaceLinkRow[],
  linkCount: number | undefined,
  options: { collapse: boolean; expanded: boolean },
): CollapsedLinkRows => {
  const canCollapse = options.collapse && linkCount !== undefined && linkCount > 0 && links.length > linkCount;
  const shown = canCollapse && !options.expanded ? links.slice(0, linkCount) : links;
  const hiddenCount = canCollapse ? links.length - linkCount : 0;
  return { shown, hiddenCount, showMore: canCollapse && hiddenCount > 0 };
};

/** List of triples, or doctype-prefixed quads (the doctype element is dropped). */
const tuplesFromList = (entries: unknown[]): FrappeFilterTuple[] => {
  const tuples: FrappeFilterTuple[] = [];
  for (const entry of entries) {
    if (!Array.isArray(entry)) {
      continue;
    }
    if (entry.length >= 4) {
      // [doctype, field, op, value] — drop the doctype element.
      tuples.push([String(entry[1]), String(entry[2]), entry[3]]);
    } else if (entry.length === 3) {
      tuples.push([String(entry[0]), String(entry[1]), entry[2]]);
    }
  }
  return tuples;
};

/** Dict of values (`=`) or of `[op, value]` pairs. */
const tuplesFromDict = (entries: [string, unknown][]): FrappeFilterTuple[] => {
  const tuples: FrappeFilterTuple[] = [];
  for (const [field, value] of entries) {
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- parses the untrusted filter JSON at its boundary
    if (Array.isArray(value) && value.length === 2 && typeof value[0] === 'string') {
      tuples.push([field, value[0], value[1]]);
    } else {
      tuples.push([field, '=', value]);
    }
  }
  return tuples;
};

/**
 * Normalize a frappe JSON filter string to `[field, op, value]` triples.
 * Real-world shapes (all seen on the control bench):
 * - dict: `{"status":"Open"}` → `[["status","=","Open"]]`
 * - dict of tuples: `{"status":["=","Open"]}` → `[["status","=","Open"]]`
 * - list of triples: `[["enabled","=",1]]` → as-is
 * - list of quads (doctype-prefixed, Number Card `filters_json`):
 *   `[["User","enabled","=",1]]` → doctype element stripped.
 */
export const parseFrappeFilters = (raw?: string | null): FrappeFilterTuple[] | undefined => {
  if (raw == null || raw === '') {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Safe to continue: an unparseable filter string means "no filters".
    return undefined;
  }
  let tuples: FrappeFilterTuple[] = [];
  if (Array.isArray(parsed)) {
    tuples = tuplesFromList(parsed);
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- parses the untrusted filter JSON at its boundary
  } else if (typeof parsed === 'object' && parsed !== null) {
    tuples = tuplesFromDict(Object.entries(parsed));
  }
  return tuples.length > 0 ? tuples : undefined;
};

// ---------------------------------------------------------------------------
// Dashboard-first composition (MOD-11)
// ---------------------------------------------------------------------------

/**
 * Workspace blocks partitioned by class for the dashboard-first layout:
 * data widgets render first, then shortcuts, then the link-card directory.
 */
export interface WorkspaceComposition {
  /**
   * Live data widgets, ordered number cards → charts → quick lists
   * (authored order within each class).
   */
  data: WorkspaceBlock[];
  /** Shortcut blocks in authored order. */
  shortcuts: WorkspaceBlock[];
  /** Link-card blocks in authored order. */
  cards: WorkspaceBlock[];
  /**
   * Narrative content in authored order: paragraphs, plus headers that do
   * NOT label a widget run (see keep rule below). Section-label headers
   * ("Your Shortcuts", "Reports & Masters") are dropped — the recomposed
   * sections carry their own canonical headings.
   */
  text: WorkspaceBlock[];
}

const DATA_BLOCK_RANK = new Map([
  ['number_card', 0],
  ['chart', 1],
  ['quick_list', 2],
]);

const isDataBlock = (block: WorkspaceBlock): boolean => DATA_BLOCK_RANK.has(block.type);

/**
 * Whether the header at `index` labels a widget run: any block other than a
 * paragraph or spacer before the next header.
 */
const headerLabelsWidgets = (blocks: WorkspaceBlock[], index: number): boolean => {
  const following = blocks.slice(index + 1);
  const runEnd = following.findIndex((block) => block.type === 'header');
  const run = runEnd === -1 ? following : following.slice(0, runEnd);
  return run.some((block) => block.type !== 'paragraph' && block.type !== 'spacer');
};

/**
 * Partition parsed content blocks for the dashboard-first workspace layout
 * (data → shortcuts → link cards), instead of desk's authoring order.
 *
 * Header keep rule: a header labels the blocks that follow it up to the next
 * header. If that run contains any widget block (shortcut, card, chart,
 * number card, quick list, onboarding, custom block), the header is a section
 * label and is dropped; if the run holds only paragraphs (or nothing — e.g.
 * the text-only "Welcome Workspace"), the header is real content and is kept.
 * Spacers are dropped — section spacing owns the rhythm.
 */
export const composeWorkspaceBlocks = (blocks: WorkspaceBlock[]): WorkspaceComposition => {
  const shortcuts: WorkspaceBlock[] = [];
  const cards: WorkspaceBlock[] = [];
  const text: WorkspaceBlock[] = [];
  const dataBlocks: WorkspaceBlock[] = [];

  for (const [index, block] of blocks.entries()) {
    if (isDataBlock(block)) {
      dataBlocks.push(block);
    } else if (block.type === 'shortcut') {
      shortcuts.push(block);
    } else if (block.type === 'card') {
      cards.push(block);
    } else if (block.type === 'paragraph') {
      text.push(block);
    } else if (block.type === 'header' && !headerLabelsWidgets(blocks, index)) {
      text.push(block);
    }
    // spacer / onboarding / custom_block / unknown — dropped (see module doc).
  }

  // Stable class ordering: number cards → charts → quick lists.
  const data = dataBlocks
    .map((block, index) => ({ block, index }))
    // oxlint-disable-next-line unicorn/no-array-sort -- sorts a fresh copy; toSorted is not guaranteed on every Hermes runtime this ships to
    .sort(
      (a, b) =>
        (DATA_BLOCK_RANK.get(a.block.type) ?? 0) - (DATA_BLOCK_RANK.get(b.block.type) ?? 0) || a.index - b.index,
    )
    .map(({ block }) => block);

  return { data, shortcuts, cards, text };
};

/** Find a workspace shortcut row by a shortcut block's `shortcut_name`. */
export const findShortcut = (doc: WorkspaceDoc, shortcutName?: string) =>
  shortcutName === undefined || shortcutName === ''
    ? undefined
    : doc.shortcuts?.find((row) => row.label === shortcutName);

/** Find a link group by a card block's `card_name`. */
export const findLinkGroup = (groups: WorkspaceLinkGroup[], cardName?: string) =>
  cardName === undefined || cardName === '' ? undefined : groups.find((group) => group.label === cardName);
