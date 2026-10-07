import type { ColumnSizingState, PaginationState, SortingState, VisibilityState } from '@tanstack/react-table';
import { useCallback, useState } from 'react';

import type { TableFilter, TableView } from '../types';

export interface UseTableViewsOptions {
  initialViews?: TableView[];
  initialActiveViewId?: string;
}

export interface UseTableViewsReturn {
  views: TableView[];
  activeViewId: string | undefined;
  saveView: (
    name: string,
    currentState: {
      columnVisibility: VisibilityState;
      columnSizing: ColumnSizingState;
      columnOrder: string[];
      filters: TableFilter[];
      sorting: SortingState;
      pagination: PaginationState;
      globalFilter: string;
    },
  ) => void;
  loadView: (viewId: string) => TableView | undefined;
  deleteView: (viewId: string) => void;
  resetToDefault: () => void;
  setViews: React.Dispatch<React.SetStateAction<TableView[]>>;
  setActiveViewId: React.Dispatch<React.SetStateAction<string | undefined>>;
}

export function useTableViews({
  initialViews = [],
  initialActiveViewId,
}: UseTableViewsOptions = {}): UseTableViewsReturn {
  const [views, setViews] = useState<TableView[]>(initialViews);
  const [activeViewId, setActiveViewId] = useState<string | undefined>(initialActiveViewId);

  const saveView = useCallback(
    (
      name: string,
      currentState: {
        columnVisibility: VisibilityState;
        columnSizing: ColumnSizingState;
        columnOrder: string[];
        filters: TableFilter[];
        sorting: SortingState;
        pagination: PaginationState;
        globalFilter: string;
      },
    ) => {
      const view: TableView = {
        id: `view-${Date.now()}`,
        name,
        columns: Object.keys(currentState.columnVisibility).reduce<any>((acc, colId) => {
          acc[colId] = {
            id: colId,
            visible: currentState.columnVisibility[colId],
            width: currentState.columnSizing[colId],
            order: currentState.columnOrder.indexOf(colId),
          };
          return acc;
        }, {}),
        filters: currentState.filters,
        sorting: currentState.sorting,
        pagination: {
          pageIndex: currentState.pagination.pageIndex,
          pageSize: currentState.pagination.pageSize,
        },
        searchQuery: currentState.globalFilter,
      };

      setViews((prev) => [...prev, view]);
    },
    [],
  );

  const loadView = useCallback(
    (viewId: string): TableView | undefined => {
      const view = views.find((v) => v.id === viewId);
      if (view) {
        setActiveViewId(viewId);
      }
      return view;
    },
    [views],
  );

  const deleteView = useCallback((viewId: string) => {
    setViews((prev) => prev.filter((v) => v.id !== viewId));
    setActiveViewId((prev) => (prev === viewId ? undefined : prev));
  }, []);

  const resetToDefault = useCallback(() => {
    setActiveViewId(undefined);
  }, []);

  return {
    views,
    activeViewId,
    saveView,
    loadView,
    deleteView,
    resetToDefault,
    setViews,
    setActiveViewId,
  };
}
