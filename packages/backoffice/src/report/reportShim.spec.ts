/**
 * MPO-15 (GL-28) — the report seam, from this side.
 *
 * The query-report model and transport, the doctype report-view model, its
 * grid, toolbar and saved reports moved down to `@repo/frappe-ui`,
 * and the exported FrappeReportBuilder is the desk report view now. The move
 * must be invisible to anyone importing this package: the barrel keeps the
 * same names and the `@repo/backoffice/src/...` deep imports keep
 * resolving (the GNOME shim deep-imports them). And the desk has to render the
 * moved component, not a copy of it: DoctypeReportView is chrome over
 * FrappeReportBuilder, the legacy ReportView is no third implementation, and
 * view=report reaches the builder.
 *
 * Source-level on purpose, like listShim.spec.ts: importing the backoffice
 * barrel here would drag the whole desk UI in to prove a re-export.
 */
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const srcDir = path.resolve(__dirname, '..');

function read(rel: string): string {
  return fs.readFileSync(path.resolve(srcDir, rel), 'utf-8');
}

/** module path (relative to src/) → names it must still hand out. */
const SHIMS: Record<string, string[]> = {
  'report/reportShapes.ts': [
    'buildRunFilters',
    'compactQueryReportFilters',
    'defaultFilterValues',
    'extractScriptFilters',
    'humanizeFrappeError',
    'isEmptyFilterValue',
    'normalizeFilterMeta',
    'normalizeQueryReportColumns',
    'normalizeQueryReportRows',
    'scrubFieldname',
    'stripHtml',
    'QueryReportColumn',
    'QueryReportFilterMeta',
    'QueryReportFilters',
    'QueryReportFixture',
    'QueryReportMeta',
    'QueryReportRow',
    'QueryReportRunMessage',
    'ScriptFilterExtraction',
  ],
  'report/useQueryReport.ts': ['useQueryReport', 'UseQueryReportOptions', 'UseQueryReportResult'],
  'report/queryReportColumns.tsx': ['buildQueryReportColumns', 'buildQueryReportCsv', 'BuildQueryReportColumnsArgs'],
  'report/reportViewModel.ts': [
    'buildGridRows',
    'buildReportCsv',
    'columnAlign',
    'columnFilterTuple',
    'columnFilterTuples',
    'compareCellValues',
    'computeTotals',
    'DEFAULT_REPORT_PAGE_SIZE',
    'defaultColumnWidth',
    'defaultReportFieldnames',
    'fromDeskReportSettings',
    'orderReportRows',
    'parseDeskOrderBy',
    'parseReportFiltersParam',
    'REPORT_NUMERIC_FIELDTYPES',
    'REPORT_PAGE_SIZES',
    'reportColumnsFromMeta',
    'resolveSelectedColumns',
    'toDeskReportSettings',
    'DeskReportSettings',
    'ReportColumnDef',
    'ReportGridRow',
    'ReportRow',
    'ReportSortState',
    'ReportTotalsCell',
    'ReportViewConfig',
  ],
  'report/report-grid.tsx': ['ReportGrid', 'ReportGridProps'],
  'report/report-toolbar.tsx': ['ReportToolbar', 'ReportToolbarProps'],
  'report/savedReports.ts': ['useSavedReports', 'SavedReportSummary', 'UseSavedReportsResult'],
  'shared/measures.ts': ['dialogBodyMinWidth', 'overlayListMaxHeight'],
};

const IMPLEMENTATION = /^(export )?(async )?(function|const|let|class|interface) |^(export )?type \w+\s*=/m;
const MODEL_WORK =
  /useFrappeCollection|useLiveQuery|reportColumnsFromMeta|defaultReportFieldnames|orderReportRows|columnFilterTuples|<ReportGrid\b/;

describe('report shims (MPO-15, GL-28)', () => {
  it('re-exports every moved name from its old path', () => {
    for (const [rel, names] of Object.entries(SHIMS)) {
      const source = read(rel);
      expect(source, `${rel} must source from frappe-ui`).toMatch(/from ["']@multiplatform\.one\/frappe-ui["']/);
      for (const name of names) {
        expect(source, `${rel} must still hand out "${name}"`).toMatch(new RegExp(`\\b${name}\\b`));
      }
      expect(source, `${rel} is a re-export, not an implementation`).not.toMatch(IMPLEMENTATION);
    }
  });

  it('has DoctypeReportView render FrappeReportBuilder, with no model work of its own', () => {
    const screen = read('report/DoctypeReportView.tsx');
    expect(screen).toMatch(/import \{[^}]*\bFrappeReportBuilder\b[^}]*\} from "@multiplatform\.one\/frappe-ui";/);
    expect(screen).toContain('<FrappeReportBuilder');
    expect(screen).not.toMatch(MODEL_WORK);
  });

  it('keeps the legacy ReportView from being a third implementation', () => {
    const legacy = read('views/ReportView.tsx');
    expect(legacy).not.toMatch(MODEL_WORK);
    expect(legacy).not.toMatch(/<FrappeReportBuilder\b|<ReportBuilder\b/);
    expect(legacy).toMatch(/DoctypeReportView/);
  });

  it("wires the builder to the desk's report view", () => {
    const viewScreen = read('views/DoctypeViewScreen.tsx');
    expect(viewScreen).toMatch(/from "\.\.\/report\/DoctypeReportView"/);
    expect(viewScreen).toMatch(/case "report":[\s\S]{0,120}<\w*ReportView\b/);
  });

  it('keeps the barrel surface unchanged', () => {
    const barrel = read('index.ts');
    const renamed: Record<string, string> = {
      buildGridRows: 'buildReportGridRows',
      columnFilterTuple: 'reportColumnFilterTuple',
      columnFilterTuples: 'reportColumnFilterTuples',
      computeTotals: 'computeReportTotals',
      resolveSelectedColumns: 'resolveReportColumns',
      stripHtml: 'stripReportHtml',
      ReportToolbar: 'DoctypeReportToolbar',
      ReportToolbarProps: 'DoctypeReportToolbarProps',
    };
    const offBarrel = new Set([
      'columnAlign',
      'compareCellValues',
      'DEFAULT_REPORT_PAGE_SIZE',
      'defaultColumnWidth',
      'buildQueryReportCsv',
      'dialogBodyMinWidth',
      'overlayListMaxHeight',
    ]);
    for (const names of Object.values(SHIMS)) {
      for (const name of names) {
        if (offBarrel.has(name)) {
          continue;
        }
        const exported = renamed[name] ?? name;
        expect(barrel, `the backoffice barrel must still export "${exported}"`).toMatch(
          new RegExp(`\\b${exported}\\b`),
        );
      }
    }
  });
});
