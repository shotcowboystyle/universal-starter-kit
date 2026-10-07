/**
 * Media paste/drop upload behavior against a headless Tiptap editor.
 */

import { Editor } from '@tiptap/core';
import Image from '@tiptap/extension-image';
import StarterKit from '@tiptap/starter-kit';
import { describe, expect, it, vi } from 'vitest';

import { MediaUpload } from './media';

function createEditor() {
  return new Editor({
    element: document.createElement('div'),
    extensions: [StarterKit, Image.configure({ inline: true, allowBase64: true }), MediaUpload],
    content: '<p>start</p>',
  });
}

function firePaste(editor: Editor, files: File[]) {
  const event = {
    clipboardData: { files, types: ['Files'], getData: () => '' },
    preventDefault: vi.fn(),
  } as unknown as ClipboardEvent;
  // someProp mirrors ProseMirror dispatch: handlers run in order until one
  // claims the event by returning truthy
  const handled = !!editor.view.someProp('handlePaste', (fn) => fn(editor.view, event, [...editor.state.tr.doc]));
  return { handled, event };
}

async function waitFor(check: () => boolean, timeoutMs = 2000) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('waitFor timed out');
    }
    await new Promise((r) => setTimeout(r, 10));
  }
}

describe(MediaUpload, () => {
  it('inserts an uploaded image URL when onImageUpload is wired', async () => {
    const editor = createEditor();
    const onImageUpload = vi.fn(async () => 'https://cdn.example.com/pic.png');
    editor.storage.mediaUpload.handlers = { onImageUpload };

    const file = new File(['binary'], 'pic.png', { type: 'image/png' });
    const { handled, event } = firePaste(editor, [file]);

    expect(handled).toBe(true);
    expect(event.preventDefault).toHaveBeenCalledWith();
    await waitFor(() => editor.getHTML().includes('<img'));
    expect(onImageUpload).toHaveBeenCalledWith(file);
    expect(editor.getHTML()).toContain('src="https://cdn.example.com/pic.png"');
    expect(editor.getHTML()).toContain('alt="pic"');
    editor.destroy();
  });

  it('falls back to base64 data URI without an image handler', async () => {
    const editor = createEditor();
    const file = new File(['binary'], 'photo.jpg', { type: 'image/jpeg' });
    const { handled } = firePaste(editor, [file]);

    expect(handled).toBe(true);
    await waitFor(() => editor.getHTML().includes('<img'));
    expect(editor.getHTML()).toContain('src="data:');
    editor.destroy();
  });

  it('inserts an attachment chip link for non-image files via onFileUpload', async () => {
    const editor = createEditor();
    const onFileUpload = vi.fn(async () => ({
      url: 'https://cdn.example.com/report.pdf',
      name: 'report.pdf',
    }));
    editor.storage.mediaUpload.handlers = { onFileUpload };

    const file = new File(['%PDF'], 'report.pdf', { type: 'application/pdf' });
    const { handled } = firePaste(editor, [file]);

    expect(handled).toBe(true);
    await waitFor(() => editor.getHTML().includes('<a'));
    const html = editor.getHTML();
    expect(html).toContain('href="https://cdn.example.com/report.pdf"');
    expect(html).toContain('rt-attachment');
    expect(html).toContain('report.pdf');
    editor.destroy();
  });

  it('ignores non-image files without a file handler (honest no-op)', () => {
    const editor = createEditor();
    const file = new File(['%PDF'], 'report.pdf', { type: 'application/pdf' });
    const { handled } = firePaste(editor, [file]);
    expect(handled).toBe(false);
    expect(editor.getHTML()).not.toContain('<a');
    editor.destroy();
  });

  it('does not intercept text-only pastes', () => {
    const editor = createEditor();
    const { handled } = firePaste(editor, []);
    expect(handled).toBeFalsy();
    editor.destroy();
  });

  it('survives a failing upload without crashing', async () => {
    const editor = createEditor();
    const onImageUpload = vi.fn(async () => {
      throw new Error('upload broke');
    });
    editor.storage.mediaUpload.handlers = { onImageUpload };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const file = new File(['binary'], 'pic.png', { type: 'image/png' });
    const { handled } = firePaste(editor, [file]);
    expect(handled).toBe(true);
    await waitFor(() => warn.mock.calls.length > 0);
    expect(editor.getHTML()).not.toContain('<img');
    warn.mockRestore();
    editor.destroy();
  });
});
