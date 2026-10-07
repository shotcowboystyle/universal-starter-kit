/**
 * MPO-60 design-law source contracts for the Frappe view adapters.
 * R10: frappe.ui.form.on stays out of scope (no parallel hook runner).
 */
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const srcDir = path.resolve(__dirname, '.');

function read(file: string): string {
  return fs.readFileSync(path.resolve(srcDir, file), 'utf-8');
}

describe('Frappe view adapters — design-law 100%', () => {
  it('FrappeForm uses the house Button and does not implement frappe.ui.form.on (R10)', () => {
    const source = read('FrappeForm.tsx');
    expect(source).toContain('from "@repo/forms"');
    expect(source).toMatch(/import \{[^}]*Button[^}]*\} from "@repo\/forms"/);
    expect(source).not.toMatch(/from "tamagui".*Button|Button.*from "tamagui"/);
    expect(source).not.toContain('frappe.ui.form.on');
    expect(source).toContain('formCommonColors');
  });

  it('FrappeKanban does not use hex fills or sizeToken as fontSize (LC-65)', () => {
    const source = read('FrappeKanban.tsx');
    expect(source).not.toMatch(/#[0-9A-Fa-f]{3,8}/);
    expect(source).not.toMatch(/fontSize=\{knobProps\.sizeToken\}/);
    expect(source).toContain('knobProps.label');
    expect(source).toContain('componentColors.text.subtle');
  });

  it('FrappeCalendar event chrome uses the label fragment, not sizeToken as fontSize', () => {
    const source = read('FrappeCalendar.tsx');
    expect(source).not.toMatch(/fontSize=\{knobProps\.sizeToken\}/);
    expect(source).toContain('knobProps.label');
    expect(source).toContain('formCommonColors');
    expect(source).toContain('containerRadius');
  });

  it('FrappeDashboard timestamps use the label fragment and form ramps', () => {
    const source = read('FrappeDashboard.tsx');
    expect(source).toContain('formCommonColors');
    expect(source).toContain('knobProps.label');
    expect(source).toContain('knobProps.heading');
    expect(source).toContain('knobProps.textAccentColor');
    expect(source).not.toMatch(/fontSize="\$1"/);
  });

  it('FrappeKPICard skeleton is the catalog Card (no cherry-picked radius)', () => {
    const source = read('FrappeKPICard.tsx');
    expect(source).toContain('Card');
    expect(source).not.toContain('knobProps.borderRadius.borderRadius');
    expect(source).not.toMatch(/height=\{12\}|height=\{28\}/);
    expect(source).toMatch(/from "@repo\/ui"/);
  });

  it('FrappeGantt action errors use Alert and keep the adapter boundary', () => {
    const source = read('FrappeGantt.tsx');
    expect(source).toMatch(/import \{[^}]*Alert[^}]*\} from "@repo\/ui"/);
    expect(source).toMatch(/<Alert\b[^>]*intent="error"/);
    expect(source).toContain('containerRadius');
    expect(source).not.toContain('knobProps.borderRadius');
    expect(source).not.toMatch(/fontSize=\{knobProps\.sizeToken\}/);
    expect(source).not.toMatch(/\$red\d+/);
    expect(source).not.toMatch(/from ["'](?:@multiplatform\.one\/backoffice|\.\/desk\/)/);
  });

  it('FrappeReportView uses the house Button and label fragments (LC-54)', () => {
    const source = read('FrappeReportView.tsx');
    expect(source).toMatch(/import \{[^}]*Button[^}]*\} from "@repo\/forms"/);
    expect(source).not.toMatch(/Button.*from "tamagui"/);
    expect(source).toContain('formCommonColors');
    expect(source).toContain('knobProps.label');
    expect(source).not.toMatch(/fontSize="\$1"|fontSize="\$2"/);
  });

  it('report view toolbar filters are catalog Chip, not 999-radius wells', () => {
    const source = read('report/ReportViewToolbar.tsx');
    expect(source).toContain('<Chip');
    expect(source).not.toMatch(/borderRadius=\{999\}/);
  });

  it('FrappeReportBuilder toolbar is house Button and captions lock 400 (R7 / LC-54)', () => {
    // The builder composes its toolbar and grid (MPO-15, GL-28); the law
    // holds over the three files together.
    const source = ['FrappeReportBuilder.tsx', 'report/ReportViewToolbar.tsx', 'report/ReportGrid.tsx']
      .map(read)
      .join('\n');
    expect(source).toMatch(/import \{[^}]*Button[^}]*\} from "@repo\/forms"/);
    expect(source).not.toMatch(/Button.*from "tamagui"/);
    expect(source).not.toMatch(/fontWeight="600"|fontWeight="500"/);
    expect(source).toContain('fontWeight="400"');
    expect(source).not.toMatch(/<Button\b[^>]*\b(?:controlFill|backgroundColor|borderColor)=/);
  });

  it('FrappeTreeView empty chrome is EmptyState and labels use the label fragment', () => {
    const source = read('FrappeTreeView.tsx');
    expect(source).toMatch(/import \{[^}]*EmptyState[^}]*\} from "@repo\/ui"/);
    expect(source).toContain('<EmptyState');
    expect(source).toContain('useGlyphColor(formCommonColors.muted)');
    expect(source).not.toMatch(/<TreeStructureIcon\b[^>]*color=\{formCommonColors\./);
    expect(source).not.toMatch(/size=\{48\}/);
    expect(source).toContain('knobProps.label');
    expect(source).not.toMatch(/fontSize=\{display === "compressed" \? 12 : 14\}/);
    expect(source).toContain('formCommonColors');
  });

  it('list indicator pills are catalog Chip, not 999-radius wells', () => {
    const source = read('list/listColumns.tsx');
    expect(source).toContain('<Chip');
    expect(source).not.toMatch(/borderRadius=\{999\}/);
  });
});
