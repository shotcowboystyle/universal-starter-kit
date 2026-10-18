// The desk's report view (view=report): FrappeReportBuilder, the doctype
// report view frappe-ui exports, under the desk's navigation (MPO-15,
// GL-28). This file only wires the desk in: the `?f=` base filters, the
// `?report=` saved-report selection, the desk scope, and row and Link
// presses to the form route.
import { FrappeReportBuilder, parseReportFiltersParam } from '@repo/frappe-ui';
import React, { useCallback, useMemo } from 'react';

import { useBackofficeLocation, useBackofficeNavigator, useBackofficePaths } from '../config/BackofficeProvider';
import { useDeskScope } from '../desk/scope';
import type { FrappeFilters } from '../shared/types';
import { ViewError, ViewLoading } from '../views/ViewStates';

export interface DoctypeReportViewProps {
  /** Proper-cased doctype name (e.g. "Sales Order") */
  doctype: string;
  /**
   * Raw `?f=` search-param value (urlencoded JSON FrappeFilters), read by
   * the route wrapper (DoctypeViewScreen) — kept as a prop so the screen
   * mounts outside a One navigation container (stories/tests).
   */
  filtersParam?: string;
  /** Base filters when no `?f=` URL param is present (stories/tests). */
  initialFilters?: FrappeFilters;
}

export const DoctypeReportView = ({ doctype, filtersParam, initialFilters }: DoctypeReportViewProps) => {
  const deskScope = useDeskScope();
  const navigator = useBackofficeNavigator();
  const paths = useBackofficePaths();
  const { params } = useBackofficeLocation();

  // The router may hand `?report=` through raw — decode defensively (same
  // contract as the `?f=` parser).
  const rawReportParam = Array.isArray(params.report) ? params.report[0] : params.report;
  const currentReport = useMemo(() => {
    if (rawReportParam === undefined || rawReportParam === '') {
      return null;
    }
    try {
      return decodeURIComponent(rawReportParam);
    } catch {
      return rawReportParam;
    }
  }, [rawReportParam]);
  const urlFilters = useMemo(() => parseReportFiltersParam(filtersParam), [filtersParam]);

  const openForm = useCallback(
    (targetDoctype: string, name: string) => {
      navigator.navigate(paths.form(targetDoctype, name));
    },
    [navigator, paths],
  );
  const selectReport = useCallback(
    (name: string | null) => {
      const base = paths.view(doctype, 'report');
      navigator.replace(name !== null && name !== '' ? `${base}?report=${encodeURIComponent(name)}` : base);
    },
    [navigator, paths, doctype],
  );
  const clearUrlFilters = useCallback(() => {
    if (urlFilters) {
      navigator.replace(paths.view(doctype, 'report'));
    }
  }, [urlFilters, navigator, paths, doctype]);

  return (
    <FrappeReportBuilder
      doctype={doctype}
      filters={urlFilters ?? initialFilters}
      scopeFilters={deskScope}
      onClearFilters={clearUrlFilters}
      report={currentReport}
      onReportChange={selectReport}
      onOpenRow={(name) => {
        openForm(doctype, name);
      }}
      onOpenLink={openForm}
      loading={<ViewLoading />}
      // oxlint-disable-next-line react/no-unstable-nested-components -- render prop FrappeReportBuilder calls as a function; it is never mounted as a component
      error={(error) => (
        <ViewError
          doctype={doctype}
          error={error}
        />
      )}
    />
  );
};
