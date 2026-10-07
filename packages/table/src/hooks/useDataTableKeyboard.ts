import type { Row, Table } from '@tanstack/react-table';
import { useCallback, useEffect, useRef, useState } from 'react';

const rowHeightPx = 40;

export interface UseDataTableKeyboardOptions<TData> {
  table: Table<TData>;
  enabled: boolean;
  /** Height of visible viewport for PageUp/PageDown (default 400) */
  viewportHeight?: number;
  /** When virtualization is enabled, callback to scroll to row index */
  onScrollToRow?: (rowIndex: number) => void;
  /** Callback when Enter/Space activates a row (e.g. expand) */
  onRowActivate?: (row: Row<TData>) => void;
}

export interface UseDataTableKeyboardReturn {
  focusedRowIndex: number;
  setFocusedRowIndex: (index: number) => void;
  isNavigating: boolean;
  handleKeyDown: (event: React.KeyboardEvent) => void;
  handleContainerClick: () => void;
  handleContainerBlur: () => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export function useDataTableKeyboard<TData>({
  table,
  enabled,
  viewportHeight = 400,
  onScrollToRow,
  onRowActivate,
}: UseDataTableKeyboardOptions<TData>): UseDataTableKeyboardReturn {
  const [focusedRowIndex, setFocusedRowIndex] = useState(-1);
  const [isNavigating, setIsNavigating] = useState(false);
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
          setIsNavigating(true);
          setFocusedRowIndex((prev) => (prev < 0 ? 0 : Math.min(prev + 1, rowCount - 1)));
          break;
        }
        case 'ArrowUp': {
          event.preventDefault();
          setIsNavigating(true);
          setFocusedRowIndex((prev) => (prev < 0 ? rowCount - 1 : Math.max(prev - 1, 0)));
          break;
        }
        case 'ArrowLeft': {
          // Cell-level nav could be added later; for now we focus row
          event.preventDefault();
          break;
        }
        case 'ArrowRight': {
          event.preventDefault();
          break;
        }
        case 'Home': {
          event.preventDefault();
          setIsNavigating(true);
          setFocusedRowIndex(0);
          break;
        }
        case 'End': {
          event.preventDefault();
          setIsNavigating(true);
          setFocusedRowIndex(rowCount - 1);
          break;
        }
        case 'PageDown': {
          event.preventDefault();
          setIsNavigating(true);
          setFocusedRowIndex((prev) => {
            const start = prev < 0 ? 0 : prev;
            return Math.min(start + pageSize, rowCount - 1);
          });
          break;
        }
        case 'PageUp': {
          event.preventDefault();
          setIsNavigating(true);
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
    setIsNavigating(false);
  }, []);

  // Scroll to focused row when it changes (for virtualization)
  useEffect(() => {
    if (focusedRowIndex >= 0 && focusedRowIndex < rowCount && onScrollToRow) {
      onScrollToRow(focusedRowIndex);
    }
  }, [focusedRowIndex, rowCount, onScrollToRow]);

  return {
    focusedRowIndex,
    setFocusedRowIndex,
    isNavigating,
    handleKeyDown,
    handleContainerClick,
    handleContainerBlur,
    containerRef,
  };
}
