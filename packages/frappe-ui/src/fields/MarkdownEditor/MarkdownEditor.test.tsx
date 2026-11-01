/**
 * MarkdownEditorField contract specs: rich editor in markdown capabilities
 * (LC-52 MARKDOWN-EXPRESSIBLE-EDITING — no highlight/underline/color
 * controls), canonical onChange emitting markdown (LC-14), readOnly/disabled
 * gating, table-cell chromeless branch, skeleton branch, and registry
 * resolution for the "Markdown Editor" fieldtype.
 */
import { TableCellContext } from '@repo/forms';
import { renderWithProviders } from '@repo/test-utils';
import { act, cleanup, fireEvent, waitFor } from '@testing-library/react';
import type React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getFieldComponent } from '../../field-registry';
import type { FieldRenderProps } from '../../field-registry';

import { MarkdownEditorField } from '.';

/** Registry entries are function components; calling one yields the adapter element. */
type RenderAdapter = (props: FieldRenderProps) => React.ReactElement<React.ComponentProps<typeof MarkdownEditorField>>;

const propsFor = (overrides: Partial<FieldRenderProps> = {}): FieldRenderProps => ({
  value: '',
  onChange: () => {},
  ...overrides,
});

/** A stable editable-cell context, as a table body provides it. */
const EDITABLE_CELL = { inTableCell: true, editable: true };

const getProseMirror = (container: HTMLElement) => container.querySelector<HTMLElement>('[contenteditable="true"]');

describe('MarkdownEditor field', () => {
  afterEach(cleanup);

  describe('MarkdownEditorField (standalone)', () => {
    it('renders the rich text editor (WYSIWYG), not a source textarea', async () => {
      const result = renderWithProviders(
        <MarkdownEditorField
          label="Notes"
          value="# Hello"
          onChange={() => {}}
        />,
      );
      await waitFor(() => {
        expect(getProseMirror(result.container)).toBeTruthy();
      });
      expect(result.getTextArea()).toBeNull();
      // markdown value parsed into rich nodes
      expect(result.container.querySelector('h1')?.textContent).toBe('Hello');
    });

    it('markdown capabilities: no underline/highlight/color toolbar controls (LC-52)', async () => {
      const result = renderWithProviders(
        <MarkdownEditorField
          label="Notes"
          value="hello"
          onChange={() => {}}
        />,
      );
      await waitFor(() => {
        expect(result.queryByLabelText('Bold')).toBeTruthy();
      });
      expect(result.queryByLabelText('Underline')).toBeNull();
      expect(result.queryByLabelText('Text Color')).toBeNull();
      expect(result.queryByLabelText('Highlight Color')).toBeNull();
      // markdown-expressible controls stay
      expect(result.queryByLabelText('Italic')).toBeTruthy();
      expect(result.queryByLabelText('Blockquote')).toBeTruthy();
    });

    it('emits markdown (not HTML) through canonical onChange', async () => {
      const onChange = vi.fn<(value: string) => void>();
      const result = renderWithProviders(
        <MarkdownEditorField
          label="Notes"
          value="hello"
          onChange={onChange}
        />,
      );
      await waitFor(() => {
        expect(result.queryByLabelText('Blockquote')).toBeTruthy();
      });
      await act(async () => {
        fireEvent.click(result.getByLabelText('Blockquote'));
      });
      await waitFor(() => {
        expect(onChange).toHaveBeenCalledWith(expect.any(String));
      });
      const emitted = onChange.mock.calls.at(-1)?.[0];
      expect(emitted).toContain('> hello');
      expect(emitted).not.toContain('<blockquote>');
    });

    it('readOnly renders a non-editable surface without emitting changes', async () => {
      const onChange = vi.fn<(value: string) => void>();
      const result = renderWithProviders(
        <MarkdownEditorField
          label="Notes"
          value="original"
          readOnly
          onChange={onChange}
        />,
      );
      await waitFor(() => {
        expect(result.container.querySelector('[contenteditable="false"]')).toBeTruthy();
      });
      expect(getProseMirror(result.container)).toBeNull();
      expect(onChange).not.toHaveBeenCalled();
    });

    it('disabled renders a non-editable surface', async () => {
      const result = renderWithProviders(
        <MarkdownEditorField
          label="Notes"
          value="original"
          disabled
          onChange={() => {}}
        />,
      );
      await waitFor(() => {
        expect(result.container.querySelector('[contenteditable="false"]')).toBeTruthy();
      });
      expect(getProseMirror(result.container)).toBeNull();
    });

    it('renders chromeless (no fixed formatting toolbar) in table cells', async () => {
      const result = renderWithProviders(
        <TableCellContext.Provider value={EDITABLE_CELL}>
          <MarkdownEditorField
            label="Notes"
            value="# cell"
            onChange={() => {}}
          />
        </TableCellContext.Provider>,
      );
      await waitFor(() => {
        expect(getProseMirror(result.container)).toBeTruthy();
      });
      expect(result.queryByLabelText('Formatting toolbar')).toBeNull();
    });

    it('skeleton branch renders no editable surface', () => {
      const result = renderWithProviders(
        <MarkdownEditorField
          label="Notes"
          skeleton
          value="# hidden"
          onChange={() => {}}
        />,
      );
      expect(getProseMirror(result.container)).toBeNull();
      expect(result.getTextArea()).toBeNull();
    });
  });

  describe('registry resolution (Markdown Editor fieldtype)', () => {
    it("resolves 'Markdown Editor' to MarkdownEditorField (not a generic fallback)", () => {
      const Component = getFieldComponent('Markdown Editor')!;
      expect(Component).toBeTruthy();
      expect(Component).not.toBe(getFieldComponent('Long Text'));
      const element = (Component as RenderAdapter)(propsFor({ value: '# doc', label: 'Body' }));
      expect(element.type).toBe(MarkdownEditorField);
      expect(element.props.value).toBe('# doc');
      expect(element.props.label).toBe('Body');
    });

    it('adapter passes helperText / readOnly / skeleton / compact through (passthrough parity)', () => {
      const Component = getFieldComponent('Markdown Editor')!;
      const element = (Component as RenderAdapter)(
        propsFor({
          helperText: 'GitHub-flavored markdown',
          readOnly: true,
          skeleton: true,
          compact: true,
        }),
      );
      expect(element.props.helperText).toBe('GitHub-flavored markdown');
      expect(element.props.readOnly).toBe(true);
      expect(element.props.skeleton).toBe(true);
      expect(element.props.compact).toBe(true);
    });
  });
});
