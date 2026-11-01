// TextEditor initialization contract (forms contract / R-1 false dirty):
// mounting and applying external values must not emit change events. Tiptap
// normalizes wire HTML (plain text → <p>…</p>) and v3 defaults emitUpdate to
// true on setContent/setEditable — an unguarded editor echoed the normalized
// HTML through onChange during mount and falsely dirtied untouched docs.
import { renderWithProviders } from '@repo/test-utils';
import { cleanup, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TextEditor } from '.';

const renderEditor = async (value: string) => {
  const onChange = vi.fn<(value: string) => void>();
  const utils = renderWithProviders(
    <TextEditor
      label="Description"
      value={value}
      onChange={onChange}
    />,
  );
  // useEditor({ immediatelyRender: false }) creates the editor after mount —
  // wait until the ProseMirror content is live so "no emission" is not
  // vacuously true.
  await waitFor(() => {
    const pm = utils.container.querySelector('.ProseMirror');
    expect(pm).toBeTruthy();
  });
  return { onChange, ...utils };
};

describe('TextEditor initialization emissions', () => {
  afterEach(cleanup);

  it('does not emit onChange on mount even when tiptap normalizes the value', async () => {
    const { onChange, container } = await renderEditor('plain wire text');
    // Positive control: normalization really happened (plain text → <p>).
    // House TipTap writes `<p dir="auto" style="…">`, not a bare `<p>`.
    await waitFor(() => {
      const pm = container.querySelector('.ProseMirror');
      // oxlint-disable-next-line github/no-inner-html -- reads tiptap's rendered markup to assert the normalization happened
      expect(pm?.innerHTML).toMatch(/<p[\s>]/u);
      expect(pm?.textContent).toContain('plain wire text');
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not emit onChange on mount with HTML value', async () => {
    const { onChange } = await renderEditor('<p>already html</p>');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not echo an externally applied value back through onChange', async () => {
    const onChange = vi.fn<(value: string) => void>();
    const utils = renderWithProviders(
      <TextEditor
        label="Description"
        value="<p>first</p>"
        onChange={onChange}
      />,
    );
    await waitFor(() => {
      expect(utils.container.querySelector('.ProseMirror')).toBeTruthy();
    });
    // An external update changes the actual document without echoing an edit.
    utils.rerender(
      <TextEditor
        label="Description"
        value="<p>second</p>"
        onChange={onChange}
      />,
    );
    await waitFor(() => {
      expect(utils.container.querySelector('.ProseMirror')?.textContent).toBe('second');
    });
    expect(onChange).not.toHaveBeenCalled();
  });
});
