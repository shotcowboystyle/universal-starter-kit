/**
 * useTableKeyboard - keyboard navigation for table rows.
 *
 * Renamed from useDataTableKeyboard, keeping the same implementation.
 * Supports ArrowDown, ArrowUp, Home, End, PageDown, PageUp,
 * Enter, and Space key handlers.
 */

import type { Row, Table } from '@tanstack/react-table';
import { useCallback, useEffect, useRef, useState } from 'react';

const rowHeightPx = 40;

export interface UseTableKeyboardOptions<TData> {
  table: Table<TData>;
  enabled: boolean;
  viewportHeight?: number;
  onScrollToRow?: (rowIndex: number) => void;
  onRowActivate?: (row: Row<TData>) => void;
}

export interface UseTableKeyboardReturn {
  handleKeyDown: (event: React.KeyboardEvent) => void;
  handleContainerClick: () => void;
  handleContainerBlur: () => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
  focusedRowIndex: number;
}

export const useTableKeyboard = <TData>({
  table,
  enabled,
  viewportHeight = 400,
  onScrollToRow,
  onRowActivate,
}: UseTableKeyboardOptions<TData>): UseTableKeyboardReturn => {
  const [focusedRowIndex, setFocusedRowIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const { rows } = table.getRowModel();
  const rowCount = rows.length;
  const pageSize = Math.max(1, Math.floor(viewportHeight / rowHeightPx));

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (!enabled || rowCount === 0) {
        return;
      }

      switch (event.key) {
        case 'ArrowDown': {
          event.preventDefault();
          setFocusedRowIndex((prev) => (prev < 0 ? 0 : Math.min(prev + 1, rowCount - 1)));
          break;
        }
        case 'ArrowUp': {
          event.preventDefault();
          setFocusedRowIndex((prev) => (prev < 0 ? rowCount - 1 : Math.max(prev - 1, 0)));
          break;
        }
        case 'Home': {
          event.preventDefault();
          setFocusedRowIndex(0);
          break;
        }
        case 'End': {
          event.preventDefault();
          setFocusedRowIndex(rowCount - 1);
          break;
        }
        case 'PageDown': {
          event.preventDefault();
          setFocusedRowIndex((prev) => {
            const start = Math.max(prev, 0);
            return Math.min(start + pageSize, rowCount - 1);
          });
          break;
        }
        case 'PageUp': {
          event.preventDefault();
          setFocusedRowIndex((prev) => {
            const start = prev < 0 ? rowCount - 1 : prev;
            return Math.max(start - pageSize, 0);
          });
          break;
        }
        case 'Enter':
        case ' ': {
          event.preventDefault();
          if (focusedRowIndex >= 0 && focusedRowIndex < rowCount) {
            const row = rows[focusedRowIndex];
            onRowActivate?.(row);
          }
          break;
        }
        default: {
          break;
        }
      }
    },
    [enabled, rowCount, pageSize, focusedRowIndex, rows, onRowActivate],
  );

  const handleContainerClick = useCallback(() => {
    if (enabled && containerRef.current) {
      containerRef.current.focus();
      if (focusedRowIndex < 0 && rowCount > 0) {
        setFocusedRowIndex(0);
      }
    }
  }, [enabled, focusedRowIndex, rowCount]);

  const handleContainerBlur = useCallback(() => {
    // Intentionally empty: blur keeps the focused row; kept for API compatibility
  }, []);

  useEffect(() => {
    if (focusedRowIndex >= 0 && focusedRowIndex < rowCount && onScrollToRow) {
      // oxlint-disable-next-line react-doctor/no-pass-live-state-to-parent -- scroll side effect after the focused row commits; the parent does not store it as state
      onScrollToRow(focusedRowIndex);
    }
  }, [focusedRowIndex, rowCount, onScrollToRow]);

  return {
    handleKeyDown,
    handleContainerClick,
    handleContainerBlur,
    containerRef,
    focusedRowIndex,
  };
};
