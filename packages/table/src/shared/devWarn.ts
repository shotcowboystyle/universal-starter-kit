/**
 * Table DEV guardrails — same shape as the `@repo/theme` §5
 * catalog (`devWarn` / `warnBareDisabled` / `warnSizeRecipeEscape`): a
 * module-level seen set, a `NODE_ENV === "production"` no-op, and helpers
 * called inline during render.
 *
 * The prefix is `[table]`, not `[theme]`: the codes here are table-local and
 * the story-hygiene harvester (`p-results/story-hygiene/verify.mjs`) collects
 * on the `[theme]` prefix.
 */

import type { DataTableProps } from '../types';

export type TableDevWarnCode =
  /**
   * A column declares a width (`width` or TanStack `size`) that the resolved
   * `columnLayout` discards before it reaches the cell box.
   */
  'column-width-ignored';

export interface TableDevWarnDetail {
  component?: string;
  id?: string;
  columns?: string;
  columnLayout?: string;
  suggest?: string;
}

const seen = new Set<string>();

function isDev(): boolean {
  return process.env.NODE_ENV !== 'production';
}

/** Emit a once-per-key console warning in non-production builds. */
export function tableDevWarn(code: TableDevWarnCode, detail: TableDevWarnDetail = {}): void {
  if (!isDev()) {
    return;
  }
  const key = [code, detail.component ?? '', detail.id ?? '', detail.columns ?? ''].join(':');
  if (seen.has(key)) {
    return;
  }
  seen.add(key);
  const bits = [
    detail.component ? `component=${detail.component}` : undefined,
    detail.id ? `id=${detail.id}` : undefined,
    detail.columns ? `columns=${detail.columns}` : undefined,
    detail.columnLayout ? `columnLayout=${detail.columnLayout}` : undefined,
    detail.suggest ? `suggest=${detail.suggest}` : undefined,
  ].filter(Boolean);
  const suffix = bits.length ? ` (${bits.join(', ')})` : '';
  console.warn(`[table] ${code}${suffix}`);
}

/** @internal test helper */
export function __resetTableDevWarnSeen(): void {
  seen.clear();
}

interface WidthBearingColumn {
  id?: unknown;
  accessorKey?: unknown;
  width?: unknown;
  size?: unknown;
}

function columnKey(column: WidthBearingColumn, index: number): string {
  if (typeof column.id === 'string' && column.id) {
    return column.id;
  }
  if (typeof column.accessorKey === 'string' && column.accessorKey) {
    return column.accessorKey;
  }
  return `#${index}`;
}

/**
 * MPO-236 — `columnLayout: "equal"` (the default) flexes every column to the
 * same width, so a per-column `width` / `size` never reaches the cell box and
 * the render is byte-identical to one with no widths at all.
 *
 * `enableColumnResizing` is the exemption: it swaps the cell flex to
 * `flexBasis: "auto"`, under which a declared width does survive.
 */
export function warnColumnWidthIgnored(args: {
  columnLayout?: DataTableProps['columnLayout'];
  enableColumnResizing?: boolean;
  columns: readonly WidthBearingColumn[];
  component?: string;
}): void {
  if (!isDev()) {
    return;
  }
  if (args.columnLayout !== 'equal' || args.enableColumnResizing) {
    return;
  }
  const offenders = args.columns
    .map((column, index) => ({ column, index }))
    .filter(({ column }) => typeof column.width === 'number' || typeof column.size === 'number')
    .map(({ column, index }) => columnKey(column, index));
  if (!offenders.length) {
    return;
  }
  tableDevWarn('column-width-ignored', {
    component: args.component ?? 'DataTable',
    columns: offenders.join(','),
    columnLayout: 'equal',
    suggest: 'columnLayout="auto" or "scroll", or enableColumnResizing',
  });
}
