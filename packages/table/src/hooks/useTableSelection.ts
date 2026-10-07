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

export function useTableSelection({
  initialSelection = {},
  onSelectionChange,
}: UseTableSelectionOptions = {}): UseTableSelectionReturn {
  const [rowSelection, setRowSelectionState] = useState<RowSelectionState>(initialSelection);

  const setRowSelection: React.Dispatch<React.SetStateAction<RowSelectionState>> = useCallback(
    (updater) => {
      setRowSelectionState((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        onSelectionChange?.(next);
        return next;
      });
    },
    [onSelectionChange],
  );

  const selectedRows = Object.entries(rowSelection)
    .filter(([_, selected]) => selected)
    .map(([id]) => id);

  const selectAll = useCallback(
    (rowIds: string[]) => {
      const next: RowSelectionState = {};
      for (const id of rowIds) {
        next[id] = true;
      }
      setRowSelectionState(next);
      onSelectionChange?.(next);
    },
    [onSelectionChange],
  );

  const clearSelection = useCallback(() => {
    setRowSelectionState({});
    onSelectionChange?.({});
  }, [onSelectionChange]);

  return {
    rowSelection,
    setRowSelection,
    selectedRows,
    selectAll,
    clearSelection,
  };
}
