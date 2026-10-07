/**
 * MPO-60 design-law source contracts for remaining Frappe wrappers.
 * R10: frappe.ui.form.on stays out of scope. R11: no pip on media.
 * R12: no Tint wrap.
 */
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const srcDir = path.resolve(__dirname, '.');

function read(file: string): string {
  return fs.readFileSync(path.resolve(srcDir, file), 'utf-8');
}

function codeOnly(source: string): string {
  return source.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/\/\/.*$/gm, '');
}

describe('Frappe remainder wrappers — design-law 100%', () => {
  it('DynamicLink composes forms Select and Frappe Link', () => {
    const source = read('fields/DynamicLink.tsx');
    expect(source).toContain('from "@repo/forms"');
    expect(source).toContain('FormsSelect');
    expect(source).toContain('from "./Link"');
    expect(source).not.toMatch(/from "tamagui".*Select|Select.*from "tamagui"/);
    expect(codeOnly(source)).not.toContain('frappe.ui.form.on');
  });

  it('SmallText and LongText compose forms TextArea', () => {
    const small = read('fields/SmallText/index.tsx');
    const long = read('fields/LongText/index.tsx');
    expect(small).toContain('TextArea');
    expect(long).toContain('TextArea');
    expect(small).toContain('minRows={2}');
    expect(long).toContain('minRows={minRows}');
  });

  it('Html uses FieldLayout + cardSurface and does not fork 14px type', () => {
    const source = read('fields/HTML/index.tsx');
    expect(source).toContain('FieldLayout');
    expect(source).toContain('cardSurface');
    expect(source).not.toMatch(/fontSize:\s*14/);
    expect(source).not.toMatch(/fontSize=\{14\}/);
  });

  it('ReadOnly uses FieldLayout and body fragment, not sizeToken as fontSize', () => {
    const source = read('fields/ReadOnly/index.tsx');
    expect(source).toContain('FieldLayout');
    expect(source).toContain('formCommonColors');
    expect(source).toContain('knobProps.body');
    expect(source).not.toMatch(/fontSize=\{knobProps\.sizeToken\}/);
  });

  it('TextEditor is a thin wrap of RichTextEditor', () => {
    const source = read('fields/TextEditor/index.tsx');
    expect(source).toContain('RichTextEditor');
    expect(source).toContain('from "@repo/rich-text"');
    expect(source).not.toContain('useEditor');
    expect(codeOnly(source)).not.toContain('frappe.ui.form.on');
  });

  it('Select uses canonical onChange (LC-14)', () => {
    const source = read('fields/Select/index.tsx');
    expect(source).toContain('FormsSelect');
    expect(source).toContain('onChange={(val) => onChange?.(');
    expect(source).not.toContain('onValueChange');
  });

  it('FrappeChartCard skeleton is the catalog Card (no cherry-picked radius)', () => {
    const source = read('FrappeChartCard.tsx');
    expect(source).toContain('Card');
    expect(source).toMatch(/from "@repo\/ui"/);
    expect(source).not.toContain('knobProps.borderRadius.borderRadius');
    expect(source).not.toContain('<Tint');
  });

  it('FrappeChartCard does not import the t5 FrappeDashboard module', () => {
    const card = read('FrappeChartCard.tsx');
    const stories = read('FrappeChartCard.stories.tsx');
    expect(card).not.toMatch(/from ["']\.\/FrappeDashboard["']/);
    expect(stories).not.toMatch(/from ["']\.\/FrappeDashboard["']/);
    expect(card).toMatch(/from ["']\.\/ChartCard["']/);
    expect(stories).toMatch(/from ["']\.\/ChartCard["']/);
  });

  it('FrappeImageView uses catalog Card, controlIcon icons, and no media pip (R11/R12)', () => {
    const source = read('FrappeImageView.tsx');
    expect(source).toContain('Card');
    expect(source).toContain('controlIcon');
    expect(source).not.toMatch(/size=\{48\}/);
    expect(source).not.toContain('<Tint');
    expect(source).toContain('No status pip');
  });

  it('FrappeTreeView uses label fragment and controlIcon, not 12/14px', () => {
    const source = read('FrappeTreeView.tsx');
    expect(source).toContain('knobProps.label');
    expect(source).toContain('controlIcon');
    expect(source).not.toMatch(/fontSize=\{display === "compressed" \? 12/);
    expect(source).not.toMatch(/size=\{48\}/);
  });

  it('FrappeReportBuilder uses house Button + PopoverContent and R7 weight 400', () => {
    // The builder composes its toolbar and grid (MPO-15, GL-28); the law
    // holds over the three files together.
    const source = ['FrappeReportBuilder.tsx', 'report/ReportViewToolbar.tsx', 'report/ReportGrid.tsx']
      .map(read)
      .join('\n');
    expect(source).toContain('PopoverContent');
    expect(source).toContain('from "@repo/forms"');
    expect(source).toContain('Button');
    expect(source).not.toMatch(/fontWeight="600"|fontWeight="500"/);
    expect(source).toContain('fontWeight="400"');
    expect(source).not.toContain('borderLeftWidth');
    expect(source).not.toContain('<Tint');
  });

  it('FrappeReportView refresh is house Button and updating copy uses form ramps', () => {
    const source = read('FrappeReportView.tsx');
    expect(source).toMatch(/Button.*from "@repo\/forms"/);
    expect(source).toContain('formCommonColors');
    expect(source).toContain('knobProps.label');
    expect(source).not.toMatch(/from "tamagui".*Button|Button.*from "tamagui"/);
    expect(codeOnly(source)).not.toContain('frappe.ui.form.on');
  });

  it('FrappeAssignment captions lock 400 and use form ramps', () => {
    const source = read('FrappeAssignment.tsx');
    expect(source).toContain('fontWeight="400"');
    expect(source).toContain('formCommonColors');
    expect(source).toContain('controlIcon');
    expect(source).not.toMatch(/fontWeight="600"|fontWeight="500"/);
    expect(source).not.toContain('<Tint');
  });

  it('FrappeLikedBy liked heart uses formCommonColors.error, not a CSS var fill', () => {
    const source = read('FrappeLikedBy.tsx');
    expect(source).toContain('formCommonColors.error');
    expect(codeOnly(source)).not.toContain('var(--red10)');
    expect(source).not.toContain('<Tint');
  });

  it('Desk pages use body fragment, not sizeToken as fontSize; form back is house Button', () => {
    const form = read('desk/DeskFormPage.tsx');
    const list = read('desk/DeskListPage.tsx');
    expect(form).toMatch(/Button.*from "@repo\/forms"/);
    expect(form).not.toMatch(/fontSize=\{knobProps\.sizeToken\}/);
    expect(list).not.toMatch(/fontSize=\{knobProps\.sizeToken\}/);
    expect(form).toContain('formCommonColors.muted');
    expect(list).toContain('formCommonColors.muted');
  });

  it('native Date trigger/actions are house Button', () => {
    const source = read('fields/Date/index.native.tsx');
    expect(source).toMatch(/Button[\s\S]*from "@repo\/forms"/);
    expect(source).not.toMatch(/Button.*from "tamagui"/);
  });

  it('fieldRegistry TextEditor fallback is Skeleton; SmallText/LongText use textAreaProps', () => {
    const source = read('fieldRegistry.ts');
    expect(source).toContain('disabledTextAreaBlock');
    expect(source).toContain('textAreaProps');
    expect(source).toContain('Skeleton');
    expect(source).not.toContain('createElement("div", null, "Loading editor...")');
    expect(codeOnly(source)).not.toContain('frappe.ui.form.on');
  });

  it('remainder sources do not wrap Cards in Tint (R12) or run form hooks (R10)', () => {
    const files = [
      'FrappeChartCard.tsx',
      'FrappeImageView.tsx',
      'FrappeTreeView.tsx',
      'FrappeReportBuilder.tsx',
      'FrappeReportView.tsx',
      'FrappeAssignment.tsx',
      'FrappeLikedBy.tsx',
      'FrappeGantt.tsx',
      'fields/DynamicLink.tsx',
      'fields/HTML/index.tsx',
      'fields/TextEditor/index.tsx',
    ];
    for (const file of files) {
      const source = read(file);
      expect(source, file).not.toContain('<Tint');
      expect(codeOnly(source), file).not.toContain('frappe.ui.form.on');
    }
  });
});
