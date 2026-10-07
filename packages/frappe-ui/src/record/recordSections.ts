import type { ComponentType } from 'react';

/** A record's rows on one connection doctype, as tiles. */
export interface FrappeRecordRowsSection {
  kind: 'rows';
  /** A declared connection doctype. */
  doctype: string;
  /** The field each tile shows. */
  field: string;
  title?: string;
  description?: string;
  /** Tile order, ascending by each field in turn. */
  orderBy?: readonly string[];
  /** A truthy field marks the tile with a chip. */
  flag?: { field: string; label: string };
  /** A positive number on the row, as a chip. */
  detail?: { field: string; label: (value: number) => string };
  /** One collapsible group per value of a field, the first open. */
  groupBy?: { field: string; label: (value: string) => string };
  /** Shown when the record links no rows. */
  empty?: string;
}

/** A child table's numeric rows as bars on one fixed scale. */
export interface FrappeRecordBarsSection {
  kind: 'bars';
  /** Names the chart (`<slug>-<id>-chart`). */
  id: string;
  /** The child table field on the record. */
  table: string;
  /** The row field naming a bar. */
  label: string;
  /** The row field holding its number. */
  value: string;
  /** The shared ceiling, so bars compare across records. */
  max: number;
  /** Bar order by label value; the rest follow as they came. */
  order?: readonly string[];
  barLabel?: (key: string) => string;
  title: string;
  /** Names the sum shown above the chart. */
  totalLabel?: string;
  description?: string;
  empty?: string;
}

export type FrappeRecordSection = FrappeRecordRowsSection | FrappeRecordBarsSection;

/** One tab under a record's hero. */
export interface FrappeRecordTab {
  value: string;
  label: string;
  icon?: ComponentType<{ size?: number }>;
  /** A connection doctype whose row count badges the tab. */
  count?: string;
  sections: readonly FrappeRecordSection[];
}

/** "vine-whip" -> "vine whip": slug values read as words. */
export function slugWords(value: string): string {
  return value.replaceAll(/[-_]+/g, ' ');
}
