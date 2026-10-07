/**
 * Platform-aware keyboard shortcut labels for toolbar tooltips.
 *
 * Properties are getters so `t()` resolves at access (render) time -- a
 * locale catalog loaded after module import still applies.
 */

import { t } from '../shared/t';

const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform ?? '');

const MOD = isMac ? '⌘' : 'Ctrl+';
const SHIFT = isMac ? '⇧' : 'Shift+';
const ALT = isMac ? '⌥' : 'Alt+';

export function shortcut(label: string, keys?: string): string {
  if (!keys) {
    return label;
  }
  return `${label} (${keys})`;
}

export const SHORTCUTS = {
  get bold() {
    return shortcut(t('Bold'), `${MOD}B`);
  },
  get italic() {
    return shortcut(t('Italic'), `${MOD}I`);
  },
  get underline() {
    return shortcut(t('Underline'), `${MOD}U`);
  },
  get strike() {
    return shortcut(t('Strikethrough'), `${MOD}${SHIFT}X`);
  },
  get code() {
    return shortcut(t('Code'), `${MOD}E`);
  },
  get subscript() {
    return t('Subscript');
  },
  get superscript() {
    return t('Superscript');
  },
  get undo() {
    return shortcut(t('Undo'), `${MOD}Z`);
  },
  get redo() {
    return shortcut(t('Redo'), `${MOD}${SHIFT}Z`);
  },
  get alignLeft() {
    return shortcut(t('Align Left'), `${MOD}${SHIFT}L`);
  },
  get alignCenter() {
    return shortcut(t('Align Center'), `${MOD}${SHIFT}E`);
  },
  get alignRight() {
    return shortcut(t('Align Right'), `${MOD}${SHIFT}R`);
  },
  get alignJustify() {
    return shortcut(t('Justify'), `${MOD}${SHIFT}J`);
  },
  get blockquote() {
    return shortcut(t('Blockquote'), `${MOD}${SHIFT}B`);
  },
  get codeBlock() {
    return shortcut(t('Code Block'), `${MOD}${ALT}C`);
  },
  get bulletList() {
    return shortcut(t('Bullet List'), `${MOD}${SHIFT}8`);
  },
  get orderedList() {
    return shortcut(t('Ordered List'), `${MOD}${SHIFT}7`);
  },
  get taskList() {
    return shortcut(t('Task List'), `${MOD}${SHIFT}9`);
  },
  get link() {
    return shortcut(t('Link'), `${MOD}K`);
  },
  get horizontalRule() {
    return t('Horizontal Rule');
  },
  get image() {
    return t('Image');
  },
  get textColor() {
    return t('Text Color');
  },
  get highlight() {
    return t('Highlight');
  },
  get clearFormatting() {
    return t('Clear Formatting');
  },
} as const;
