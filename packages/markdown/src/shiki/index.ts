/**
 * LC-16 ONE-IMPLEMENTATION: the shiki highlighter stack lives in
 * `@repo/ui` (`highlightCode` / `useShikiTokens` /
 * `HighlightedCode`) — one JS-regex-engine highlighter for the whole app.
 * This module only keeps the local shiki type path alive for the renderer.
 */
export type { BundledLanguage, BundledTheme } from 'shiki';
