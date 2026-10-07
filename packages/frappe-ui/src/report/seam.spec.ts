/**
 * MPO-15 (GL-28) — the report seam, from this side.
 *
 * Two report concepts, a named query/script report and a doctype's report
 * view, used to carry four models: FrappeReportView and FrappeReportBuilder
 * here, reportShapes and reportViewModel plus DoctypeReportView one tier up
 * in `@repo/backoffice`. One model per concept lives here now,
 * and four things have to stay true for that to mean anything:
 *
 *  1. The package barrel hands every name out.
 *  2. The report modules reach nothing above them: no backoffice import and
 *     no bounce back through this package's own barrel.
 *  3. Each model is declared once across both packages, and scrub is the
 *     server's `frappe.scrub`.
 *  4. The exported components render through the models: FrappeReportView
 *     through the query-report model, FrappeReportBuilder through the
 *     report-view model.
 */
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const reportDir = path.resolve(__dirname);
const srcDir = path.resolve(__dirname, '..');
const publicDir = path.resolve(srcDir, '../..');

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...sourceFiles(full));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) {
      continue;
    }
    if (/\.(spec|stories)\./.test(entry.name)) {
      continue;
    }
    out.push(full);
  }
  return out;
}

function read(rel: string): string {
  return fs.readFileSync(path.resolve(srcDir, rel), 'utf-8');
}

function declaredIn(pattern: RegExp): string[] {
  return [...sourceFiles(srcDir), ...sourceFiles(path.resolve(publicDir, 'backoffice/src'))]
    .filter((file) => pattern.test(fs.readFileSync(file, 'utf-8')))
    .map((file) => path.relative(publicDir, file))
    .sort();
}

const QUERY_REPORT_NAMES = [
  'QueryReportColumn',
  'QueryReportRow',
  'QueryReportFilters',
  'QueryReportFilterMeta',
  'QueryReportMeta',
  'QueryReportFixture',
  'QueryReportRunMessage',
  'ScriptFilterExtraction',
  'buildRunFilters',
  'compactFilterValues',
  'compactQueryReportFilters',
  'defaultFilterValues',
  'extractScriptFilters',
  'humanizeFrappeError',
  'isEmptyFilterValue',
  'normalizeFilterMeta',
  'normalizeQueryReportColumns',
  'normalizeQueryReportPayload',
  'normalizeQueryReportRows',
  'scrubFieldname',
  'stripReportHtml',
  'useFrappeReport',
  'useQueryReport',
  'UseQueryReportOptions',
  'UseQueryReportResult',
  'buildQueryReportColumns',
  'buildQueryReportCsv',
  'BuildQueryReportColumnsArgs',
];

const REPORT_VIEW_NAMES = [
  'ReportColumnDef',
  'ReportRow',
  'ReportSortState',
  'ReportViewConfig',
  'DeskReportSettings',
  'ReportGridRow',
  'ReportTotalsCell',
  'REPORT_NUMERIC_FIELDTYPES',
  'REPORT_PAGE_SIZES',
  'DEFAULT_REPORT_PAGE_SIZE',
  'reportColumnsFromMeta',
  'defaultReportFieldnames',
  'resolveReportColumns',
  'reportColumnFilterTuple',
  'reportColumnFilterTuples',
  'parseReportFiltersParam',
  'parseDeskOrderBy',
  'toDeskReportSettings',
  'fromDeskReportSettings',
  'orderReportRows',
  'buildReportGridRows',
  'computeReportTotals',
  'buildReportCsv',
  'ReportGrid',
  'ReportGridProps',
  'ReportViewToolbar',
  'ReportViewToolbarProps',
  'useSavedReports',
  'SavedReportSummary',
  'UseSavedReportsResult',
  'dialogBodyMinWidth',
  'overlayListMaxHeight',
];

