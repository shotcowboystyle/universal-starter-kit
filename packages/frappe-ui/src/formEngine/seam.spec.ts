import fs from 'node:fs';
import path from 'node:path';

/**
 * MPO-15 — the form-engine seam, from this side.
 *
 * The desk form engine used to live in `@repo/backoffice`, one
 * tier ABOVE this package, so `FrappeForm` could not reach it: an app author
 * who imported the EXPORTED component got a strictly weaker form than the
 * desk renders for the same doctype. The engine lives here now.
 *
 * Three things have to stay true for that to mean anything, and each one has
 * broken silently in this repo before:
 *
 *  1. The engine is REACHABLE from the package barrel — a hoist that lands
 *     the files but leaves them unexported moves the problem, not the code.
 *  2. Nothing under `public/frappe-ui/src` imports `@repo/`
 *     `backoffice`. A lower tier importing a higher one is the defect the
 *     hoist exists to remove; re-introducing it here would be a cycle
 *     (backoffice already depends on this package).
 *  3. The engine modules do not reach back up through the barrel either —
 *     `formLayout` takes its FieldSchema/FormSchema types from the sibling
 *     modules directly, so importing the engine never drags SchemaForm,
 *     FrappeTable and the whole table/native stack into a node-ish consumer.
 */
import type { DocTypeField, DocTypeLink, DocTypeMeta, DocTypePermission, FrappeFieldType } from '@repo/frappe';
import { describe, expect, expectTypeOf, it } from 'vitest';

import type { DocFieldMeta, DocLinkMeta, DocPermissionRule, DoctypeMeta } from './doctypeMeta';

import * as formEngine from './index';

const engineDir = path.resolve(__dirname);
const srcDir = path.resolve(__dirname, '..');

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
    out.push(full);
  }
  return out;
}

/** Every name the engine barrel publishes (values and types alike). */
const ENGINE_VALUES = [
  'applyFetchedValues',
  'buildCopyValues',
  'buildCreateDefaults',
  'buildFetchMap',
  'buildFormTabs',
  'buildPermLevelMatrix',
  'canReadLevel',
  'canWriteLevel',
  'computeDirtyFields',
  'isEmptyValue',
  'isFetchLocked',
  'isPromptNamed',
  'isSameValue',
  'setCreatePrefill',
  'takeCreatePrefill',
  'useFormEngine',
] as const;

/** Types the engine barrel publishes alongside those values. */
const ENGINE_TYPES = [
  'BuildTabsOptions',
  'DocFieldMeta',
  'DocLinkMeta',
  'DocPermissionRule',
  'DoctypeMeta',
  'FetchMap',
  'FetchRule',
  'FormEngine',
  'FormTab',
  'LevelPerm',
  'PermLevelMatrix',
] as const;

describe('form-engine seam (MPO-15)', () => {
  it('hands every engine value out of ./formEngine', () => {
    for (const name of ENGINE_VALUES) {
      expect((formEngine as Record<string, unknown>)[name], `./formEngine must export "${name}"`).toBeTypeOf(
        'function',
      );
    }
  });

  it('re-exports the whole engine from the package barrel', () => {
    // Source-level, not a runtime import of ../index: pulling the full barrel
    // in here would drag FrappeTable -> the table/forms stacks into what is
    // otherwise a node-ish spec, for no extra signal (tests/exports.spec.ts
    // already exercises the barrel at runtime).
    const barrel = fs.readFileSync(path.resolve(srcDir, 'index.ts'), 'utf-8');
    const block = barrel.slice(barrel.indexOf('Desk Form Engine'));
    expect(block, 'the barrel must carry a form-engine block').toContain('from "./formEngine"');
    for (const name of [...ENGINE_VALUES, ...ENGINE_TYPES]) {
      expect(block, `the barrel must re-export "${name}"`).toContain(name);
    }
  });

  it('keeps formActions off both barrels (deep-import only, colliding names)', () => {
    // `addComment`, `addTag`, `getCount`, `sendEmail` and friends collide with
    // the list and shell surfaces; the dedicated "./formActions" subpath
    // export is how a consumer reaches them.
    for (const name of ['addComment', 'addTag', 'getCount', 'sendEmail', 'renameDoc']) {
      expect((formEngine as Record<string, unknown>)[name], name).toBeUndefined();
    }
    const pkg = JSON.parse(fs.readFileSync(path.resolve(srcDir, '../package.json'), 'utf-8')) as {
      exports: Record<string, { source?: string }>;
    };
    expect(pkg.exports['./formActions']?.source).toBe('./src/formEngine/formActions.ts');
  });

  it('never imports the package that sits above it', () => {
    for (const file of sourceFiles(srcDir)) {
      const source = fs.readFileSync(file, 'utf-8');
      expect(source, file).not.toMatch(/from ["']@multiplatform\.one\/backoffice/);
    }
  });

  it('keeps the engine off its own package barrel (no import cycle)', () => {
    for (const file of sourceFiles(engineDir)) {
      if (file.includes('.spec.')) {
        continue;
      }
      const source = fs.readFileSync(file, 'utf-8');
      expect(source, file).not.toMatch(/from ["']@multiplatform\.one\/frappe-ui/);
      expect(source, file).not.toMatch(/from ["']\.\.\/index["']/);
    }
  });

  it('takes the one meta model from @repo/frappe and declares none of its own', () => {
    expectTypeOf<DocFieldMeta>().toEqualTypeOf<DocTypeField>();
    expectTypeOf<DoctypeMeta>().toEqualTypeOf<DocTypeMeta>();
    expectTypeOf<DocPermissionRule>().toEqualTypeOf<DocTypePermission>();
    expectTypeOf<DocLinkMeta>().toEqualTypeOf<DocTypeLink>();
    expectTypeOf<DocFieldMeta['fieldtype']>().toEqualTypeOf<FrappeFieldType>();

    const meta = fs.readFileSync(path.resolve(engineDir, 'doctypeMeta.ts'), 'utf-8');
    expect(meta).toMatch(/from ["']@multiplatform\.one\/frappe["']/);
    for (const file of sourceFiles(srcDir)) {
      if (file.includes('.spec.') || file.includes('.stories.')) {
        continue;
      }
      const source = fs.readFileSync(file, 'utf-8');
      expect(source, file).not.toMatch(/export interface (DocFieldMeta|DoctypeMeta|DocTypeField|DocTypeMeta)\b/);
    }
    // The shapes reach the engine by relative import, never through the barrel.
    for (const file of ['formLayout.ts', 'fetchFrom.ts', 'fieldPermissions.ts', 'useFormEngine.ts']) {
      const source = fs.readFileSync(path.resolve(engineDir, file), 'utf-8');
      expect(source, file).not.toMatch(/shared\/useDoctypeMeta/);
    }
  });
});
