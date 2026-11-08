/**
 * Editor internal exports
 *
 * These are implementation details used by the compound component.
 * Public API is exported from src/index.ts.
 */
export { TiptapEditor } from './TiptapEditor';
export type { TiptapEditorProps } from './TiptapEditor';
export { getEditorCSS } from './editor-styles';
export { getEditorStateFromTiptap, getEditorStateFromBridge } from './use-editor-state';