describe('report seam (MPO-15, GL-28)', () => {
  it('hands both report models out of the package barrel', () => {
    const barrel = read('index.ts');
    const start = barrel.indexOf('Report models (MPO-15');
    expect(start, 'the barrel must carry a report models block').toBeGreaterThan(-1);
    const block = barrel.slice(start);
    expect(block).toContain('from "./report/queryReport"');
    expect(block).toContain('from "./report/reportViewModel"');
    for (const name of [...QUERY_REPORT_NAMES, ...REPORT_VIEW_NAMES]) {
      expect(block, `the barrel must re-export "${name}"`).toMatch(new RegExp(`\\b${name}\\b`));
    }
  });

  it('keeps the report modules off backoffice and off their own barrel', () => {
    const files = [
      ...sourceFiles(reportDir),
      path.resolve(srcDir, 'FrappeReportView.tsx'),
      path.resolve(srcDir, 'FrappeReportBuilder.tsx'),
    ];
    for (const file of files) {
      const source = fs.readFileSync(file, 'utf-8');
      expect(source, file).not.toMatch(/from ["']@multiplatform\.one\/backoffice/);
      expect(source, file).not.toMatch(/from ["']@multiplatform\.one\/frappe-ui/);
      expect(source, file).not.toMatch(/from ["']\.\.?\/index["']/);
    }
  });

  it("scrubs a label the way the server's frappe.scrub does", async () => {
    const modelPath = './queryReport';
    const { scrubFieldname } = (await import(/* @vite-ignore */ modelPath)) as {
      scrubFieldname: (label: string) => string;
    };
    expect(scrubFieldname('Modified On')).toBe('modified_on');
    expect(scrubFieldname('Multi-Word Label')).toBe('multi_word_label');
    expect(scrubFieldname('Size (MB)')).toBe('size_(mb)');
    expect(scrubFieldname('Assigned To/Owner')).toBe('assigned_to/owner');
    expect(scrubFieldname('  Total (USD) ')).toBe('__total_(usd)_');
  });

  it('declares the query-report model once, across both packages', () => {
    expect(declaredIn(/function scrubFieldname\b/)).toEqual(['frappe-ui/src/report/queryReport.ts']);
    expect(declaredIn(/function normalizeQueryReportColumns\b/)).toEqual(['frappe-ui/src/report/queryReport.ts']);
    expect(declaredIn(/function normalizeQueryReportRows\b/)).toEqual(['frappe-ui/src/report/queryReport.ts']);
    expect(declaredIn(/function (?:compactFilterValues|compactQueryReportFilters)\b/)).toEqual([
      'frappe-ui/src/report/queryReport.ts',
    ]);
    expect(declaredIn(/interface (?:QueryReportColumn|FrappeReportColumn)\b/)).toEqual([
      'frappe-ui/src/report/queryReport.ts',
    ]);
  });

  it('declares the report-view model once, across both packages', () => {
    for (const name of [
      'reportColumnsFromMeta',
      'defaultReportFieldnames',
      'columnFilterTuple',
      'orderReportRows',
      'buildReportCsv',
      'parseReportFiltersParam',
    ]) {
      expect(declaredIn(new RegExp(`function ${name}\\b`)), name).toEqual(['frappe-ui/src/report/reportViewModel.ts']);
    }
    expect(declaredIn(/REPORT_NUMERIC_FIELDTYPES\s*=/)).toEqual(['frappe-ui/src/report/reportViewModel.ts']);
  });

  it('renders FrappeReportView through the query-report model', () => {
    const view = read('FrappeReportView.tsx');
    expect(view).toContain('from "./report/queryReport"');
    expect(view).toContain('from "./report/useFrappeReport"');
    expect(view).not.toMatch(/export function (?:normalizeReport|compactFilterValues|scrubFieldname)/);
    const useQueryReport = read('report/useQueryReport.ts');
    expect(useQueryReport, 'the desk hook runs through the same transport').toContain('from "./useFrappeReport"');
  });

  it('renders FrappeReportBuilder through the report-view model', () => {
    const builder = read('FrappeReportBuilder.tsx');
    expect(builder).toContain('from "./report/reportViewModel"');
    for (const call of ['reportColumnsFromMeta(', 'defaultReportFieldnames(', 'orderReportRows(']) {
      expect(builder, call).toContain(call);
    }
    expect(builder).toContain('<ReportGrid');
    expect(builder).not.toMatch(/<ReportBuilder\b/);
  });
});
