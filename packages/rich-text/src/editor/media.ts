/**
 * Image / attachment paste-and-drop handling (web).
 *
 * Files pasted or dropped into the editor route through prop-driven upload
 * hooks -- the package assumes no backend:
 * - Images: `onImageUpload(file) -> Promise<url>` inserts an image node at
 *   the paste/drop position. Without a hook, images fall back to an inline
 *   base64 data URI so the flow still works in demos and offline hosts.
 * - Other files: `onFileUpload(file) -> Promise<{ url, name? }>` inserts an
 *   attachment chip (a link with `data-attachment`). Without a hook there is
 *   no URL to link, so the file is ignored (honest no-op).
 */

import { Extension } from '@tiptap/core';
import type { Editor } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

export interface MediaUploadHandlers {
  /** Uploads a pasted/dropped image and resolves its URL */
  onImageUpload?: (file: File) => Promise<string>;
  /** Uploads a pasted/dropped non-image file and resolves its URL (+ display name) */
  onFileUpload?: (file: File) => Promise<{ url: string; name?: string }>;
}

export interface MediaUploadStorage {
  handlers: MediaUploadHandlers;
}

declare module '@tiptap/core' {
  interface Storage {
    mediaUpload: MediaUploadStorage;
  }
}

async function readFileAsDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(String(reader.result));
    };
    reader.onerror = () => {
      reject(reader.error);
    };
    reader.readAsDataURL(file);
  });
}

function insertImage(editor: Editor, src: string, alt: string, pos?: number) {
  const chain = editor.chain().focus();
  if (pos === undefined) {
    chain.setImage({ src, alt }).run();
  } else {
    chain.insertContentAt(pos, { type: 'image', attrs: { src, alt } }).run();
  }
}

function insertAttachment(editor: Editor, url: string, name: string, pos?: number) {
  const content = {
    type: 'text',
    text: name,
    marks: [
      {
        type: 'link',
        // the Link mark schema only allows href/target/rel/class -- the
        // chip presentation rides on the class
        attrs: { href: url, class: 'rt-attachment' },
      },
    ],
  };
  const chain = editor.chain().focus();
  if (pos === undefined) {
    chain.insertContent(content).run();
  } else {
    chain.insertContentAt(pos, content).run();
  }
}

async function handleFiles(editor: Editor, files: File[], pos?: number): Promise<void> {
  const { handlers } = editor.storage.mediaUpload;
  for (const file of files) {
    try {
      if (file.type.startsWith('image/')) {
        const src = handlers.onImageUpload ? await handlers.onImageUpload(file) : await readFileAsDataUrl(file);
        insertImage(editor, src, file.name.replace(/\.[a-z0-9]+$/i, ''), pos);
      } else if (handlers.onFileUpload) {
        const { url, name } = await handlers.onFileUpload(file);
        insertAttachment(editor, url, name ?? file.name, pos);
      }
    } catch (error) {
      console.warn('[rich-text] media upload failed:', error);
    }
  }
}

export const MediaUpload = Extension.create({
  name: 'mediaUpload',

  addStorage(): MediaUploadStorage {
    return { handlers: {} };
  },

  addProseMirrorPlugins() {
    const { editor } = this;

    return [
      new Plugin({
        key: new PluginKey('mediaUpload'),
        props: {
          handlePaste(_view, event) {
            const files = [...(event.clipboardData?.files ?? [])];
            if (files.length === 0) {
              return false;
            }
            const { handlers } = editor.storage.mediaUpload;
            const actionable = files.some((f) => f.type.startsWith('image/') || handlers.onFileUpload);
            if (!actionable) {
              return false;
            }
            event.preventDefault();
            void handleFiles(editor, files);
            return true;
          },
          handleDrop(view, event) {
            const files = [...(event.dataTransfer?.files ?? [])];
            if (files.length === 0) {
              return false;
            }
            const { handlers } = editor.storage.mediaUpload;
            const actionable = files.some((f) => f.type.startsWith('image/') || handlers.onFileUpload);
            if (!actionable) {
              return false;
            }
            event.preventDefault();
            const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
            void handleFiles(editor, files, coords?.pos);
            return true;
          },
        },
      }),
    ];
  },
});
