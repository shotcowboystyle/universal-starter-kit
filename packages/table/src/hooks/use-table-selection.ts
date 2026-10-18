import type { RowSelectionState } from '@tanstack/react-table';
import { useCallback, useState } from 'react';

export interface UseTableSelectionOptions {
  initialSelection?: RowSelectionState;
  onSelectionChange?: (selection: RowSelectionState) => void;
}

export interface UseTableSelectionReturn {
  rowSelection: RowSelectionState;
  setRowSelection: React.Dispatch<React.SetStateAction<RowSelectionState>>;
  selectedRows: string[];
  selectAll: (rowIds: string[]) => void;
  clearSelection: () => void;
}

export const useTableSelection = ({
  initialSelection = {},
  onSelectionChange,
}: UseTableSelectionOptions = {}): UseTableSelectionReturn => {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>(initialSelection);

  const updateRowSelection: React.Dispatch<React.SetStateAction<RowSelectionState>> = useCallback(
    (updater) => {
      setRowSelection((prev) => {
        // oxlint-disable-next-line anti-slop/no-runtime-typeof -- React SetStateAction is either a value or an updater function; typeof is the only discriminant
        const next = typeof updater === 'function' ? updater(prev) : updater;
        onSelectionChange?.(next);
        return next;
      });
    },
    [onSelectionChange],
  );

  const selectedRows: string[] = [];
  for (const [id, selected] of Object.entries(rowSelection)) {
    if (selected) {
      selectedRows.push(id);
    }
  }

  const selectAll = useCallback(
    (rowIds: string[]) => {
      const next: RowSelectionState = {};
      for (const id of rowIds) {
        next[id] = true;
      }
      setRowSelection(next);
      onSelectionChange?.(next);
    },
    [onSelectionChange],
  );

  const clearSelection = useCallback(() => {
    setRowSelection({});
    onSelectionChange?.({});
  }, [onSelectionChange]);

  return {
    rowSelection,
    setRowSelection: updateRowSelection,
    selectedRows,
    selectAll,
    clearSelection,
  };
};
