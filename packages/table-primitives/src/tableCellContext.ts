/**
 * TableCellContext — shared between table-primitives and forms.
 *
 * Forms re-exports this context so field components can detect table cells
 * and use chromeless rendering.
 */

import { createContext, useContext } from 'react';

export interface TableCellContextValue {
  /** Whether the component is rendered inside a table cell */
  inTableCell: boolean;
  /** Whether the cell is in a header row */
  isHeader?: boolean;
  /** Whether the cell is editable */
  editable?: boolean;
}

const defaultValue: TableCellContextValue = {
  inTableCell: false,
  isHeader: false,
  editable: false,
};

export const TableCellContext = createContext<TableCellContextValue>(defaultValue);

export function useTableCellContext(): TableCellContextValue {
  return useContext(TableCellContext);
}

export function useIsInTableCell(): boolean {
  const { inTableCell } = useTableCellContext();
  return inTableCell;
}
