/**
 * Pure parsing helpers for the Workspace `content` block JSON and the
 * JSON filter strings carried by shortcuts / quick lists / number cards.
 * No DOM: HTML in header/paragraph blocks is stripped with a regex-based
 * text extractor so this runs on native and gjs too.
 */
import type { FrappeFilterTuple, WorkspaceBlock, WorkspaceDoc, WorkspaceLinkGroup, WorkspaceLinkRow } from './types';

/** Parse the workspace `content` JSON string into blocks (bad JSON → []). */
export function parseWorkspaceContent(content: string | undefined | null): WorkspaceBlock[] {
  if (!content) {
    return [];
  }
  try {
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(
      (block): block is WorkspaceBlock => !!block && typeof block === 'object' && typeof block.type === 'string',
    );
  } catch {
    return [];
  }
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/**
 * Extract plain text from desk's rich-text wrappers, e.g.
 * `<span class="h4"><b>Reports &amp; Masters</b></span>` → "Reports & Masters".
 */
export function stripHtml(html: string | undefined | null): string {
  if (!html) {
    return '';
  }
  const withoutTags = html.replaceAll(/<br\s*\/?>/gi, '\n').replaceAll(/<[^>]*>/g, '');
  return withoutTags
    .replaceAll(/&(#[xX]?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
      if (entity.startsWith('#x') || entity.startsWith('#X')) {
        const code = Number.parseInt(entity.slice(2), 16);
        return Number.isNaN(code) ? match : String.fromCodePoint(code);
      }
      if (entity.startsWith('#')) {
        const code = Number.parseInt(entity.slice(1), 10);
        return Number.isNaN(code) ? match : String.fromCodePoint(code);
      }
      return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
    })
    .trim();
}

/**
 * Heading level from a desk header block's HTML wrapper: `class="h4"` →
 * 4. Desk also emits raw font-size styles (Build workspace uses
 * `font-size: 18px`); those and unclassed headers fall back to 4 — the
 * visual scale desk uses for workspace section headings.
 */
export function headerLevel(html: string | undefined | null): 1 | 2 | 3 | 4 | 5 | 6 {
  const match = /class="[^"]*\bh([1-6])\b[^"]*"/.exec(html ?? '');
  if (match) {
    return Number(match[1]) as 1 | 2 | 3 | 4 | 5 | 6;
  }
  return 4;
}

/**
 * Group the flat `links` child table into cards: each "Card Break" row
 * opens a group that collects the following "Link" rows (hidden rows are
 * dropped). Link rows before any Card Break are ignored — desk does the
 * same (they are unreachable from card blocks).
 */
export function groupLinks(links: WorkspaceLinkRow[] | undefined): WorkspaceLinkGroup[] {
  const groups: WorkspaceLinkGroup[] = [];
  let current: WorkspaceLinkGroup | undefined;
  for (const row of links ?? []) {
    if (row.type === 'Card Break') {
      // A hidden Card Break hides its whole card: close the current group so
      // its following Link rows are dropped, not leaked into the prior card.
      if (row.hidden) {
        current = undefined;
        continue;
      }
      current = { label: row.label, breakRow: row, links: [] };
      groups.push(current);
    } else if (row.type === 'Link' && current && !row.hidden) {
      current.links.push(row);
    }
  }
  return groups;
}

/**
 * Case-insensitive filter over a link group: a match on the group label
 * keeps the whole card; otherwise the card narrows to its matching links
 * (and disappears when none match).
 */
export function filterLinkGroup(group: WorkspaceLinkGroup, query: string): WorkspaceLinkGroup | undefined {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return group;
  }
  if (group.label.toLowerCase().includes(needle)) {
    return group;
  }
  const links = group.links.filter((row) => row.label.toLowerCase().includes(needle));
  return links.length > 0 ? { ...group, links } : undefined;
}

/**
 * Desk Card Break `link_count`: how many links to show before "+ N more".
 * Filter path passes collapse=false so matching rows are never hidden.
 */
export function collapseLinkRows(
  links: WorkspaceLinkRow[],
  linkCount: number | undefined,
  options: { collapse: boolean; expanded: boolean },
): { shown: WorkspaceLinkRow[]; hiddenCount: number; showMore: boolean } {
  const canCollapse = options.collapse && typeof linkCount === 'number' && linkCount > 0 && links.length > linkCount;
  const shown = canCollapse && !options.expanded ? links.slice(0, linkCount) : links;
  const hiddenCount = canCollapse ? links.length - linkCount : 0;
  return { shown, hiddenCount, showMore: canCollapse && hiddenCount > 0 };
}

/**
 * Normalize a frappe JSON filter string to `[field, op, value]` triples.
 * Real-world shapes (all seen on the control bench):
 * - dict: `{"status":"Open"}` → `[["status","=","Open"]]`
 * - dict of tuples: `{"status":["=","Open"]}` → `[["status","=","Open"]]`
 * - list of triples: `[["enabled","=",1]]` → as-is
 * - list of quads (doctype-prefixed, Number Card `filters_json`):
 *   `[["User","enabled","=",1]]` → doctype element stripped.
 */
export function parseFrappeFilters(raw: string | undefined | null): FrappeFilterTuple[] | undefined {
  if (!raw) {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (Array.isArray(parsed)) {
    const tuples: FrappeFilterTuple[] = [];
    for (const entry of parsed) {
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
    return tuples.length > 0 ? tuples : undefined;
  }
  if (parsed && typeof parsed === 'object') {
    const tuples: FrappeFilterTuple[] = [];
    for (const [field, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(value) && value.length === 2 && typeof value[0] === 'string') {
        tuples.push([field, value[0], value[1]]);
      } else {
        tuples.push([field, '=', value]);
      }
    }
    return tuples.length > 0 ? tuples : undefined;
  }
  return undefined;
}

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

const DATA_BLOCK_RANK: Record<string, number> = { number_card: 0, chart: 1, quick_list: 2 };

function isDataBlock(block: WorkspaceBlock): boolean {
  return block.type in DATA_BLOCK_RANK;
}

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
export function composeWorkspaceBlocks(blocks: WorkspaceBlock[]): WorkspaceComposition {
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
    } else if (block.type === 'header') {
      let labelsWidgets = false;
      for (const following of blocks.slice(index + 1)) {
        if (following.type === 'header') {
          break;
        }
        if (following.type === 'paragraph' || following.type === 'spacer') {
          continue;
        }
        labelsWidgets = true;
        break;
      }
      if (!labelsWidgets) {
        text.push(block);
      }
    }
    // spacer / onboarding / custom_block / unknown — dropped (see module doc).
  }

  // Stable class ordering: number cards → charts → quick lists.
  const data = dataBlocks
    .map((block, index) => ({ block, index }))
    .sort((a, b) => (DATA_BLOCK_RANK[a.block.type] ?? 0) - (DATA_BLOCK_RANK[b.block.type] ?? 0) || a.index - b.index)
    .map(({ block }) => block);

  return { data, shortcuts, cards, text };
}

/** Find a workspace shortcut row by a shortcut block's `shortcut_name`. */
export function findShortcut(doc: WorkspaceDoc, shortcutName: string | undefined) {
  if (!shortcutName) {
    return;
  }
  return doc.shortcuts?.find((row) => row.label === shortcutName);
}

/** Find a link group by a card block's `card_name`. */
export function findLinkGroup(groups: WorkspaceLinkGroup[], cardName: string | undefined) {
  if (!cardName) {
    return;
  }
  return groups.find((group) => group.label === cardName);
}
