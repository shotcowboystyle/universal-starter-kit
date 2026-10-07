/**
 * MPO-60 design-law source contracts for remaining Screens/Backoffice chrome.
 * Rulings: /tmp/cursor-mpo-lanes/RULINGS-2026-08-28.md (R7 weight 400; R6 size
 * table; R2 single-line pill). `one` stays behind ./one-adapter.
 */
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const srcDir = path.resolve(__dirname);
const repoRoot = path.resolve(__dirname, '../../..');

function read(rel: string): string {
  return fs.readFileSync(path.resolve(srcDir, rel), 'utf-8');
}

describe('Backoffice screens — design-law 100%', () => {
  it('does not import one outside oneAdapter', () => {
    const adapter = read('oneAdapter/index.tsx');
    expect(adapter).toMatch(/from ["']one["']/);
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === 'oneAdapter') {
            continue;
          }
          walk(full);
          continue;
        }
        if (!/\.(tsx|ts)$/.test(entry.name) || entry.name.includes('.spec.')) {
          continue;
        }
        const source = fs.readFileSync(full, 'utf-8');
        expect(source, full).not.toMatch(/from ["']one["']/);
        expect(source, full).not.toMatch(/from ["']one\//);
      }
    };
    walk(srcDir);
  });

  it('ListBulkActionsBar rides complete surface fragments and R7 weight 400', () => {
    const source = read('list/ListBulkActionsBar.tsx');
    expect(source).toContain('useResolvedKnobs');
    expect(source).toContain('knobProps.surface');
    expect(source).toContain('knobProps.borderRadius');
    expect(source).toContain('knobProps.panelPadding');
    expect(source).toContain('fontWeight="400"');
    expect(source).not.toMatch(/fontWeight="600"|fontWeight="500"/);
    expect(source).toMatch(/import \{ Button \} from "@repo\/forms"/);
  });

  it('KanbanView card title uses the label fragment, not sizeToken as fontSize (LC-65)', () => {
    const source = read('views/KanbanView.tsx');
    expect(source).not.toMatch(/fontSize=\{knobProps\.sizeToken\}/);
    expect(source).toContain('knobProps.label');
    expect(source).not.toMatch(/fontWeight="500"|fontWeight="700"/);
  });

  it('FormToolbar title rides pageTitle + heading; icons ride controlIcon', () => {
    const source = read('form/FormToolbar.tsx');
    expect(source).toContain('knobProps.pageTitle');
    expect(source).toContain('knobProps.heading');
    expect(source).toContain('controlIcon');
    expect(source).toContain('iconSize');
    expect(source).not.toMatch(/size=\{16\}|size=\{18\}/);
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
    expect(source).not.toMatch(/borderRadius=\{999\}/);
    expect(source).toContain('formatNumber');
    expect(source).not.toContain('toLocaleString');
  });

  it('Workspace shortcut counts are catalog Chip; labels and titles weight 400', () => {
    const shortcut = read('workspace/WorkspaceShortcut.tsx');
    expect(shortcut).toContain('<Chip');
    expect(shortcut).toContain('knobProps.label');
    expect(shortcut).toContain('controlIcon');
    expect(shortcut).not.toMatch(/borderRadius=\{1000\}|borderRadius=\{999\}/);
    expect(shortcut).not.toMatch(/fontWeight="600"|fontWeight="500"|fontWeight="700"/);
    expect(shortcut).not.toMatch(/size=\{16\}|size=\{14\}/);
    const recent = read('workspace/WorkspaceRecents.tsx');
    expect(recent).toContain('knobProps.label');
    expect(recent).toContain('controlIcon');
    expect(recent).not.toMatch(/size=\{14\}/);
    for (const rel of [
      'workspace/WorkspaceNumberCard.tsx',
      'workspace/WorkspaceQuickList.tsx',
      'workspace/WorkspaceChartBlock.tsx',
      'workspace/WorkspaceLinkCard.tsx',
    ]) {
      const source = read(rel);
      expect(source, rel).toMatch(/knobProps\.(heading|label)/);
      expect(source, rel).not.toMatch(/fontWeight="600"|fontWeight="500"|fontWeight="700"/);
    }
  });

  it('query-report filter bar spreads gap + panelPadding', () => {
    const source = read('report/queryReportFilterBar.tsx');
    expect(source).toContain('knobProps.gap');
    expect(source).toContain('knobProps.panelPadding');
    expect(source).not.toMatch(/gap="\$2"/);
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
