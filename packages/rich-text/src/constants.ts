/**
 * Shared constants for the rich text editor
 */

import type { NativeCapability } from './types';

// ===========================================================================
// Color Palettes (Axiom 5 ONE SOURCE: theme ramp tokens, never fixed hexes)
// ===========================================================================

export interface ColorEntry {
  /** Display name for the color */
  name: string;
  /** CSS color value (theme custom property on web), or null for default/none */
  value: string | null;
}

/** A palette entry backed by a theme token instead of a literal color */
export interface ColorTokenEntry {
  /** Display name for the color */
  name: string;
  /** Theme token key (e.g. "red11"), or null for default/none */
  token: string | null;
}

/**
 * Hue swatches ride the radix step-11 text ramps: legible (>=4.5:1) on the
 * step-1/2 editor surface in BOTH schemes, so the same token list serves
 * light and dark. `color12` is the house strong ink (near-black in light,
 * near-white in dark).
 */
const TEXT_COLOR_HUES: ColorTokenEntry[] = [
  { name: 'Gray', token: 'gray11' },
  { name: 'Red', token: 'red11' },
  { name: 'Orange', token: 'orange11' },
  { name: 'Yellow', token: 'yellow11' },
  { name: 'Green', token: 'green11' },
  { name: 'Blue', token: 'blue11' },
  { name: 'Purple', token: 'purple11' },
  { name: 'Pink', token: 'pink11' },
];

export const TEXT_COLOR_TOKENS: ColorTokenEntry[] = [
  { name: 'Default', token: null },
  // color12 resolves near-black in light schemes; the label states what renders
  { name: 'Black', token: 'color12' },
  ...TEXT_COLOR_HUES,
];

/**
 * Dark-scheme display names for the same tokens: the values are identical
 * (theme vars re-resolve per scheme) — only the neutral ink's honest label
 * flips (color12 renders near-white in dark).
 */
export const TEXT_COLOR_TOKENS_DARK: ColorTokenEntry[] = [
  { name: 'Default', token: null },
  { name: 'White', token: 'color12' },
  ...TEXT_COLOR_HUES,
];

/**
 * Highlight washes ride the radix step-5 component backgrounds: pastel in
 * light, deep-dim in dark — the scheme's own ink (color12, inherited by the
 * mark) stays legible on them in both schemes.
 */
export const HIGHLIGHT_COLOR_TOKENS: ColorTokenEntry[] = [
  { name: 'None', token: null },
  { name: 'Yellow', token: 'yellow5' },
  { name: 'Green', token: 'green5' },
  { name: 'Blue', token: 'blue5' },
  { name: 'Pink', token: 'pink5' },
  { name: 'Purple', token: 'purple5' },
  { name: 'Orange', token: 'orange5' },
  { name: 'Red', token: 'red5' },
  { name: 'Cyan', token: 'cyan5' },
];

/**
 * Web palette values are CSS custom properties: applied color marks re-resolve
 * live from the ambient theme, so content authored in one scheme stays legible
 * when the scheme flips. Native pickers resolve the same tokens via useTheme()
 * (see ColorPicker.native), and TentapEditor injects the resolved vars into
 * the 10Tap webview so cross-authored content renders there too.
 */
const toCssVarEntry = ({ name, token }: ColorTokenEntry): ColorEntry => ({
  name,
  value: token ? `var(--${token})` : null,
});

export const TEXT_COLORS: ColorEntry[] = TEXT_COLOR_TOKENS.map(toCssVarEntry);
export const TEXT_COLORS_DARK: ColorEntry[] = TEXT_COLOR_TOKENS_DARK.map(toCssVarEntry);
export const HIGHLIGHT_COLORS: ColorEntry[] = HIGHLIGHT_COLOR_TOKENS.map(toCssVarEntry);

/**
 * Every theme token the palettes reference — the single list used to inject
 * resolved CSS custom properties into the native 10Tap webview.
 */
export const PALETTE_THEME_TOKENS: string[] = [
  ...new Set(
    [...TEXT_COLOR_TOKENS, ...HIGHLIGHT_COLOR_TOKENS]
      .map((entry) => entry.token)
      .filter((token): token is string => token !== null),
  ),
];

// ===========================================================================
// Native (10Tap) Supported Commands
// ===========================================================================

/**
 * Maps each EditorCommand to whether 10Tap supports it via bridge extensions.
 *
 * Supported commands use actual bridge methods (ColorBridge, HighlightBridge,
 * ImageBridge, TaskListBridge, etc.).
 *
 * Unsupported commands (subscript, superscript, textAlign, codeBlock,
 * horizontalRule, clearFormatting) have no 10Tap bridge equivalent.
 */
export const NATIVE_SUPPORTED_COMMANDS: NativeCapability = {
  bold: true,
  italic: true,
  underline: true,
  strike: true,
  code: true,
  subscript: false,
  superscript: false,
  heading1: true,
  heading2: true,
  heading3: true,
  heading4: true,
  heading5: true,
  heading6: true,
  paragraph: true,
  bulletList: true,
  orderedList: true,
  taskList: true,
  blockquote: true,
  codeBlock: false,
  link: true,
  image: true,
  undo: true,
  redo: true,
  alignLeft: false,
  alignCenter: false,
  alignRight: false,
  alignJustify: false,
  textColor: true,
  highlight: true,
  horizontalRule: false,
  clearFormatting: false,
  insertTable: false,
  addColumnBefore: false,
  addColumnAfter: false,
  deleteColumn: false,
  addRowBefore: false,
  addRowAfter: false,
  deleteRow: false,
  deleteTable: false,
  mergeCells: false,
  splitCell: false,
  toggleHeaderRow: false,
};
