/**
 * Row accumulator — a column that is a function of every row BEFORE it
 * (MPO-250).
 *
 * A running balance is the canonical case, and it is the default column in
 * the oldest data view there is: every register, statement, ledger,
 * reconciliation and audit trail needs one. It is a FOLD over the rows in a
 * total order, and the value on row N depends on rows 1..N-1, so it has to be
 * computed before the table paginates, sorts or filters — otherwise page two
 * starts from zero and a sort by payee scrambles every figure on screen.
 *
 * A column `cell` renderer sees ONE row and never the rows before it, so this
 * is a separate seam: the table folds the whole row set once, merges the
 * derived fields onto each row, and hands the finished rows to the row model.
 * Everything downstream (filter, sort, group, paginate) then operates on rows
 * that already carry the derived value.
 *
 * ─── The ordering contract ────────────────────────────────────────────────
 *
 * 1. The fold runs over the FULL row set the table was handed, before
 *    filtering, sorting and pagination. In infinite/loader mode that is the
 *    pages loaded so far, not the whole server-side table.
 *
 * 2. `order` establishes the fold order, and the rows come out IN it — a fold
 *    order is the order the derived column reads down, so it is also the
 *    table's default row order. Omit `order` and the rows fold in the order
 *    they arrived (typically the server's `order_by`).
 *
 * 3. When the user sorts on ANOTHER column, the table reorders rows for
 *    display and does NOT refold. The derived value stays attached to its row
 *    and keeps meaning "the fold value at this row's position in the fold
 *    order". So a running balance under a payee sort is still a correct
 *    per-row figure, but it no longer reads down the column as a progression.
 *    That is deliberate: recomputing a running balance in payee order would
 *    produce a number that means nothing. Say so in the column header, or
 *    mark the derived column `sortable: false` and let the reader sort
 *    elsewhere.
 *
 * 4. Filtering hides rows without refolding. A balance on a visible row still
 *    counts the rows the filter hid — which is what a statement filter does,
 *    and the only answer that stays consistent with the account's real total.
 *
 * 5. Server-side mode (`manualPagination`) folds only the page the server
 *    sent, because that is the only row set the client has. A running balance
 *    over a server-paginated table therefore needs the server to send the
 *    running figure, or the table to hold every row. The fold cannot invent
 *    rows it was never given.
 *
 * ─── Totals ───────────────────────────────────────────────────────────────
 *
 * `total` reads the finished accumulator once, after every row. Its result is
 * published on the table state as `computed.foldTotal`, which a column's
 * TanStack `footer` renderer reads through `useDataTableState()` — the table
 * already renders a footer row whenever any column defines `footer`, so a
 * total row needs no new chrome. Same fold, read once at the end.
 */

import type { DataTableData } from '../types';

/**
 * A fold over the ordered row set, run once before the table's row model.
 *
 * The object must be a STABLE reference (module constant or `useMemo`) — the
 * fold re-runs and produces new row objects whenever its identity changes,
 * the same contract `loadPage` and `getSubRows` already carry.
 *
 * @typeParam TData - The row type
 * @typeParam TAcc - The accumulator carried between rows
 */
export interface RowAccumulator<TData extends DataTableData = DataTableData, TAcc = any> {
  /**
   * Seed value. Pass a factory when the seed is mutable, so one accumulator
   * object can be reused across folds without leaking state between them.
   */
  initial: TAcc | (() => TAcc);
  /** Fold step: the accumulator so far, this row, its index in fold order. */
  reduce: (accumulator: TAcc, row: TData, index: number) => TAcc;
  /**
   * Fields merged onto the row from the accumulator AFTER this row has been
   * folded in. Declare them on the row type so a column can name one in
   * `accessorKey`. Return `{}` (or nothing) to leave the row untouched.
   */
  derive: (accumulator: TAcc, row: TData, index: number) => Record<string, unknown> | undefined;
  /**
   * Comparator establishing the fold order. The rows come out in this order —
   * see the ordering contract above. Omit to fold in the incoming order.
   */
  order?: (a: TData, b: TData) => number;
  /**
   * Read the finished accumulator once, after every row. Published as
   * `computed.foldTotal` for a footer cell.
   */
  total?: (accumulator: TAcc, rowCount: number) => unknown;
}

export interface RowAccumulatorResult<TData> {
  /** Rows in fold order, each carrying its derived fields. */
  rows: TData[];
  /** `total(finalAccumulator, rowCount)`, or undefined when no `total`. */
  total: unknown;
}

/**
 * Run a {@link RowAccumulator} over rows.
 *
 * Returns the input array untouched (same identity) when there is no
 * accumulator, so a table without a fold pays nothing and its row model is
 * not invalidated.
 */
export function accumulateRows<TData extends DataTableData>(
  data: TData[],
  accumulator?: RowAccumulator<TData>,
): RowAccumulatorResult<TData> {
  if (!accumulator) {
    return { rows: data, total: undefined };
  }

  const ordered = accumulator.order ? [...data].sort(accumulator.order) : data;

  let carried =
    typeof accumulator.initial === 'function' ? (accumulator.initial as () => unknown)() : accumulator.initial;

  const rows = ordered.map((row, index) => {
    carried = accumulator.reduce(carried, row, index);
    const derived = accumulator.derive(carried, row, index);
    // Nothing derived for this row — keep the original object so identity
    // (and therefore TanStack's row cache) survives.
    if (!derived) {
      return row;
    }
    return { ...row, ...derived } as TData;
  });

  return {
    rows,
    total: accumulator.total ? accumulator.total(carried, rows.length) : undefined,
  };
}
