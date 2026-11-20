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

const isDev = (): boolean => process.env.NODE_ENV !== 'production';

/** Emit a once-per-key console warning in non-production builds. */
export const tableDevWarn = (code: TableDevWarnCode, detail: TableDevWarnDetail = {}): void => {
  if (!isDev()) {
    return;
  }
  const key = [code, detail.component ?? '', detail.id ?? '', detail.columns ?? ''].join(':');
  if (seen.has(key)) {
    return;
  }
  seen.add(key);
  const bits: string[] = [];
  for (const [name, value] of [
    ['component', detail.component],
    ['id', detail.id],
    ['columns', detail.columns],
    ['columnLayout', detail.columnLayout],
    ['suggest', detail.suggest],
  ] as const) {
    if (value !== undefined && value !== '') {
      bits.push(`${name}=${value}`);
    }
  }
  const suffix = bits.length > 0 ? ` (${bits.join(', ')})` : '';
  console.warn(`[table] ${code}${suffix}`);
};

/** Test helper. @internal */
// oxlint-disable-next-line sonarjs/function-name, sonarjs/variable-name -- exported double-underscore test-helper name consumed by DataTable tests
export const __resetTableDevWarnSeen = (): void => {
  seen.clear();
};

interface WidthBearingColumn {
  id?: unknown;
  accessorKey?: unknown;
  width?: unknown;
  size?: unknown;
}

const columnKey = (column: WidthBearingColumn, index: number): string => {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- column defs are loosely typed user config; only a non-empty string id is a usable key
  if (typeof column.id === 'string' && column.id !== '') {
    return column.id;
  }
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- accessorKey may be a non-string in loosely typed column defs; only a non-empty string is a usable key
  if (typeof column.accessorKey === 'string' && column.accessorKey !== '') {
    return column.accessorKey;
  }
  return `#${index}`;
};

/**
 * MPO-236 — `columnLayout: "equal"` (the default) flexes every column to the
 * same width, so a per-column `width` / `size` never reaches the cell box and
 * the render is byte-identical to one with no widths at all.
 *
 * `enableColumnResizing` is the exemption: it swaps the cell flex to
 * `flexBasis: "auto"`, under which a declared width does survive.
 */
export const warnColumnWidthIgnored = (args: {
  columnLayout?: DataTableProps['columnLayout'];
  enableColumnResizing?: boolean;
  columns: readonly WidthBearingColumn[];
  component?: string;
}): void => {
  if (!isDev()) {
    return;
  }
  if (args.columnLayout !== 'equal' || args.enableColumnResizing) {
    return;
  }
  const offenders: string[] = [];
  for (const [index, column] of args.columns.entries()) {
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- width/size are loosely typed column config; only a numeric width is a declared width
    if (typeof column.width === 'number' || typeof column.size === 'number') {
      offenders.push(columnKey(column, index));
    }
  }
  if (offenders.length === 0) {
    return;
  }
  tableDevWarn('column-width-ignored', {
    component: args.component ?? 'DataTable',
    columns: offenders.join(','),
    columnLayout: 'equal',
    suggest: 'columnLayout="auto" or "scroll", or enableColumnResizing',
  });
};
