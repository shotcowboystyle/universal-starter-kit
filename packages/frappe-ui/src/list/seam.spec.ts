/**
 * MPO-15 — the desk list seam, from this side.
 *
 * The list column builder and the filterable-field vocabulary used to live
 * in `@repo/backoffice`, one tier above this package, so
 * FrappeTable could not default its columns from meta and the two list
 * stacks kept two filter-field tables. Both live here now, and three things
 * have to stay true for that to mean anything:
 *
 *  1. The package barrel hands every name out.
 *  2. The list modules reach nothing above them: no backoffice import, and
 *     no bounce back through this package's own barrel.
 *  3. One filterable-field vocabulary: only `filterFields.ts` declares which
 *     fieldtypes filter and which standard doc fields every doctype has.
 */
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const listDir = path.resolve(__dirname);
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

const LIST_NAMES = [
  'buildListColumns',
  'BuildListColumnsArgs',
  'ListDoc',
  'ListRow',
  'listDocumentColumnIds',
  'listFieldsToFetch',
  'listViewFields',
  'formatDateCell',
  'formatTimeAgo',
  'parseFrappeDate',
  'parseTagsField',
  'parseUserListField',
  'stripHtmlPreview',
  'statusPillColors',
  'StatusPillColors',
];

const VOCABULARY_NAMES = [
  'defaultOperatorForKind',
  'DESK_OPERATOR_LABELS',
  'docFieldsToFilterFields',
  'draftToTuple',
  'fieldKind',
  'fieldLabelFor',
  'filterableFieldsFromMeta',
  'filterTupleLabel',
  'operatorsForKind',
  'quickFilterValue',
  'selectOptionsFromField',
  'setFieldFilter',
  'standardDocFilterFields',
  'standardFiltersFromMeta',
  'tupleToDraft',
  'DeskOperator',
  'FilterFieldDescriptor',
  'FilterFieldKind',
  'FilterRowDraft',
];

describe('desk list seam (MPO-15)', () => {
  it('hands the list and the vocabulary out of the package barrel', () => {
    const barrel = fs.readFileSync(path.resolve(srcDir, 'index.ts'), 'utf-8');
    const block = barrel.slice(barrel.indexOf('Desk List (MPO-15)'));
    expect(block, 'the barrel must carry a desk list block').toContain('from "./list/listColumns"');
    for (const name of [...LIST_NAMES, ...VOCABULARY_NAMES]) {
      expect(block, `the barrel must re-export "${name}"`).toMatch(new RegExp(`\\b${name}\\b`));
    }
  });

  it('keeps the list modules off backoffice and off their own barrel', () => {
    for (const file of sourceFiles(listDir)) {
      const source = fs.readFileSync(file, 'utf-8');
      expect(source, file).not.toMatch(/from ["']@multiplatform\.one\/backoffice/);
      expect(source, file).not.toMatch(/from ["']@multiplatform\.one\/frappe-ui/);
      expect(source, file).not.toMatch(/from ["']\.\.\/index["']/);
    }
  });

  it('declares the filterable-field table once, across both list stacks', () => {
    const declares = /NON_FILTERABLE_FIELDTYPES\s*=|STANDARD_DOC_FIELDS\s*[:=]|function standardDocFilterFields/;
    const owners = [...sourceFiles(srcDir), ...sourceFiles(path.resolve(publicDir, 'backoffice/src'))]
      .filter((file) => declares.test(fs.readFileSync(file, 'utf-8')))
      .map((file) => path.relative(publicDir, file));
    expect(owners).toEqual(['frappe-ui/src/filterFields.ts']);
  });

  it("derives FrappeTable's default columns through the one column builder", () => {
    const table = fs.readFileSync(path.resolve(srcDir, 'FrappeTable.tsx'), 'utf-8');
    expect(table).toMatch(/columns\?: DataTableColumn/);
    expect(table).toContain('from "./list/listColumns"');
    expect(table).toMatch(/buildListColumns\(/);
  });
});
