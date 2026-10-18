import { useMemo } from 'react';

import type { DataTableState } from '../types';
import { deserializeTableState, serializeTableState } from '../utils/url-state-utils';

import type { UrlStateStrategy } from './use-data-table';

const defaultState: Record<string, string> = {};

const noopSetUrlState = (): undefined => undefined;

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

export const useTableUrlSync = ({
  syncWithUrl = false,
  urlDebounceMs: _urlDebounceMs = 500,
  urlStrategy,
  state,
}: UseTableUrlSyncOptions = {}): UseTableUrlSyncReturn => {
  const initialUrlState = state ? serializeTableState(state) : defaultState;
  const [urlState, setUrlState] =
    syncWithUrl && urlStrategy ? urlStrategy.getState(initialUrlState) : [defaultState, noopSetUrlState];

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
};
