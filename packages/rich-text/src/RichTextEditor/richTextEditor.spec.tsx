import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

const editorSpies = vi.hoisted(() => ({
  setHTML: vi.fn(),
  setMarkdown: vi.fn(),
  focus: vi.fn(),
}));

vi.mock(import('@repo/forms'), async () => {
  const React = await import('react');
  return {
    Field: ({ children, defaultValue }: any) => {
      const [value, setValue] = React.useState(defaultValue ?? '');
      const field = {
        state: { value, meta: { errors: [] } },
        handleChange: vi.fn((next: string) => {
          setValue(next);
        }),
        handleBlur: vi.fn(),
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
    FieldLayout: ({ children, label, error, ...props }: any) => (
      <div
        data-testid="field-layout"
        data-label={label}
        data-error={error ?? undefined}
        data-id={props.id}
        data-gap={props.knobProps?.gap?.gap}
        data-disabled={props.disabled ? 'true' : undefined}
        data-purpose={props.purpose}
        data-placeholder={props.placeholder}>
        {children}
      </div>
    ),
    Skeleton: ({ variant, width, height, ..._props }: any) => (
      <div
        data-testid="skeleton"
        data-variant={variant}
        data-width={width}
        data-height={height}
      />
    ),
    getFieldError: (field: any, propError: any) => {
      const fieldError = field.state.meta.errors.length ? String(field.state.meta.errors[0]) : undefined;
      return propError ?? fieldError;
    },
    useFormField: ({ form, id, compact }: any) => ({
      resolvedForm: form ?? undefined,
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
        gap: { gap: compact ? '$1' : '$2' },
      },
      id: id ?? 'test-id',
    }),
    useResolvedValidators: (
      required: boolean | undefined,
      validators: any,
      label: any,
      name: any,
      isEmpty?: (v: unknown) => boolean,
    ) => {
      if (!required) {
        return validators;
      }
      const check = isEmpty ?? ((v: unknown) => v === null || v === undefined || v === '');
      const requiredValidator = ({ value }: { value: unknown }) =>
        check(value) ? `${typeof label === 'string' ? label : (name ?? 'Field')} is required` : undefined;
      if (!validators) {
        return { onSubmit: requiredValidator };
      }
      return { ...validators, onSubmit: requiredValidator };
    },
    mergeFieldHandler:
      (field: any, name: string, handler: any) =>
      (...args: any[]) => {
        (field[name] as Function)(...args);
        handler?.(...args);
      },
  };
});

vi.mock(import('../RichEditor'), () => ({
  RichEditor: forwardRef((props: any, ref) => {
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
      blur: vi.fn(),
      getHTML: () => content.current,
      getJSON: () => null,
      getMarkdown: () => content.current,
      getState: () => ({}),
      executeCommand: vi.fn(),
    }));
    return (
      <div
        data-testid="editor-content"
        data-compact={props.compact ? 'true' : 'false'}
        data-editable={String(props.editable !== false)}
        data-initial={props.initialContent}
        data-bubble={props.showBubbleToolbar ? 'true' : undefined}
        data-sections={props.sections ? JSON.stringify(props.sections) : undefined}>
        <button
          type="button"
          data-testid="simulate-edit"
          onClick={() => {
            content.current = props.capabilities === 'markdown' ? 'edited' : '<p>edited</p>';
            props.onChange(content.current);
          }}>
          edit
        </button>
      </div>
    );
  }),
}));

import { renderWithProviders } from '@repo/test-utils';
import { act } from '@testing-library/react';

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
    const handleChange = vi.fn();
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
    expect(richTextIsEmpty()).toBe(true);
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
      function Controlled() {
        const [value, setValue] = useState('');
        return (
          <RichTextEditor
            value={value}
            onChange={setValue}
            capabilities={capabilities}
          />
        );
      }
      const { getByTestId } = renderWithProviders(<Controlled />);
      await act(async () => getByTestId('simulate-edit').click());
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
    const target = container.querySelector('#notes') as HTMLTextAreaElement | null;
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
