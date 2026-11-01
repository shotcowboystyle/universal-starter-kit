import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { FrappeConnection } from '../frappe-connections';
import type { FrappeRouter } from '../frappe-navigation';
import { FrappeRowsReader } from '../FrappeRowsReader';
import type { FrappeRowsSnapshot } from '../FrappeRowsReader';
import type { FrappeRowsConnection } from '../use-frappe-rows';

import { facetRead, readFacet } from './facet-reading';
import type { FacetReading } from './facet-reading';
import { useFavorites } from './favorites';
import type { UseFavorites } from './favorites';
import { listStateFromParams, listStateParams } from './list-state';
import type { FrappeListControls, FrappeListParams, FrappeListState } from './list-state';

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- rows of any doctype; the controls name the fields read from them at runtime
type Row = Record<string, unknown> & { name: string; doctype: string };
type Snapshot = FrappeRowsSnapshot<Row>;

export interface ListControlsOptions {
  doctype: string;
  controls: FrappeListControls;
  connections: readonly FrappeConnection[] | undefined;
  connection: FrappeRowsConnection | undefined;
  /** The list's row ceiling; the base read (count, range ceilings) shares it. */
  limit?: number;
  /** Storage key of the favorites; undefined offers none. */
  favoritesKey?: string;
  /** Read and write the state through the router's query params. */
  router?: FrappeRouter;
  /** Read every record's name (and range fields) for counts and ceilings. */
  readBase: boolean;
}

export interface ListControlsResult {
  state: FrappeListState;
  /** The search box's text, ahead of its debounced commit to `state.search`. */
  searchText: string;
  setSearchText: (text: string) => void;
  update: (patch: Partial<FrappeListState>) => void;
  /** Drops search, facets, ranges and favorites-only. */
  clear: () => void;
  favorites: UseFavorites;
  facets: Readonly<Record<string, FacetReading>>;
  /** Records the base read found, capped at the list's limit. */
  total: number | undefined;
  /** Highest value per range param in the base read. */
  highest: Readonly<Record<string, number>>;
  /** Mount these: the facet and base reads. */
  readers: React.ReactNode;
}

const mergeState = (prev: FrappeListState, patch: Partial<FrappeListState>): FrappeListState => ({
  ...prev,
  ...patch,
  facets: patch.facets ? { ...prev.facets, ...patch.facets } : prev.facets,
  ranges: patch.ranges ? { ...prev.ranges, ...patch.ranges } : prev.ranges,
});

/**
 * The state behind a list page's controls, the favorites it filters by and
 * the reads that label them (facet values and counts, the record count, the
 * range ceilings). With a router that hands over query params the state
 * seeds from them once and writes back after each commit: the write rides
 * a post-commit effect, since a host router notifies its subscribers
 * synchronously and a notify inside a render-phase update is a React error.
 */
