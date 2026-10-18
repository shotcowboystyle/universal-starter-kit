/**
 * MPO-60 design-law source contracts for remaining Screens/Backoffice chrome.
 * Rulings: /tmp/cursor-mpo-lanes/RULINGS-2026-08-28.md (R7 weight 400; R6 size
 * table; R2 single-line pill). `one` stays behind ./one-adapter.
 */
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const srcDir = path.resolve(import.meta.dirname);
const repoRoot = path.resolve(import.meta.dirname, '../../..');

const read = (rel: string): string => fs.readFileSync(path.resolve(srcDir, rel), 'utf-8');

const TEST_FILE = /\.(?:spec|test)\./u;

/** Non-test .ts/.tsx sources under `dir`, skipping the oneAdapter directory. */
const sourcesOutsideOneAdapter = (dir: string): string[] => {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'oneAdapter') {
        files.push(...sourcesOutsideOneAdapter(full));
      }
    } else if (/\.tsx?$/u.test(entry.name) && !TEST_FILE.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
};

describe('Backoffice screens — design-law 100%', () => {
  it('does not import one outside oneAdapter', () => {
    const adapter = read('oneAdapter/index.tsx');
    expect(adapter).toMatch(/from ["']one["']/u);
    for (const full of sourcesOutsideOneAdapter(srcDir)) {
      const source = fs.readFileSync(full, 'utf-8');
      expect(source, full).not.toMatch(/from ["']one["']/u);
      expect(source, full).not.toMatch(/from ["']one\//u);
    }
  });

  it('ListBulkActionsBar rides complete surface fragments and R7 weight 400', () => {
    const source = read('list/ListBulkActionsBar.tsx');
    expect(source).toContain('useResolvedKnobs');
    expect(source).toContain('knobProps.surface');
    expect(source).toContain('knobProps.borderRadius');
    expect(source).toContain('knobProps.panelPadding');
    expect(source).toContain('fontWeight="400"');
    expect(source).not.toMatch(/fontWeight="600"|fontWeight="500"/u);
    expect(source).toMatch(/import \{ Button \} from "@repo\/forms"/u);
  });

  it('KanbanView card title uses the label fragment, not sizeToken as fontSize (LC-65)', () => {
    const source = read('views/KanbanView.tsx');
    expect(source).not.toMatch(/fontSize=\{knobProps\.sizeToken\}/u);
    expect(source).toContain('knobProps.label');
    expect(source).not.toMatch(/fontWeight="500"|fontWeight="700"/u);
  });

  it('FormToolbar title rides pageTitle + heading; icons ride controlIcon', () => {
    const source = read('form/FormToolbar.tsx');
    expect(source).toContain('knobProps.pageTitle');
    expect(source).toContain('knobProps.heading');
    expect(source).toContain('controlIcon');
    expect(source).toContain('iconSize');
    expect(source).not.toMatch(/size=\{16\}|size=\{18\}/u);
  });

  it('DoctypeListScreen and QueryReportScreen page frames spread gap + panelPadding', () => {
    const list = read('list/DoctypeListScreen.tsx');
    expect(list).toContain('knobProps.panelPadding');
    expect(list).toContain('knobProps.pageTitle');
    const report = read('report/QueryReportScreen.tsx');
    expect(report).toContain('knobProps.panelPadding');
    expect(report).toContain('knobProps.gap');
  });

  it('report filter chips are catalog Chip, not a private 999-radius pill', () => {
    const source = read('views/report-controls.tsx');
    expect(source).toContain('<Chip');
    expect(source).not.toMatch(/borderRadius=\{999\}/u);
    expect(source).toContain('formatNumber');
    expect(source).not.toContain('toLocaleString');
  });

  it('Workspace shortcut counts are catalog Chip; labels and titles weight 400', () => {
    const shortcut = read('workspace/WorkspaceShortcut.tsx');
    expect(shortcut).toContain('<Chip');
    expect(shortcut).toContain('knobProps.label');
    expect(shortcut).toContain('controlIcon');
    expect(shortcut).not.toMatch(/borderRadius=\{1000\}|borderRadius=\{999\}/u);
    expect(shortcut).not.toMatch(/fontWeight="600"|fontWeight="500"|fontWeight="700"/u);
    expect(shortcut).not.toMatch(/size=\{16\}|size=\{14\}/u);
    const recent = read('workspace/WorkspaceRecents.tsx');
    expect(recent).toContain('knobProps.label');
    expect(recent).toContain('controlIcon');
    expect(recent).not.toMatch(/size=\{14\}/u);
    for (const rel of [
      'workspace/WorkspaceNumberCard.tsx',
      'workspace/WorkspaceQuickList.tsx',
      'workspace/WorkspaceChartBlock.tsx',
      'workspace/WorkspaceLinkCard.tsx',
    ]) {
      const source = read(rel);
      expect(source, rel).toMatch(/knobProps\.(?:heading|label)/u);
      expect(source, rel).not.toMatch(/fontWeight="600"|fontWeight="500"|fontWeight="700"/u);
    }
  });

  it('query-report filter bar spreads gap + panelPadding', () => {
    const source = read('report/query-report-filter-bar.tsx');
    expect(source).toContain('knobProps.gap');
    expect(source).toContain('knobProps.panelPadding');
    expect(source).not.toMatch(/gap="\$2"/u);
  });

  it('listed Screens/Backoffice stories export named meta with status stable', () => {
    const stories = [
      'features/backoffice/views/CalendarView.stories.tsx',
      'features/backoffice/views/DashboardView.stories.tsx',
      'features/backoffice/form/DocFormScreen.stories.tsx',
      'features/backoffice/list/DoctypeListScreen.stories.tsx',
      'features/backoffice/report/DoctypeReportView.stories.tsx',
      'features/backoffice/form/FormConnections.stories.tsx',
      'features/backoffice/form/FormDialogs.stories.tsx',
      'features/backoffice/form/FormSidebarPanel.stories.tsx',
      'features/backoffice/form/FormTimeline.stories.tsx',
      'features/backoffice/form/FormToolbar.stories.tsx',
      'features/backoffice/form/FormToolbarPager.stories.tsx',
      'features/backoffice/chrome/HelpMenu.stories.tsx',
      'features/backoffice/views/ImageView.stories.tsx',
      'features/backoffice/views/KanbanView.stories.tsx',
      'features/backoffice/views/KanbanBoardControls.stories.tsx',
      'features/backoffice/list/ListBulkActionsBar.stories.tsx',
      'features/backoffice/list/ListBulkDialogs.stories.tsx',
      'features/backoffice/list/ListFilterBar.stories.tsx',
      'features/backoffice/list/ListSidebar.stories.tsx',
      'features/backoffice/chrome/NotificationsButton.stories.tsx',
      'features/backoffice/report/QueryReportScreen.stories.tsx',
      'features/backoffice/report/QueryReportFilters.stories.tsx',
      'features/backoffice/quickEntry/QuickEntryDialog.stories.tsx',
      'features/backoffice/views/ReportView.stories.tsx',
      'features/backoffice/shell/BackofficeShell.stories.tsx',
      'features/backoffice/chrome/UserMenu.stories.tsx',
      'features/backoffice/views/ViewHeader.stories.tsx',
      'features/backoffice/workspace/WorkspaceScreen.stories.tsx',
      'features/todos/Todos.stories.tsx',
      'features/wallet/Wallet.stories.tsx',
    ];
    for (const rel of stories) {
      const source = fs.readFileSync(path.join(repoRoot, rel), 'utf-8');
      expect(source, rel).toContain('const meta =');
      expect(source, rel).toContain('export default meta');
      expect(source, rel).toContain('status: { type: "stable" }');
    }
  });
});
