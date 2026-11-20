/**
 * Component consistency tests - 4 focused tests for Task Group 3.
 *
 * These tests verify that table sub-components use the correct shared
 * components from @repo/forms rather than raw Tamagui
 * primitives or native HTML elements.
 *
 * 1. ColumnHeaderFilter renders forms Select (not Tamagui Select)
 * 2. DataTableGrouping renders forms Select (not raw HTML <select>)
 * 3. DataTableToolbar search renders forms Input (not Tamagui Input)
 * 4. TableInput uses Phosphor icons (no @tamagui/lucide-icons imports)
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const SRC_DIR = path.resolve(import.meta.dirname);

const readSource = (relativePath: string): string => readFileSync(path.resolve(SRC_DIR, relativePath), 'utf-8');

describe('Component Consistency', () => {
  it('ColumnHeaderFilter uses forms Select via the shared editor, not Tamagui Select', () => {
    // The operator/value editor is shared between the column funnel and the
    // toolbar filter surface (LC-16) — the Select lives there now.
    const editorSource = readSource('FilterOperatorValueEditor/index.tsx');
    expect(editorSource).toMatch(/@multiplatform\.one\/forms/u);
    expect(editorSource).toMatch(/Select/u);

    // ColumnHeaderFilter consumes the shared editor rather than re-composing.
    const funnelSource = readSource('ColumnHeaderFilter/index.tsx');
    expect(funnelSource).toMatch(/FilterOperatorValueEditor/u);

    // Neither file imports Select from tamagui
    for (const source of [editorSource, funnelSource]) {
      const tamaguiImportLines = source.split('\n').filter((line) => line.includes('from') && line.includes('tamagui'));
      const tamaguiSelectImport = tamaguiImportLines.some(
        (line) => /\bSelect\b/u.test(line) && /from\s+["']tamagui["']/u.test(line),
      );
      expect(tamaguiSelectImport).toBe(false);
    }
  });

  it('DataTableGrouping uses forms Select, not raw HTML <select>', () => {
    const source = readSource('DataTableGrouping/index.tsx');

    // Should import Select from @repo/forms
    expect(source).toMatch(/@multiplatform\.one\/forms/u);

    // Should NOT contain raw HTML <select> elements
    expect(source).not.toMatch(/<select[\s>]/u);
    expect(source).not.toMatch(/<\/select>/u);
    expect(source).not.toMatch(/<option[\s>]/u);
    expect(source).not.toMatch(/<\/option>/u);
  });

  it('DataTableToolbar search uses forms Input, not raw Tamagui Input', () => {
    const source = readSource('DataTableToolbar/index.tsx');

    // Should import Input from @repo/forms
    expect(source).toMatch(/@multiplatform\.one\/forms/u);

    // Should NOT import Input from tamagui (styled wrapper around TInput is acceptable
    // only if TInput is NOT used as a standalone input component)
    const tamaguiImportLines = source
      .split('\n')
      .filter((line) => line.includes('from') && line.includes('tamagui') && !line.startsWith('//'));
    const tamaguiInputImport = tamaguiImportLines.some(
      (line) => /\bInput\b/u.test(line) && /from\s+["']tamagui["']/u.test(line),
    );
    expect(tamaguiInputImport).toBe(false);
  });

  it('TableInput uses Phosphor icons, not @tamagui/lucide-icons', () => {
    const source = readSource('TableInput/index.tsx');

    // Should NOT import from @tamagui/lucide-icons
    expect(source).not.toMatch(/@tamagui\/lucide-icons/u);

    // Should use @phosphor-icons/react for icons
    expect(source).toMatch(/@phosphor-icons\/react/u);
  });
});
