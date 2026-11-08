import { renderWithProviders } from '@repo/test-utils';
import { act } from '@testing-library/react';
import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import type { ReactNode, Ref } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { RichEditorCombinedProps } from '../RichEditor';
import { defaultEditorState } from '../types';
import type { RichEditorRef } from '../types';

const editorSpies = vi.hoisted(() => ({
  setHTML: vi.fn<(next: string) => void>(),
  setMarkdown: vi.fn<(next: string) => void>(),
  focus: vi.fn<() => void>(),
}));

interface MockFieldApi {
  state: { value: string; meta: { errors: unknown[] } };
  handleChange: (next: string) => void;
  handleBlur: () => void;
}

type MockValidators = Partial<
  Record<'onChange' | 'onBlur' | 'onSubmit', (arg: { value: unknown }) => string | undefined>
>;

interface MockFieldLayoutProps {
  children?: ReactNode;
  label?: string;
  error?: string;
  id?: string;
  knobProps?: { gap?: { gap?: string } };
  disabled?: boolean;
  purpose?: string;
  placeholder?: string;
}

vi.mock<object>(import('@repo/forms'), async () => {
  const React = await import('react');
  return {
    Field: ({ children, defaultValue }: { children: (field: MockFieldApi) => ReactNode; defaultValue?: string }) => {
      const [value, setValue] = React.useState(defaultValue ?? '');
      const field: MockFieldApi = {
        state: { value, meta: { errors: [] } },
        handleChange: vi.fn<(next: string) => void>((next) => {
          setValue(next);
        }),
        handleBlur: vi.fn<() => void>(),
      };
      return (
        <div data-testid="tanstack-field">
          <button
            type="button"
            data-testid="simulate-reset"
            onClick={() => {
              setValue('');
            }}>
            reset
          </button>
          {children(field)}
        </div>
      );
    },
    FieldLayout: ({ children, label, error, ...props }: MockFieldLayoutProps) => (
      <div
        data-testid="field-layout"
        data-label={label}
        data-error={error ?? undefined}
        data-id={props.id}
        data-gap={props.knobProps?.gap?.gap}
        data-disabled={props.disabled === true ? 'true' : undefined}
        data-purpose={props.purpose}
        data-placeholder={props.placeholder}>
        {children}
      </div>
    ),
    Skeleton: ({ variant, width, height }: { variant?: string; width?: string; height?: number }) => (
      <div
        data-testid="skeleton"
        data-variant={variant}
        data-width={width}
        data-height={height}
      />
    ),
    getFieldError: (field: MockFieldApi, propError: string | undefined) => {
      const fieldError = field.state.meta.errors.length > 0 ? String(field.state.meta.errors[0]) : undefined;
      return propError ?? fieldError;
    },
    useFormField: ({ form, id, compact }: { form?: object; id?: string; compact?: boolean }) => ({
      resolvedForm: form ?? undefined,
      knobProps: {
        body: {},
        borderRadius: { borderRadius: '$3', borderWidth: 1 },
        sizeToken: '$4',
        outlined: false,
        inputBackground: '$color2',
        textAccentColor: '$color',
        heading: {},
        gap: { gap: compact === true ? '$1' : '$2' },
      },
      id: id ?? 'test-id',
    }),
    useResolvedValidators: (
      // oxlint-disable-next-line sonarjs/bool-param-default -- mirrors the real useResolvedValidators signature
      required: boolean | undefined,
      validators: MockValidators | undefined,
      label: ReactNode,
      name: string | undefined,
      // oxlint-disable-next-line anti-slop/no-unknown-parameters -- mirrors the real isEmpty contract: a predicate over any field value
      isEmpty?: (v: unknown) => boolean,
    ) => {
      if (required !== true) {
        return validators;
      }
      // oxlint-disable-next-line anti-slop/no-unknown-parameters -- default predicate over any field value
      const check = isEmpty ?? ((v: unknown) => v === null || v === undefined || v === '');
      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- label is any ReactNode; only a string label names the message
      const fieldName = typeof label === 'string' ? label : (name ?? 'Field');
      const requiredValidator = ({ value }: { value: unknown }) =>
        check(value) ? `${fieldName} is required` : undefined;
      if (validators === undefined) {
        return { onSubmit: requiredValidator };
      }
      return { ...validators, onSubmit: requiredValidator };
    },
    mergeFieldHandler:
      (field: MockFieldApi, name: 'handleBlur' | 'handleChange', handler?: (...args: never[]) => void) =>
      (...args: never[]) => {
        (field[name] as (...a: never[]) => void)(...args);
        handler?.(...args);
      },
  };
});

