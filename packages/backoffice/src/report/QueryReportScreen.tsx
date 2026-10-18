// Desk /app/query-report/<name> parity surface: report title header +
// refresh, a sticky declared-filter band (queryReportFilterBar — Metabase /
// Looker / Desk page-form / Linear insights), and the query_report.run
// result in the catalog DataTable (client-side sort/search/pagination —
// desk also loads query-report rows in one shot).
//
// Filters apply on change for discrete controls (select/link/date/check);
// text waits for Enter/blur/Apply. Applied values mirror into `?filters=`
// so reload/deep-link reproduces the run. Mandatory empties gate the run
// behind an honest empty state; a filtered-empty grid offers Clear all.
import { DownloadSimpleIcon } from '@phosphor-icons/react';
import {
  buildQueryReportColumns,
  buildQueryReportCsv,
  defaultFilterValues,
  isEmptyFilterValue,
  scrubFieldname,
  stripReportHtml as stripHtml,
  useQueryReport,
} from '@repo/frappe-ui';
import type { QueryReportFilters, QueryReportFixture } from '@repo/frappe-ui';
import { downloadBlob } from '@repo/platform';
import { DataTable, DataTablePagination } from '@repo/table';
import { useResolvedKnobs } from '@repo/theme';
import { Button, EmptyState, PageHeader, ScrollView, Spinner, Text, XStack, YStack, isWeb } from '@repo/ui';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { useBackofficeLocation, useBackofficeNavigator, useBackofficePaths } from '../config/BackofficeProvider';
import { BACKOFFICE_I18N_NAMESPACE } from '../i18n';

import { QueryReportFilterBar, queryReportFilterLabel } from './query-report-filter-bar';
import { parseQueryReportFiltersParam, serializeQueryReportFiltersParam } from './query-report-url-state';

export interface QueryReportScreenProps {
  /** Report document name (proper-cased, e.g. "Permitted Documents For User"). */
  reportName: string;
  /** Fixture override for stories/tests (skips bench RPCs). */
  fixture?: QueryReportFixture;
  /** Filter values applied before the first run (`?filters=` wins when both set). */
  initialFilters?: QueryReportFilters;
  /** Hide result columns by fieldname. */
  hiddenColumns?: readonly string[];
  /** Open a Link cell's target document (default: navigate to its form). */
  onRowOpen?: (doctype: string, name: string) => void;
}

const PAGE_SIZES = [20, 100, 500];