export const useListControls = ({
  doctype,
  controls,
  connections,
  connection,
  limit,
  favoritesKey,
  router,
  readBase,
}: ListControlsOptions): ListControlsResult => {
  // Latest-value refs: the stable callbacks below read the current controls
  // and router setter without re-creating themselves.
  const controlsRef = useRef(controls);
  controlsRef.current = controls;
  const setParams = router?.setSearchParams;
  const setParamsRef = useRef(setParams);
  setParamsRef.current = setParams;

  const [state, setState] = useState<FrappeListState>(() => listStateFromParams(router?.searchParams ?? {}, controls));
  const [searchText, setSearchText] = useState(state.search);
  const pending = useRef<FrappeListParams>({});
  const [flushTick, setFlushTick] = useState(0);

  const update = useCallback((patch: Partial<FrappeListState>) => {
    setState((prev) => mergeState(prev, patch));
    if (!setParamsRef.current) {
      return;
    }
    pending.current = { ...pending.current, ...listStateParams(patch, controlsRef.current) };
    setFlushTick((tick) => tick + 1);
  }, []);

  useEffect(() => {
    if (flushTick === 0) {
      return;
    }
    const patch = pending.current;
    pending.current = {};
    if (Object.keys(patch).length === 0) {
      return;
    }
    try {
      setParamsRef.current?.(patch);
    } catch {
      // A host router that cannot take params right now; local state holds.
    }
  }, [flushTick]);

  const clear = useCallback(() => {
    setSearchText('');
    const { current } = controlsRef;
    update({
      search: '',
      favoritesOnly: false,
      facets: Object.fromEntries((current.facets ?? []).map((facet) => [facet.param, ''])),
      ranges: Object.fromEntries((current.ranges ?? []).map((range) => [range.param, 0])),
    });
  }, [update]);

  const favorites = useFavorites(favoritesKey);

  const [snapshots, setSnapshots] = useState<Record<string, Snapshot>>({});
  const handlers = useRef(new Map<string, (snapshot: Snapshot) => void>());
  const handlerFor = useCallback((key: string) => {
    let handler = handlers.current.get(key);
    if (!handler) {
      handler = (snapshot: Snapshot) => {
        setSnapshots((prev) => ({ ...prev, [key]: snapshot }));
      };
      handlers.current.set(key, handler);
    }
    return handler;
  }, []);

  const facetsKey = JSON.stringify(
    (controls.facets ?? []).map(({ param, field, doctype: on, orderBy }) => [param, field, on, orderBy]),
  );
  const rangeFieldsKey = JSON.stringify((controls.ranges ?? []).map((range) => range.field));
  const connectionsKey = JSON.stringify(connections ?? null);

  const reads = useMemo(() => {
    // SAFETY: connectionsKey is JSON.stringify(connections ?? null) of this render's FrappeConnection list.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
    const declared = JSON.parse(connectionsKey) as FrappeConnection[] | null;
    const facetReads = (controlsRef.current.facets ?? []).map((facet) => ({
      key: `facet:${facet.param}`,
      facet,
      ...facetRead(facet, doctype, declared ?? undefined, limit),
    }));
    // SAFETY: rangeFieldsKey is JSON.stringify of a string[] (the range fields) built this render.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
    const rangeFields = JSON.parse(rangeFieldsKey) as string[];
    const base = readBase
      ? {
          key: 'base',
          doctype,
          options: { fields: ['name', ...rangeFields], limit: limit ?? 0 },
        }
      : undefined;
    return { facetReads: facetReads.filter((read) => read.ready), base };
    // facetsKey stands for controls.facets, read through the ref.
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- facetsKey is the serialized identity of controls.facets, which the memo reads through the ref
  }, [facetsKey, rangeFieldsKey, connectionsKey, doctype, limit, readBase]);

  const facetReadings = useMemo(() => {
    const readings: Record<string, FacetReading> = {};
    for (const read of reads.facetReads) {
      const rows = snapshots[read.key]?.rows ?? [];
      readings[read.facet.param] = readFacet(read.facet, read.linkField, rows);
    }
    return readings;
  }, [reads, snapshots]);

  const baseRows = reads.base ? snapshots.base?.rows : undefined;
  const { total, highest } = useMemo(() => {
    if (!baseRows) {
      // oxlint-disable-next-line sonarjs/no-undefined-assignment -- ListControlsResult.total is `number | undefined` (public API): no count until the base read lands
      return { total: undefined, highest: {} };
    }
    const peaks: Record<string, number> = {};
    for (const range of controlsRef.current.ranges ?? []) {
      let peak = 0;
      for (const row of baseRows) {
        peak = Math.max(peak, Number(row[range.field]) || 0);
      }
      peaks[range.param] = peak;
    }
    return { total: baseRows.length, highest: peaks };
  }, [baseRows]);

  const readers = (
    <>
      {reads.facetReads.map((read) => (
        <FrappeRowsReader
          key={read.key}
          connection={connection}
          doctype={read.doctype}
          // SAFETY: the options were built for this read's doctype; FrappeRowsReader types them against its row generic.
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
          options={read.options as never}
          onChange={handlerFor(read.key)}
        />
      ))}
      {reads.base ? (
        <FrappeRowsReader
          key="base"
          connection={connection}
          doctype={reads.base.doctype}
          // SAFETY: the base read's options name only `name` and the range fields, valid for any doctype row.
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
          options={reads.base.options as never}
          onChange={handlerFor('base')}
        />
      ) : null}
    </>
  );

  return {
    state,
    searchText,
    setSearchText,
    update,
    clear,
    favorites,
    facets: facetReadings,
    total,
    highest,
    readers,
  };
};
