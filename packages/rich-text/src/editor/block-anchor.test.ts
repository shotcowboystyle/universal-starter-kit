/**
 * Block-rect bubble anchoring against a headless Tiptap editor.
 */

import { Editor } from '@tiptap/core';
import { Table } from '@tiptap/extension-table';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableRow } from '@tiptap/extension-table-row';
import { TextSelection } from '@tiptap/pm/state';
import { StarterKit } from '@tiptap/starter-kit';
import { describe, expect, it } from 'vitest';

import { getBlockVirtualElement } from './block-anchor';

const createEditor = (content: string) =>
  new Editor({
    element: document.createElement('div'),
    extensions: [StarterKit, Table, TableRow, TableHeader, TableCell],
    content,
  });

/** Places the text cursor inside the first node of the given type */
const placeCursorIn = (editor: Editor, nodeTypeName: string) => {
  let target = -1;
  editor.state.doc.descendants((node, pos) => {
    if (target === -1 && node.type.name === nodeTypeName) {
      target = pos + 1;
    }
    return target === -1;
  });
  if (target === -1) {
    throw new Error(`no ${nodeTypeName} in doc`);
  }
  const selection = TextSelection.near(editor.state.doc.resolve(target + 1));
  editor.view.dispatch(editor.state.tr.setSelection(selection));
};

describe(getBlockVirtualElement, () => {
  it('returns the table DOM element when the cursor is inside a table', () => {
    const editor = createEditor('<p>before</p><table><tr><th>h</th></tr><tr><td>cell</td></tr></table>');
    placeCursorIn(editor, 'table');

    const ref = getBlockVirtualElement(editor, 'table');
    expect(ref).not.toBeNull();
    expect((ref!.contextElement as HTMLElement).tagName).toBe('TABLE');
    // The anchor rect delegates to the block's live rect
    expect(ref!.getBoundingClientRect().width).toBeTypeOf('number');
    editor.destroy();
  });

  it('returns the pre element when the cursor is inside a code block', () => {
    const editor = createEditor('<p>before</p><pre><code>const a = 1;</code></pre>');
    placeCursorIn(editor, 'codeBlock');

    const ref = getBlockVirtualElement(editor, 'codeBlock');
    expect(ref).not.toBeNull();
    expect((ref!.contextElement as HTMLElement).tagName).toBe('PRE');
    editor.destroy();
  });

  it('returns null when the selection is outside the block type', () => {
    const editor = createEditor('<p>plain paragraph</p><table><tr><td>cell</td></tr></table>');
    // Cursor starts in the first paragraph by default
    const selection = TextSelection.near(editor.state.doc.resolve(1));
    editor.view.dispatch(editor.state.tr.setSelection(selection));

    expect(getBlockVirtualElement(editor, 'table')).toBeNull();
    expect(getBlockVirtualElement(editor, 'codeBlock')).toBeNull();
    editor.destroy();
  });
});