// oxlint-disable-next-line eslint/complexity, react-doctor/no-giant-component -- one state-machine body per report state; splitting it would scatter the shared header/filter chrome
export const QueryReportScreen = ({
  reportName,
  fixture,
  initialFilters,
  hiddenColumns,
  onRowOpen,
  // oxlint-disable-next-line sonarjs/cognitive-complexity -- see the note on the component
}: QueryReportScreenProps) => {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const { knobProps } = useResolvedKnobs();
  const navigator = useBackofficeNavigator();
  const paths = useBackofficePaths();
  const { params } = useBackofficeLocation();

  // `?filters=` deep link (query-report-url-state.ts): wins over the host's
  // initialFilters prop at mount, mirrors applied changes back out, and
  // inbound changes (back/forward, pasted links) are adopted below.
  const rawFiltersParam = Array.isArray(params.filters) ? params.filters[0] : params.filters;
  const initialFilterValues = useMemo(() => {
    const fromParam = parseQueryReportFiltersParam(rawFiltersParam);
    if (Object.keys(fromParam).length > 0) {
      return fromParam;
    }
    return initialFilters;
  }, [rawFiltersParam, initialFilters]);

  const report = useQueryReport(reportName, { fixture, initialFilters: initialFilterValues });
  const { setFilters } = report;

  // URL round-trip, outbound half (desk update_url_with_filters parity):
  // applied filters mirror into `?filters=` through the navigator's
  // optional setParams — no history entry; hosts without the primitive
  // skip silently and state stays local.
  const applyFilters = useCallback(
    (next: QueryReportFilters) => {
      setFilters(next);
      navigator.setParams?.({ filters: serializeQueryReportFiltersParam(next) });
    },
    [setFilters, navigator],
  );

  // Inbound half: a changed `?filters=` on the SAME report (back/forward,
  // deep link) adopts into state; param removal restores declared defaults.
  // Report swaps are the hook's job (it reseeds from initialFilters), and
  // echoes of our own outbound writes no-op on the serialized comparison.
  // Latest-value refs synced during render; read only inside the adoption effect.
  const filtersRef = useRef(report.filters);
  // oxlint-disable-next-line react/refs -- see above
  filtersRef.current = report.filters;
  const filterMetaRef = useRef(report.filterMeta);
  // oxlint-disable-next-line react/refs -- see above
  filterMetaRef.current = report.filterMeta;
  const lastAdopted = useRef({ report: reportName, param: rawFiltersParam });
  useEffect(() => {
    const last = lastAdopted.current;
    const reportChanged = last.report !== reportName;
    const paramChanged = last.param !== rawFiltersParam;
    lastAdopted.current = { report: reportName, param: rawFiltersParam };
    if (reportChanged || !paramChanged) {
      return;
    }
    const parsed = parseQueryReportFiltersParam(rawFiltersParam);
    const next = Object.keys(parsed).length > 0 ? parsed : defaultFilterValues(filterMetaRef.current);
    if (serializeQueryReportFiltersParam(next) === serializeQueryReportFiltersParam(filtersRef.current)) {
      return;
    }
    // oxlint-disable-next-line react-doctor/no-pass-data-to-parent -- adopts an inbound URL change into the hook's state; there is no render-time source for it
    setFilters(next);
  }, [reportName, rawFiltersParam, setFilters]);

  const handleOpenLink = useCallback(
    (doctype: string, name: string) => {
      if (onRowOpen) {
        onRowOpen(doctype, name);
        return;
      }
      navigator.navigate(paths.form(doctype, name));
    },
    [navigator, paths, onRowOpen],
  );

  const tableColumns = useMemo(() => {
    const hidden = new Set(hiddenColumns);
    const visible = hidden.size ? report.columns.filter((column) => !hidden.has(column.fieldname)) : report.columns;
    return buildQueryReportColumns({ columns: visible, onOpenLink: handleOpenLink });
  }, [report.columns, handleOpenLink, hiddenColumns]);

  const title = report.meta?.report_name ?? reportName;
  const hasVisibleFilters = report.filterMeta.some(
    (filter) => filter.hidden !== 1 && !isEmptyFilterValue(report.filters[filter.fieldname]),
  );
  const clearVisibleFilters = useCallback(() => {
    const next: QueryReportFilters = {};
    for (const filter of report.filterMeta) {
      if (filter.hidden === 1 && !isEmptyFilterValue(report.filters[filter.fieldname])) {
        next[filter.fieldname] = report.filters[filter.fieldname];
      }
    }
    applyFilters(next);
  }, [report.filterMeta, report.filters, applyFilters]);

  const handleExport = useCallback(() => {
    if (!isWeb || report.rows.length === 0) {
      return;
    }
    downloadBlob(
      new Blob([buildQueryReportCsv(report.columns, report.rows)], {
        type: 'text/csv;charset=utf-8;',
      }),
      `${scrubFieldname(title)}.csv`,
    );
  }, [report.columns, report.rows, title]);

  const subtitle = useMemo(() => {
    if (report.loading) {
      // oxlint-disable-next-line unicorn/no-useless-undefined -- other paths return the subtitle; a bare return trips consistent-return
      return undefined;
    }
    const bits: string[] = [];
    const refDoctype = report.meta?.ref_doctype;
    if (refDoctype !== undefined && refDoctype !== '') {
      bits.push(refDoctype);
    }
    if (!report.error && report.missingRequired.length === 0) {
      bits.push(
        t('queryReport.rowCount', {
          defaultValue: '{{count}} row(s)',
          count: report.rows.length,
        }),
      );
      if (report.executionTime !== undefined) {
        bits.push(
          t('queryReport.executionTime', {
            defaultValue: 'ran in {{seconds}}s',
            seconds: report.executionTime.toFixed(2),
          }),
        );
      }
    }
    return bits.length > 0 ? bits.join(' · ') : undefined;
  }, [report, t]);

  const handleReload = report.reload;
  let body: React.ReactNode;
  if (report.loading) {
    body = (
      <YStack
        flex={1}
        alignItems="center"
        justifyContent="center"
        padding="$6">
        <Spinner size="large" />
      </YStack>
    );
  } else if (report.meta?.disabled === 1) {
    body = (
      <EmptyState
        title={t('queryReport.disabledTitle', {
          defaultValue: '"{{report}}" is disabled',
          report: title,
        })}
        description={t('queryReport.disabledDescription', 'Enable the report from its Report document to run it')}
      />
    );
  } else if (report.error && report.refused) {
    body = (
      <EmptyState
        testID="frappe-report-not-permitted"
        title={t('queryReport.notPermitted', {
          defaultValue: 'You can\'t run "{{report}}"',
          report: title,
        })}
        description={report.error.message}
      />
    );
  } else if (report.error) {
    body = (
      <YStack
        flex={1}
        gap="$2">
        <EmptyState
          intent="error"
          title={t('queryReport.runError', {
            defaultValue: 'Could not run "{{report}}"',
            report: title,
          })}
          description={report.error.message}
          action={
            <Button
              theme="accent"
              onPress={handleReload}>
              {t('queryReport.retry', 'Retry')}
            </Button>
          }
        />
        {report.scriptFilterGap ? (
          <Text
            fontSize="$2"
            color="$color9"
            textAlign="center"
            paddingHorizontal="$4">
            {t(
              'queryReport.scriptFiltersHint',
              "Some of this report's filters are declared in desk-side scripts and could not be derived here",
            )}
          </Text>
        ) : null}
      </YStack>
    );
  } else if (report.missingRequired.length > 0) {
    body = (
      <EmptyState
        title={t('queryReport.filtersRequiredTitle', 'Filters required')}
        description={t('queryReport.filtersRequiredDescription', {
          defaultValue: 'Set the required filter(s) to run this report: {{filters}}',
          filters: report.missingRequired.map((filter) => queryReportFilterLabel(filter)).join(', '),
        })}
      />
    );
  } else if (report.rows.length === 0) {
    body = (
      <EmptyState
        title={t('queryReport.emptyTitle', 'No results')}
        description={
          hasVisibleFilters
            ? t('queryReport.emptyFiltered', 'No rows match the current filters')
            : t('queryReport.emptyDescription', 'The report ran but returned no rows')
        }
        action={
          hasVisibleFilters ? (
            <Button
              chromeless
              onPress={clearVisibleFilters}>
              {t('queryReport.clearAllFilters', 'Clear all filters')}
            </Button>
          ) : (
            <Button
              chromeless
              onPress={handleReload}>
              {t('queryReport.refresh', 'Refresh')}
            </Button>
          )
        }
      />
    );
  } else {
    body = (
      <DataTable
        key={reportName}
        data={report.rows}
        columns={tableColumns}
        enableSorting
        enableFiltering={false}
        enableGlobalSearch={false}
        enablePagination
        initialState={{ pagination: { pageIndex: 0, pageSize: PAGE_SIZES[0] } }}
        renderPagination={(paginationProps) => (
          <DataTablePagination
            {...paginationProps}
            pageSizeOptions={[...PAGE_SIZES]}
            compact
          />
        )}
      />
    );
  }

  const content = (
    <YStack
      flex={1}
      {...knobProps.gap}
      {...knobProps.panelPadding}>
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          <XStack
            gap="$2"
            alignItems="center">
            {report.running && !report.loading ? <Spinner size="small" /> : null}
            {report.refused ? null : (
              <>
                <Button
                  size="$2"
                  chromeless
                  onPress={handleReload}
                  disabled={report.loading}>
                  {t('queryReport.refresh', 'Refresh')}
                </Button>
                <Button
                  size="$2"
                  chromeless
                  icon={DownloadSimpleIcon}
                  onPress={handleExport}
                  disabled={report.loading || report.rows.length === 0}>
                  {t('queryReport.exportCsv', 'Export CSV')}
                </Button>
              </>
            )}
          </XStack>
        }
      />
      {report.serverMessage !== undefined && report.serverMessage !== '' ? (
        <Text
          fontSize="$2"
          color="$color10">
          {stripHtml(report.serverMessage)}
        </Text>
      ) : null}
      <YStack
        flex={1}
        minWidth={0}
        borderWidth={1}
        borderColor="$borderColor"
        borderRadius="$4">
        {report.filterMeta.length > 0 ? (
          <QueryReportFilterBar
            filterMeta={report.filterMeta}
            filters={report.filters}
            onApply={applyFilters}
          />
        ) : null}
        {!report.loading && report.scriptFilterGap && !report.error ? (
          <Text
            fontSize="$2"
            color="$color9"
            paddingHorizontal="$3"
            paddingVertical="$2">
            {t(
              'queryReport.scriptFiltersGap',
              "Some of this report's filters are defined in code and aren't supported here yet",
            )}
          </Text>
        ) : null}
        <YStack
          flex={1}
          minWidth={0}>
          {body}
        </YStack>
      </YStack>
    </YStack>
  );

  // Native has no page-level scroll (DoctypeListScreen precedent) — wrap so
  // rows below the fold stay reachable. Web keeps the flex layout.
  return isWeb ? content : <ScrollView flex={1}>{content}</ScrollView>;
};
