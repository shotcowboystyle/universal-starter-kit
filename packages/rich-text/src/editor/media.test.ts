/**
 * Media paste/drop upload behavior against a headless Tiptap editor.
 */

import { Editor } from '@tiptap/core';
import { Image } from '@tiptap/extension-image';
import { Slice } from '@tiptap/pm/model';
import { StarterKit } from '@tiptap/starter-kit';
import { describe, expect, it, vi } from 'vitest';

import { MediaUpload } from './media';

const createEditor = () =>
  new Editor({
    element: document.createElement('div'),
    extensions: [StarterKit, Image.configure({ inline: true, allowBase64: true }), MediaUpload],
    content: '<p>start</p>',
  });

const firePaste = (editor: Editor, files: File[]) => {
  const preventDefault = vi.fn<() => void>();
  // SAFETY: the media plugin reads only clipboardData.files and preventDefault
  const event = {
    clipboardData: { files, types: ['Files'], getData: () => '' },
    preventDefault,
  } as unknown as ClipboardEvent;
  // someProp mirrors ProseMirror dispatch: handlers run in order until one
  // claims the event by returning truthy
  const handled = !!editor.view.someProp('handlePaste', (fn) => fn(editor.view, event, Slice.empty));
  return { handled, preventDefault };
};

const waitFor = async (check: () => boolean, timeoutMs = 2000) => {
  await vi.waitFor(
    () => {
      expect(check()).toBe(true);
    },
    { timeout: timeoutMs, interval: 10 },
  );
};

describe('MediaUpload extension', () => {
  it('inserts an uploaded image URL when onImageUpload is wired', async () => {
    const editor = createEditor();
    const onImageUpload = vi.fn<(file: File) => Promise<string>>(async () => 'https://cdn.example.com/pic.png');
    editor.storage.mediaUpload.handlers = { onImageUpload };

    const file = new File(['binary'], 'pic.png', { type: 'image/png' });
    const { handled, preventDefault } = firePaste(editor, [file]);

    expect(handled).toBe(true);
    expect(preventDefault).toHaveBeenCalledWith();
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
    const onFileUpload = vi.fn<(file: File) => Promise<{ url: string; name?: string }>>(async () => ({
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
    const onImageUpload = vi.fn<(file: File) => Promise<string>>(async () => {
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
