/**
 * MPO-15 — the form-engine seam, from this side.
 *
 * The engine moved down to `@repo/frappe-ui`
 * (`src/formEngine/*`). The move must be invisible to anyone importing this
 * package: the barrel keeps the same names, and the
 * `@repo/backoffice/src/form/*` deep imports keep resolving
 * (the GNOME shim deep-imports `form/fieldPermissions` and
 * `form/createPrefill`; `DocFormScreen` deep-imports `form/formActions`).
 *
 * Source-level on purpose: importing the backoffice barrel here would drag
 * the whole desk UI into a node-ish spec run to prove a re-export.
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
  'form/formLayout.ts': [
    'buildCopyValues',
    'buildCreateDefaults',
    'buildFormTabs',
    'isPromptNamed',
    'BuildTabsOptions',
    'FormTab',
  ],
  'form/useFormEngine.ts': ['useFormEngine', 'FormEngine'],
  'form/fieldPermissions.ts': ['buildPermLevelMatrix', 'canReadLevel', 'canWriteLevel', 'LevelPerm', 'PermLevelMatrix'],
  'form/fetchFrom.ts': ['applyFetchedValues', 'buildFetchMap', 'isFetchLocked', 'FetchMap', 'FetchRule'],
  'form/dirtyTracking.ts': ['computeDirtyFields', 'isEmptyValue', 'isSameValue'],
  'form/createPrefill.ts': ['setCreatePrefill', 'takeCreatePrefill'],
};

describe('form engine shims (MPO-15)', () => {
  it('re-exports every hoisted name from its old path', () => {
    for (const [rel, names] of Object.entries(SHIMS)) {
      const source = read(rel);
      expect(source, `${rel} must source from frappe-ui`).toMatch(/from ["']@multiplatform\.one\/frappe-ui["']/);
      for (const name of names) {
        expect(source, `${rel} must still hand out "${name}"`).toContain(name);
      }
      // A shim that grew an implementation back is the drift this guards.
      expect(source, `${rel} is a re-export, not an implementation`).not.toMatch(
        /^(export )?function |^const |^class /m,
      );
    }
  });

  it('reaches formActions through its dedicated subpath, not src/*', () => {
    // A deep, extension-less "@repo/frappe-ui/src/*" import does
    // NOT resolve under the storybook workspace aliases (bare-name alias →
    // src/index.ts) — the same trap ./dependsOn already documents.
    const source = read('form/formActions.ts');
    expect(source).toMatch(/from ["']@multiplatform\.one\/frappe-ui\/formActions["']/);
    expect(source).not.toMatch(/from ["']@multiplatform\.one\/frappe-ui\/src\//);
  });

  it('stops declaring the meta shapes and re-exports them instead', () => {
    const source = read('shared/useDoctypeMeta.ts');
    for (const name of ['DocFieldMeta', 'DocLinkMeta', 'DocPermissionRule', 'DoctypeMeta']) {
      expect(source, `${name} must no longer be declared here`).not.toContain(`export interface ${name} {`);
    }
    expect(source, 'the shapes still leave this module').toMatch(
      /export type \{[\s\S]*DocFieldMeta[\s\S]*\} from "@multiplatform\.one\/frappe-ui"/,
    );
    // The loader hook itself stays — it needs the backoffice app context.
    expect(source).toContain('export function useDoctypeMeta');
    expect(source).toContain('export interface DoctypeMetaBundle');
  });

  it('keeps the barrel surface unchanged', () => {
    const barrel = read('index.ts');
    const names = [
      'buildPermLevelMatrix',
      'canReadLevel',
      'canWriteLevel',
      'applyFetchedValues',
      'buildFetchMap',
      'isFetchLocked',
      'computeDirtyFields',
      'isEmptyValue',
      'isSameValue',
      'setCreatePrefill',
      'takeCreatePrefill',
      'buildCopyValues',
      'buildCreateDefaults',
      'buildFormTabs',
      'isPromptNamed',
      'useFormEngine',
      'DocFieldMeta',
      'DocLinkMeta',
      'DocPermissionRule',
      'DoctypeMeta',
    ];
    for (const name of names) {
      expect(barrel, `the backoffice barrel must still export "${name}"`).toContain(name);
    }
  });
});