const MockRichEditor = (props: Partial<RichEditorCombinedProps>, ref: Ref<RichEditorRef>) => {
  const content = useRef(props.initialContent ?? '');
  useImperativeHandle(ref, () => ({
    setHTML: (next: string) => {
      content.current = next;
      editorSpies.setHTML(next);
    },
    setMarkdown: (next: string) => {
      content.current = next;
      editorSpies.setMarkdown(next);
    },
    focus: editorSpies.focus,
    blur: vi.fn<RichEditorRef['blur']>(),
    getHTML: () => content.current,
    getJSON: () => null,
    getMarkdown: () => content.current,
    getState: () => defaultEditorState,
    setJSON: vi.fn<RichEditorRef['setJSON']>(),
    executeCommand: vi.fn<RichEditorRef['executeCommand']>(),
  }));
  return (
    <div
      data-testid="editor-content"
      data-compact={props.compact === true ? 'true' : 'false'}
      data-editable={String(props.editable !== false)}
      data-initial={props.initialContent}
      data-bubble={props.showBubbleToolbar === true ? 'true' : undefined}
      data-sections={props.sections ? JSON.stringify(props.sections) : undefined}>
      <button
        type="button"
        data-testid="simulate-edit"
        onClick={() => {
          content.current = props.capabilities === 'markdown' ? 'edited' : '<p>edited</p>';
          props.onChange?.(content.current, null);
        }}>
        edit
      </button>
    </div>
  );
};

vi.mock<object>(import('../RichEditor'), () => ({
  RichEditor: forwardRef(MockRichEditor),
}));

const { RichTextEditor, richTextIsEmpty } = await import('./index');

