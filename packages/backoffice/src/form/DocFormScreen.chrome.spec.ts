/**
 * MPO-15 AC2: DocFormScreen is page chrome over FrappeForm.
 *
 * The desk form page owns its toolbar, menu, dialogs, sidebar, timeline and
 * banners. Which fields render, which are required, read-only or hidden, and
 * how they lay out into tabs is FrappeForm's job, so the exported component
 * and the desk can never resolve the same doctype differently again. Any
 * DocField key name in the page, or an import of the layout engine, means the
 * page has started resolving fields of its own.
 */
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(path.resolve(__dirname, 'DocFormScreen.tsx'), 'utf-8');

const docFieldKeys = [
  'fieldname',
  'fieldtype',
  'permlevel',
  'depends_on',
  'mandatory_depends_on',
  'read_only_depends_on',
  'collapsible_depends_on',
  'set_only_once',
  'fetch_from',
  'required',
  'hidden',
  'read_only',
  'allow_on_submit',
  'in_list_view',
  'options',
];

const fieldResolution = [
  'buildFormTabs',
  'buildPermLevelMatrix',
  'buildCopyValues',
  'buildCreateDefaults',
  'isPromptNamed',
  'SchemaForm',
  'useFormEngine',
  'sessionDocRights',
];

function importedNames(from: string): string[] {
  const names: string[] = [];
  const pattern = /import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+"([^"]+)"/g;
  for (const match of source.matchAll(pattern)) {
    if (match[2] !== from) {
      continue;
    }
    for (const part of match[1].split(',')) {
      const name = part
        .trim()
        .replace(/^type\s+/, '')
        .split(/\s+as\s+/)[0];
      if (name) {
        names.push(name);
      }
    }
  }
  return names;
}

describe('DocFormScreen is chrome over FrappeForm (MPO-15 AC2)', () => {
  it.each(docFieldKeys)('names no DocField key: %s', (key) => {
    expect(source).not.toMatch(new RegExp(`\\b${key}\\b`));
  });

  it.each(fieldResolution)('does not resolve fields itself: %s', (name) => {
    expect(source).not.toMatch(new RegExp(`\\b${name}\\b`));
  });

  it('renders the field body through FrappeForm and its controller', () => {
    const frappeUi = importedNames('@repo/frappe-ui');
    expect(frappeUi).toContain('FrappeForm');
    expect(frappeUi).toContain('useFrappeForm');
    expect(source).toMatch(/<FrappeForm(?:<\w+>)?\s[^>]*\bform=\{form\}/s);
  });
});
