/**
 * MPO-15 — the desk list seam, from this side.
 *
 * The list column builder, its field selection and cell helpers, and the
 * filterable-field vocabulary moved down to `@repo/frappe-ui`.
 * The move must be invisible to anyone importing this package: the barrel
 * keeps the same names and the `@repo/backoffice/src/list/*`
 * deep imports keep resolving (the GNOME shim deep-imports all five). And
 * the desk list screen has to call the moved code, not a copy of it.
 *
 * Source-level on purpose, like formEngineShim.spec.ts: importing the
 * backoffice barrel here would drag the whole desk UI in to prove a
 * re-export.
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
  'list/listColumns.tsx': ['buildListColumns', 'BuildListColumnsArgs', 'ListDoc', 'ListRow'],
  'list/listFields.ts': ['listDocumentColumnIds', 'listFieldsToFetch', 'listViewFields'],
  'list/listFormat.ts': [
    'formatDateCell',
    'formatTimeAgo',
    'parseFrappeDate',
    'parseTagsField',
    'parseUserListField',
    'stripHtmlPreview',
  ],
  'list/statusColors.ts': ['statusPillColors', 'StatusPillColors'],
  'list/filter-fields.tsx': [
    'defaultOperatorForKind',
    'DESK_OPERATOR_LABELS',
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
  ],
};

describe('desk list shims (MPO-15)', () => {
  it('re-exports every moved name from its old path', () => {
    for (const [rel, names] of Object.entries(SHIMS)) {
      const source = read(rel);
      expect(source, `${rel} must source from frappe-ui`).toMatch(/from ["']@multiplatform\.one\/frappe-ui["']/);
      for (const name of names) {
        expect(source, `${rel} must still hand out "${name}"`).toMatch(new RegExp(`\\b${name}\\b`));
      }
      expect(source, `${rel} is a re-export, not an implementation`).not.toMatch(
        /^(export )?(function|const|class|interface) |^(export )?type \w+\s*=/m,
      );
    }
  });

  it("has the desk list screen call frappe-ui's column builder and vocabulary", () => {
    const screen = read('list/DoctypeListScreen.tsx');
    const frappeUiImport = /import \{([^}]*)\} from "@multiplatform\.one\/frappe-ui";/.exec(screen)?.[1];
    for (const name of ['buildListColumns', 'listFieldsToFetch', 'docFieldsToFilterFields']) {
      expect(frappeUiImport, `DoctypeListScreen must import "${name}" from frappe-ui`).toMatch(
        new RegExp(`\\b${name}\\b`),
      );
      expect(screen, `DoctypeListScreen must call "${name}"`).toContain(`${name}(`);
    }
    expect(screen).not.toMatch(/from "\.\/(listColumns|listFields|filter-fields)"/);
  });

  it('keeps the barrel surface unchanged', () => {
    const barrel = read('index.ts');
    for (const names of Object.values(SHIMS)) {
      for (const name of names) {
        if (name === 'listDocumentColumnIds' || name === 'stripHtmlPreview') {
          continue;
        }
        expect(barrel, `the backoffice barrel must still export "${name}"`).toMatch(new RegExp(`\\b${name}\\b`));
      }
    }
  });
});
