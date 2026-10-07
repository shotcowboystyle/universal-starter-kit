/**
 * Desk scope — the tenant seam (MPO-14 / gap GL-5, spec 09 §DM-4).
 *
 * `scope` filters are ALWAYS ANDed into every doctype-homed query, invisible
 * to the filter chrome and not removable by the user. Before this context
 * existed the seam reached exactly one surface (DoctypeListScreen's
 * `fixedFilters`), so a scoped desk leaked rows the moment the user switched
 * to kanban. Surfaces read the context themselves; hosts set it once via
 * `<Desk scope={…} />` (or `DeskScopeProvider` directly).
 *
 * Scope applies to doctype-homed surfaces (list, kanban, calendar, tree,
 * image, dashboard, report view). Query/Script reports run server-side SQL
 * and the awesomebar searches across doctypes, so field-tuple scope cannot
 * soundly AND into either; restrict those with `capabilities` instead.
 */
import type { ReactNode } from 'react';
import { createContext, useContext, useMemo } from 'react';

import type { FrappeFilters } from '../shared/types';

const EMPTY_SCOPE: FrappeFilters = [];

const DeskScopeContext = createContext<FrappeFilters>(EMPTY_SCOPE);

export interface DeskScopeProviderProps {
  /** Filter tuples ANDed into every doctype-homed query in the subtree. */
  scope?: FrappeFilters;
  children: ReactNode;
}

export function DeskScopeProvider({ scope, children }: DeskScopeProviderProps) {
  // Value-keyed so unstable array literals from the host don't churn readers.
  const scopeKey = JSON.stringify(scope ?? EMPTY_SCOPE);
  const value = useMemo(() => (JSON.parse(scopeKey) as FrappeFilters) ?? EMPTY_SCOPE, [scopeKey]);
  return <DeskScopeContext.Provider value={value}>{children}</DeskScopeContext.Provider>;
}

/** The ambient desk scope; `[]` outside any DeskScopeProvider. */
export function useDeskScope(): FrappeFilters {
  return useContext(DeskScopeContext);
}

/**
 * AND the ambient scope into `filters`. Returns `undefined` when there is
 * nothing to apply, so callers can spread-conditionally into leaf props.
 */
export function useScopedFilters(filters?: FrappeFilters): FrappeFilters | undefined {
  const scope = useDeskScope();
  return useMemo(() => {
    if (scope.length === 0 && (!filters || filters.length === 0)) {
      return;
    }
    return [...scope, ...(filters ?? [])];
  }, [scope, filters]);
}
