import { describe, it, expect } from 'vitest';

import {
  NATIVE_SUPPORTED_COMMANDS,
  TEXT_COLORS,
  TEXT_COLORS_DARK,
  HIGHLIGHT_COLORS,
  PALETTE_THEME_TOKENS,
} from './constants';
import { defaultEditorState } from './types';

describe('types and constants', () => {
  it('defaultEditorState has expected shape and default values', () => {
    expect(defaultEditorState.isBold).toBe(false);
    expect(defaultEditorState.isParagraph).toBe(true);
    expect(defaultEditorState.textAlign).toBe('left');
    expect(defaultEditorState.textColor).toBeNull();
    expect(defaultEditorState.highlightColor).toBeNull();
    expect(defaultEditorState.canUndo).toBe(false);
    expect(defaultEditorState.canRedo).toBe(false);
  });

  it('NATIVE_SUPPORTED_COMMANDS maps supported commands to true and unsupported to false', () => {
    expect(NATIVE_SUPPORTED_COMMANDS.bold).toBe(true);
    expect(NATIVE_SUPPORTED_COMMANDS.italic).toBe(true);
    expect(NATIVE_SUPPORTED_COMMANDS.textColor).toBe(true);
    expect(NATIVE_SUPPORTED_COMMANDS.highlight).toBe(true);
    expect(NATIVE_SUPPORTED_COMMANDS.taskList).toBe(true);
    expect(NATIVE_SUPPORTED_COMMANDS.image).toBe(true);

    expect(NATIVE_SUPPORTED_COMMANDS.subscript).toBe(false);
    expect(NATIVE_SUPPORTED_COMMANDS.superscript).toBe(false);
    expect(NATIVE_SUPPORTED_COMMANDS.alignLeft).toBe(false);
    expect(NATIVE_SUPPORTED_COMMANDS.codeBlock).toBe(false);
    expect(NATIVE_SUPPORTED_COMMANDS.horizontalRule).toBe(false);
    expect(NATIVE_SUPPORTED_COMMANDS.clearFormatting).toBe(false);
  });

  it('TEXT_COLORS and HIGHLIGHT_COLORS are non-empty with valid entries', () => {
    expect(TEXT_COLORS.length).toBeGreaterThan(0);
    expect(HIGHLIGHT_COLORS.length).toBeGreaterThan(0);

    for (const entry of TEXT_COLORS) {
      expect(entry).toHaveProperty('name');
      expect(entry).toHaveProperty('value');
      expect(entry.name).toBeTypeOf('string');
    }

    for (const entry of HIGHLIGHT_COLORS) {
      expect(entry).toHaveProperty('name');
      expect(entry).toHaveProperty('value');
      expect(entry.name).toBeTypeOf('string');
    }
  });

  it('TEXT_COLORS includes a default/null entry and HIGHLIGHT_COLORS includes a none/null entry', () => {
    const defaultEntry = TEXT_COLORS.find((c) => c.value === null);
    expect(defaultEntry).toBeDefined();
    expect(defaultEntry?.name).toBe('Default');

    const noneEntry = HIGHLIGHT_COLORS.find((c) => c.value === null);
    expect(noneEntry).toBeDefined();
    expect(noneEntry?.name).toBe('None');
  });

  it('palette values are theme custom properties, never raw hex (Axiom 5 / DG-COL-01)', () => {
    for (const entry of [...TEXT_COLORS, ...TEXT_COLORS_DARK, ...HIGHLIGHT_COLORS]) {
      if (entry.value === null) {
        continue;
      }
      expect(entry.value).toMatch(/^var\(--[a-zA-Z0-9]+\)$/);
    }
  });

  it('light and dark text palettes share tokens; only the neutral ink label flips', () => {
    expect(TEXT_COLORS_DARK.map((c) => c.value)).toEqual(TEXT_COLORS.map((c) => c.value));
    expect(TEXT_COLORS.find((c) => c.value === 'var(--color12)')?.name).toBe('Black');
    expect(TEXT_COLORS_DARK.find((c) => c.value === 'var(--color12)')?.name).toBe('White');
  });

  it('PALETTE_THEME_TOKENS covers every token referenced by the palettes', () => {
    expect(PALETTE_THEME_TOKENS.length).toBeGreaterThan(0);
    for (const entry of [...TEXT_COLORS, ...HIGHLIGHT_COLORS]) {
      if (entry.value === null) {
        continue;
      }
      const token = entry.value.replace(/^var\(--/, '').replace(/\)$/, '');
      expect(PALETTE_THEME_TOKENS).toContain(token);
    }
  });

  it('NativeCapability covers all EditorCommand values', () => {
    const commands: string[] = [
      'bold',
      'italic',
      'underline',
      'strike',
      'code',
      'subscript',
      'superscript',
      'heading1',
      'heading2',
      'heading3',
      'heading4',
      'heading5',
      'heading6',
      'paragraph',
      'bulletList',
      'orderedList',
      'taskList',
      'blockquote',
      'codeBlock',
      'link',
      'image',
      'undo',
      'redo',
      'alignLeft',
      'alignCenter',
      'alignRight',
      'alignJustify',
      'textColor',
      'highlight',
      'horizontalRule',
      'clearFormatting',
      'insertTable',
      'addColumnBefore',
      'addColumnAfter',
      'deleteColumn',
      'addRowBefore',
      'addRowAfter',
      'deleteRow',
      'deleteTable',
      'mergeCells',
      'splitCell',
      'toggleHeaderRow',
    ];

    for (const cmd of commands) {
      expect(NATIVE_SUPPORTED_COMMANDS[cmd as keyof typeof NATIVE_SUPPORTED_COMMANDS]).toBeTypeOf('boolean');
    }

    expect(Object.keys(NATIVE_SUPPORTED_COMMANDS)).toHaveLength(commands.length);
  });
});
