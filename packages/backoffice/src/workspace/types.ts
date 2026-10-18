/**
 * Frappe Workspace doc shapes — verified against a real bench
 * (`GET /api/resource/Workspace/<name>`; see WorkspaceScreen for the
 * rendering contract). `content` is an editorjs-style JSON string of
 * blocks; the child tables hold the referenced widget definitions.
 */

/** One row of the `shortcuts` child table (doctype "Workspace Shortcut"). */
export interface WorkspaceShortcutRow {
  name: string;
  /** "DocType" | "Report" | "Page" | "Dashboard" | "URL" */
  type: string;
  link_to?: string;
  /** URL shortcuts put the target here. */
  url?: string;
  label: string;
  /** Optional list-view variant, e.g. "List" | "Tree" | "Report Builder". */
  doc_view?: string;
  /** Frappe color name for the count pill, e.g. "Grey", "Blue". */
  color?: string;
  /** JSON filters for the live count, e.g. `{"status":"Open"}`. */
  stats_filter?: string;
  /** Count display template, `{}` is the count, e.g. `"{} Open"`. */
  format?: string;
}

/** One row of the `links` child table (doctype "Workspace Link"). */
export interface WorkspaceLinkRow {
  name: string;
  /** "Card Break" starts a link group; "Link" is a member of the group. */
  // oxlint-disable-next-line typescript/no-redundant-type-constituents -- the literals document the known row types; string keeps unknown ones
  type: 'Card Break' | 'Link' | string;
  label: string;
  /** "DocType" | "Report" | "Page" — only on type "Link". */
  link_type?: string;
  link_to?: string;
  hidden?: number;
  onboard?: number;
  is_query_report?: number;
  /** On Card Break rows: number of links desk shows before "+ N more". */
  link_count?: number;
  dependencies?: string;
}

/** One row of the `charts` child table (doctype "Workspace Chart"). */
export interface WorkspaceChartRow {
  name: string;
  /** Dashboard Chart doc name. */
  chart_name: string;
  label?: string;
}

/** One row of the `number_cards` child table (doctype "Workspace Number Card"). */
export interface WorkspaceNumberCardRow {
  name: string;
  /** Number Card doc name. */
  number_card_name: string;
  label?: string;
}

/** One row of the `quick_lists` child table (doctype "Workspace Quick List"). */
export interface WorkspaceQuickListRow {
  name: string;
  document_type: string;
  label?: string;
  /** JSON filters, e.g. `{"status":["=","Open"]}`. */
  quick_list_filter?: string;
}

/** The Workspace document (fields the workspace page renders). */
export interface WorkspaceDoc {
  name: string;
  doctype: string;
  title?: string;
  label?: string;
  icon?: string;
  module?: string;
  public?: number;
  is_hidden?: number;
  /** JSON string of editorjs-style blocks. */
  content?: string;
  shortcuts?: WorkspaceShortcutRow[];
  links?: WorkspaceLinkRow[];
  charts?: WorkspaceChartRow[];
  number_cards?: WorkspaceNumberCardRow[];
  quick_lists?: WorkspaceQuickListRow[];
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- a Frappe doc carries any number of extra fields
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Parsed `content` blocks
// ---------------------------------------------------------------------------

export type WorkspaceBlockType =
  | 'header'
  | 'paragraph'
  | 'shortcut'
  | 'card'
  | 'chart'
  | 'number_card'
  | 'quick_list'
  | 'spacer'
  | 'onboarding'
  // oxlint-disable-next-line typescript/ban-types -- `string & {}` keeps the literal autocomplete while admitting unknown block types
  | (string & {});

export interface WorkspaceBlock {
  id: string;
  type: WorkspaceBlockType;
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- editorjs block data carries tool-specific extra fields
  data: {
    /** header / paragraph: HTML-ish rich text. */
    text?: string;
    /** shortcut: matches `shortcuts[].label`. */
    shortcut_name?: string;
    /** card: matches a Card Break `links[].label`. */
    card_name?: string;
    /** chart: matches `charts[].chart_name`. */
    chart_name?: string;
    /** number_card: matches `number_cards[].number_card_name`. */
    number_card_name?: string;
    /** quick_list: matches `quick_lists[].document_type`. */
    quick_list_name?: string;
    /** 12-column grid span (3 = shortcut pill, 4 = card, 12 = full row). */
    col?: number;
    [key: string]: unknown;
  };
}

/** A Card Break row grouped together with its following Link rows. */
export interface WorkspaceLinkGroup {
  label: string;
  breakRow: WorkspaceLinkRow;
  links: WorkspaceLinkRow[];
}

/** Frappe filter triple, ready for the frappe client (`[field, op, value]`). */
export type FrappeFilterTuple = [string, string, unknown];
