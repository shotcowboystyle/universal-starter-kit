import type { ColumnPinningState } from '@tanstack/react-table';
import { useCallback, useState } from 'react';

export interface UseTableColumnPinningOptions {
  initialPinning?: ColumnPinningState;
}

export interface UseTableColumnPinningReturn {
  columnPinning: ColumnPinningState;
  setColumnPinning: React.Dispatch<React.SetStateAction<ColumnPinningState>>;
  pinColumn: (columnId: string, position: 'left' | 'right') => void;
  unpinColumn: (columnId: string) => void;
}

export const useTableColumnPinning = ({
  initialPinning = { left: [], right: [] },
}: UseTableColumnPinningOptions = {}): UseTableColumnPinningReturn => {
  const [columnPinning, setColumnPinning] = useState<ColumnPinningState>(initialPinning);

  const pinColumn = useCallback((columnId: string, position: 'left' | 'right') => {
    setColumnPinning((prev) => {
      const newState = { ...prev };
      newState.left = (prev.left ?? []).filter((id) => id !== columnId);
      newState.right = (prev.right ?? []).filter((id) => id !== columnId);

      if (position === 'left') {
        newState.left = [...newState.left, columnId];
      } else {
        newState.right = [...newState.right, columnId];
      }

      return newState;
    });
  }, []);

  const unpinColumn = useCallback((columnId: string) => {
    setColumnPinning((prev) => ({
      left: (prev.left ?? []).filter((id) => id !== columnId),
      right: (prev.right ?? []).filter((id) => id !== columnId),
    }));
  }, []);

  return {
    columnPinning,
    setColumnPinning,
    pinColumn,
    unpinColumn,
  };
};