describe('RichTextEditor form-integrated field', () => {
  it('renders skeleton as FieldLayout + control chrome, never a 14px label bar', () => {
    const { getAllByTestId, getByTestId, queryByTestId } = renderWithProviders(
      <RichTextEditor
        skeleton
        label="Content"
        minHeight={180}
      />,
    );
    const skeletons = getAllByTestId('skeleton');
    expect(skeletons).toHaveLength(1);
    expect(skeletons[0]).toHaveAttribute('data-variant', 'rounded');
    expect(skeletons[0]).toHaveAttribute('data-height', '180');
    expect(getByTestId('field-layout')).toHaveAttribute('data-label', 'Content');
    expect(queryByTestId('editor-content')).toBeNull();
  });

  it('renders standalone (Branch 2) without form context and manages internal state', () => {
    const handleChange = vi.fn<(value: string) => void>();
    const { container } = renderWithProviders(
      <RichTextEditor
        label="Content"
        onChange={handleChange}
        placeholder="Write something..."
      />,
    );
    const fieldLayout = container.querySelector("[data-testid='field-layout']");
    expect(fieldLayout).toBeTruthy();
    const editorContent = container.querySelector("[data-testid='editor-content']");
    expect(editorContent).toBeTruthy();
  });

  it('renders form-integrated (Branch 3) when form and name are provided', () => {
    const mockForm = { store: {} } as any;
    const { getByTestId } = renderWithProviders(
      <RichTextEditor
        form={mockForm}
        name="content"
        label="Content"
        required
      />,
    );
    expect(getByTestId('tanstack-field')).toBeTruthy();
    expect(getByTestId('field-layout')).toBeTruthy();
  });

  it('treats Tiptap empty markup as empty for required validation', () => {
    expect(richTextIsEmpty('')).toBe(true);
    expect(richTextIsEmpty('<p></p>')).toBe(true);
    expect(richTextIsEmpty(null)).toBe(true);
    // oxlint-disable-next-line unicorn/no-useless-undefined -- richTextIsEmpty takes a required argument; this is the undefined-value case
    expect(richTextIsEmpty(undefined)).toBe(true);
    expect(richTextIsEmpty('<p>Hello</p>')).toBe(false);
    expect(richTextIsEmpty('<h1>Title</h1>')).toBe(false);
  });

  it('passes showBubbleToolbar and sections props through to RichEditor', () => {
    const { getByTestId } = renderWithProviders(
      <RichTextEditor
        label="Content"
        showBubbleToolbar
        sections={['formatting', 'list']}
      />,
    );
    const editor = getByTestId('editor-content');
    expect(editor).toHaveAttribute('data-bubble', 'true');
    expect(editor).toHaveAttribute('data-sections', JSON.stringify(['formatting', 'list']));
  });

  it('feeds compact into useFormField so layout gap and editor density both step down', () => {
    const { getByTestId, rerender } = renderWithProviders(<RichTextEditor label="Content" />);
    expect(getByTestId('field-layout')).toHaveAttribute('data-gap', '$2');
    expect(getByTestId('editor-content')).toHaveAttribute('data-compact', 'false');
    rerender(
      <RichTextEditor
        label="Content"
        compact
      />,
    );
    expect(getByTestId('field-layout')).toHaveAttribute('data-gap', '$1');
    expect(getByTestId('editor-content')).toHaveAttribute('data-compact', 'true');
  });

  it('pushes controlled value changes into the editor after mount', () => {
    editorSpies.setHTML.mockClear();
    const { rerender } = renderWithProviders(
      <RichTextEditor
        label="Content"
        value="<p>one</p>"
      />,
    );
    expect(editorSpies.setHTML).not.toHaveBeenCalled();
    rerender(
      <RichTextEditor
        label="Content"
        value="<p>two</p>"
      />,
    );
    expect(editorSpies.setHTML).toHaveBeenCalledWith('<p>two</p>');
  });

  it('pushes markdown capability values through setMarkdown', () => {
    editorSpies.setMarkdown.mockClear();
    const { rerender } = renderWithProviders(
      <RichTextEditor
        label="Content"
        capabilities="markdown"
        value="hello"
      />,
    );
    rerender(
      <RichTextEditor
        label="Content"
        capabilities="markdown"
        value="world"
      />,
    );
    expect(editorSpies.setMarkdown).toHaveBeenCalledWith('world');
  });

  it.each(['full', 'markdown'] as const)(
    'does not replace a %s document when its user edit is echoed',
    async (capabilities) => {
      editorSpies.setHTML.mockClear();
      editorSpies.setMarkdown.mockClear();
      const Controlled = () => {
        const [value, setValue] = useState('');
        return (
          <RichTextEditor
            value={value}
            onChange={setValue}
            capabilities={capabilities}
          />
        );
      };
      const { getByTestId } = renderWithProviders(<Controlled />);
      await act(async () => {
        getByTestId('simulate-edit').click();
      });
      expect(editorSpies.setHTML).not.toHaveBeenCalled();
      expect(editorSpies.setMarkdown).not.toHaveBeenCalled();
    },
  );

  it('clears the editor when the form field value is reset', async () => {
    editorSpies.setHTML.mockClear();
    const { getByTestId } = renderWithProviders(
      <RichTextEditor
        form={{ store: {} } as any}
        name="content"
        defaultValue="<p>hello</p>"
        label="Content"
      />,
    );
    expect(getByTestId('editor-content')).toHaveAttribute('data-initial', '<p>hello</p>');
    await act(async () => {
      getByTestId('simulate-reset').click();
    });
    expect(editorSpies.setHTML).toHaveBeenCalledWith('');
  });

  it('associates the field id with a labelable control that forwards focus', () => {
    editorSpies.focus.mockClear();
    const { container, getByTestId } = renderWithProviders(
      <RichTextEditor
        id="notes"
        label="Content"
      />,
    );
    expect(getByTestId('field-layout')).toHaveAttribute('data-id', 'notes');
    const target = container.querySelector<HTMLTextAreaElement>('#notes');
    expect(target).toBeTruthy();
    target?.focus();
    expect(editorSpies.focus).toHaveBeenCalledWith();
  });

  it('passes disabled to FieldLayout and makes the editor non-editable', () => {
    const { getByTestId } = renderWithProviders(
      <RichTextEditor
        label="Content"
        disabled
      />,
    );
    expect(getByTestId('field-layout')).toHaveAttribute('data-disabled', 'true');
    expect(getByTestId('editor-content')).toHaveAttribute('data-editable', 'false');
  });

  it('declares description purpose so the field stretches full width', () => {
    const { getByTestId } = renderWithProviders(<RichTextEditor label="Content" />);
    expect(getByTestId('field-layout')).toHaveAttribute('data-purpose', 'description');
  });
});
