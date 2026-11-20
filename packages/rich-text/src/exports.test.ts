import type { ReactNode } from 'react';
import { describe, it, expect, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks -- must come before imports to prevent Tiptap module errors
// ---------------------------------------------------------------------------

vi.mock<object>(import('@repo/forms'), async (importOriginal) => ({
  ...(await importOriginal()),
  Field: () => null,
  FieldLayout: ({ children }: { children?: ReactNode }): ReactNode => children,
  Skeleton: () => null,
  getFieldError: () => {},
  useFormField: () => ({
    knobProps: {
      body: {},
      borderRadius: { borderRadius: '$3', borderWidth: 1 },
      sizeToken: '$4',
      outlined: false,
      inputBackground: '$color2',
      textAccentColor: '$color',
      heading: {},
      gap: { gap: '$2' },
    },
    id: 'test-id',
  }),
  useResolvedValidators: () => {},
  mergeFieldHandler: () => () => {},
  clampRadiusForLargeComponent: () => '$3',
  Button: () => null,
}));

vi.mock<object>(import('@repo/ui'), () => ({
  Tooltip: ({ children }: { children?: ReactNode }): ReactNode => children,
}));

vi.mock<object>(import('@repo/theme'), async (importOriginal) => ({
  ...(await importOriginal()),
  useResolvedKnobs: () => ({
    knobProps: {
      body: {},
      borderRadius: { borderRadius: '$3', borderWidth: 1 },
      sizeToken: '$4',
      outlined: false,
      inputBackground: '$color2',
      textAccentColor: '$color',
      heading: {},
      gap: { gap: '$2' },
    },
    control: {},
  }),
}));

vi.mock<object>(import('@tiptap/react/menus'), () => ({
  BubbleMenu: () => null,
}));

vi.mock<object>(import('@tiptap/react'), () => ({
  useEditor: vi.fn<() => null>().mockReturnValue(null),
  EditorContent: () => null,
}));

vi.mock<object>(import('@tiptap/starter-kit'), () => ({
  default: { configure: vi.fn<() => object>().mockReturnValue({}) },
}));
vi.mock<object>(import('@tiptap/extension-underline'), () => ({ default: {} }));
vi.mock<object>(import('@tiptap/extension-link'), () => ({
  default: { configure: vi.fn<() => object>().mockReturnValue({}) },
}));
vi.mock<object>(import('@tiptap/extension-placeholder'), () => ({
  default: { configure: vi.fn<() => object>().mockReturnValue({}) },
}));
vi.mock<object>(import('@tiptap/extension-text-align'), () => ({
  default: { configure: vi.fn<() => object>().mockReturnValue({}) },
}));
vi.mock<object>(import('@tiptap/extension-color'), () => ({ Color: {} }));
vi.mock<object>(import('@tiptap/extension-text-style'), () => ({ TextStyle: {} }));
vi.mock<object>(import('@tiptap/extension-highlight'), () => ({
  Highlight: { configure: vi.fn<() => object>().mockReturnValue({}) },
}));
vi.mock<object>(import('@tiptap/extension-subscript'), () => ({ Subscript: {} }));
vi.mock<object>(import('@tiptap/extension-superscript'), () => ({ Superscript: {} }));
vi.mock<object>(import('@tiptap/extension-task-list'), () => ({ default: {} }));
vi.mock<object>(import('@tiptap/extension-task-item'), () => ({
  default: { configure: vi.fn<() => object>().mockReturnValue({}) },
}));
vi.mock<object>(import('@tiptap/extension-image'), () => ({
  default: { configure: vi.fn<() => object>().mockReturnValue({}) },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

const exports = await import('./index');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('package exports', () => {
  it('exports RichEditor and RichTextEditor as named exports', () => {
    expect(exports.RichEditor).toBeDefined();
    expect(exports.RichEditor).not.toBeTypeOf('undefined');
    expect(exports.RichTextEditor).toBeDefined();
    expect(exports.RichTextEditor).toBeTypeOf('function');
  });

  it('exports expected type-compatible values (EditorState default, EditorCommand support)', () => {
    // Verify that types are usable through their runtime counterparts
    // RichEditorRef, RichEditorProps, EditorCommand, EditorState are types
    // but we can verify their related runtime exports work
    expect(exports.RichEditor).toBeDefined();
    expect(exports.RichTextEditor).toBeDefined();

    // Verify the compound component has expected static properties
    expect(exports.RichEditor.FixedToolbar).toBeDefined();
    expect(exports.RichEditor.BubbleToolbar).toBeDefined();
    expect(exports.RichEditor.Editor).toBeDefined();
  });

  it('does NOT export EditorToolbar or CodeTheme', () => {
    expect(exports).not.toHaveProperty('EditorToolbar');
    expect(exports).not.toHaveProperty('CodeTheme');
  });
});
