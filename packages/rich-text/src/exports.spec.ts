import { describe, it, expect, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks -- must come before imports to prevent Tiptap module errors
// ---------------------------------------------------------------------------

vi.mock(import('@repo/forms'), async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  Field: () => null,
  FieldLayout: ({ children }: any) => children,
  Skeleton: () => null,
  getFieldError: () => {},
  useFormField: () => ({
    resolvedForm: undefined,
    knobProps: {
      body: {},
      borderRadius: { borderRadius: '$3', borderWidth: 1 },
      elevation: undefined,
      sizeToken: '$4',
      outlined: false,
      inputBackground: '$color2',
      textAccentColor: '$color',
      transition: undefined,
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

vi.mock(import('@repo/ui'), () => ({
  Tooltip: ({ children }: any) => children,
}));

vi.mock(import('@repo/theme'), async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useResolvedKnobs: () => ({
    knobProps: {
      body: {},
      borderRadius: { borderRadius: '$3', borderWidth: 1 },
      elevation: undefined,
      sizeToken: '$4',
      outlined: false,
      inputBackground: '$color2',
      textAccentColor: '$color',
      transition: undefined,
      heading: {},
      gap: { gap: '$2' },
    },
    control: {},
  }),
}));

vi.mock(import('@tiptap/react/menus'), () => ({
  BubbleMenu: () => null,
}));

vi.mock(import('@tiptap/react'), () => ({
  useEditor: vi.fn().mockReturnValue(null),
  EditorContent: () => null,
}));

vi.mock(import('@tiptap/starter-kit'), () => ({
  default: { configure: vi.fn().mockReturnValue({}) },
}));
vi.mock(import('@tiptap/extension-underline'), () => ({ default: {} }));
vi.mock(import('@tiptap/extension-link'), () => ({
  default: { configure: vi.fn().mockReturnValue({}) },
}));
vi.mock(import('@tiptap/extension-placeholder'), () => ({
  default: { configure: vi.fn().mockReturnValue({}) },
}));
vi.mock(import('@tiptap/extension-text-align'), () => ({
  default: { configure: vi.fn().mockReturnValue({}) },
}));
vi.mock(import('@tiptap/extension-color'), () => ({ Color: {} }));
vi.mock(import('@tiptap/extension-text-style'), () => ({ TextStyle: {} }));
vi.mock(import('@tiptap/extension-highlight'), () => ({
  Highlight: { configure: vi.fn().mockReturnValue({}) },
}));
vi.mock(import('@tiptap/extension-subscript'), () => ({ Subscript: {} }));
vi.mock(import('@tiptap/extension-superscript'), () => ({ Superscript: {} }));
vi.mock(import('@tiptap/extension-task-list'), () => ({ default: {} }));
vi.mock(import('@tiptap/extension-task-item'), () => ({
  default: { configure: vi.fn().mockReturnValue({}) },
}));
vi.mock(import('@tiptap/extension-image'), () => ({
  default: { configure: vi.fn().mockReturnValue({}) },
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
    expect((exports.RichEditor as any).FixedToolbar).toBeDefined();
    expect((exports.RichEditor as any).BubbleToolbar).toBeDefined();
    expect((exports.RichEditor as any).Editor).toBeDefined();
  });

  it('does NOT export EditorToolbar or CodeTheme', () => {
    expect((exports as any).EditorToolbar).toBeUndefined();
    expect((exports as any).CodeTheme).toBeUndefined();
  });
});
