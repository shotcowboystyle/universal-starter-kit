import { useMemo } from 'react';

import type { DataTableState } from '../types';
import { deserializeTableState, serializeTableState } from '../utils/urlStateUtils';

import type { UrlStateStrategy } from './useDataTable';

export interface UseTableUrlSyncOptions {
  syncWithUrl?: boolean;
  urlDebounceMs?: number;
  urlStrategy?: UrlStateStrategy;
  state?: Partial<DataTableState>;
}

export interface UseTableUrlSyncReturn {
  syncState: (state: Partial<DataTableState>) => void;
  loadFromUrl: () => Partial<DataTableState>;
  deserializedState: Partial<DataTableState>;
}

export function useTableUrlSync({
  syncWithUrl = false,
  urlDebounceMs: _urlDebounceMs = 500,
  urlStrategy,
  state,
}: UseTableUrlSyncOptions = {}): UseTableUrlSyncReturn {
  const defaultState: Record<string, string> = {};

  const [urlState, setUrlState] =
    syncWithUrl && urlStrategy
      ? urlStrategy.getState(state ? serializeTableState(state) : defaultState)
      : [defaultState, () => {}];

  const deserializedState = useMemo(() => deserializeTableState(urlState), [urlState]);

  const syncState = (newState: Partial<DataTableState>) => {
    if (!syncWithUrl) {
      return;
    }
    const serialized = serializeTableState(newState);
    setUrlState(serialized);
  };

  const loadFromUrl = (): Partial<DataTableState> => deserializedState;

  return {
    syncState,
    loadFromUrl,
    deserializedState,
  };
}
