/**
 * CSS styles for the ProseMirror editor content area.
 *
 * ProseMirror renders its own DOM outside Tamagui, so CSS injection via
 * a <style> tag is necessary. Colors use Tamagui CSS custom properties
 * for theme awareness.
 */

export interface EditorCSSOptions {
  /** Minimum height of the editor in pixels */
  minHeight?: number;
  /** Maximum height of the editor in pixels (enables scroll) */
  maxHeight?: number;
  /** CSS font-family string for body text */
  bodyFontFamily?: string;
  /** CSS font-family string for headings */
  headingFontFamily?: string;
  /** Fullscreen mode: fill the container instead of min/max pixel heights */
  fullscreen?: boolean;
  /** Bubble/popup fade duration in ms; 0 = animation none (motion silenced) */
  motionMs?: number;
  /** Per-instance scope class so bubble motion rules do not cross editors */
  scopeClass?: string;
}

export const getEditorCSS = (options: EditorCSSOptions = {}): string => {
  const {
    minHeight = 150,
    maxHeight,
    bodyFontFamily,
    headingFontFamily,
    fullscreen,
    motionMs = 120,
    scopeClass,
  } = options;
  const bodyFont = bodyFontFamily ?? 'inherit';
  const headingFont = headingFontFamily ?? bodyFont;
  const bubbleScope =
    scopeClass !== undefined && scopeClass !== '' ? `.${scopeClass} .rt-bubble-menu` : '.rt-bubble-menu';

  const maxHeightCSS =
    maxHeight !== undefined && maxHeight !== 0 ? `max-height: ${maxHeight}px; overflow-y: auto;` : '';
  const heightCSS = fullscreen
    ? 'min-height: 100%;'
    : `min-height: ${minHeight}px;
      ${maxHeightCSS}`;

  return `
    /*
      LC-24 A-ENTEREXIT: the bubble-menu plugin persists its element and
      flips inline visibility/opacity on show/hide. A transition on the same
      element pairs enter AND exit: the destination-state selector (inline
      style attribute) picks instant visibility on show and delayed
      visibility on hide so the exit fade stays visible. motionMs 0
      (animation none) silences both.
    */
    ${bubbleScope} {
      transition: opacity ${motionMs}ms ease, transform ${motionMs}ms ease,
        visibility 0s linear ${motionMs}ms;
    }
    ${bubbleScope}[style*="visibility: visible"] {
      transition: opacity ${motionMs}ms ease, transform ${motionMs}ms ease, visibility 0s;
    }

    .ProseMirror {
      padding: 12px 12px 12px 16px;
      ${heightCSS}
      outline: none;
      font-family: ${bodyFont};
      color: var(--color12);
    }
    .ProseMirror:focus {
      outline: none;
    }
    /* Axiom 12 LEGIBLE FLOOR: non-removable >=2px focus ring on the
       keyboard-focused editing surface */
    .ProseMirror:focus-visible {
      outline: 2px solid var(--color8);
      outline-offset: -2px;
    }
    /* Mention chips (@ mention nodes) */
    .ProseMirror .rt-mention {
      background-color: var(--color4);
      border-radius: 4px;
      padding: 0.1em 0.3em;
      color: var(--color12);
      font-weight: 500;
      white-space: nowrap;
    }
    /* Attachment chips (non-image file uploads) */
    .ProseMirror a.rt-attachment {
      display: inline-flex;
      align-items: center;
      background-color: var(--color3);
      border: 1px solid var(--color6);
      border-radius: 999px;
      padding: 0.05em 0.6em;
      text-decoration: none;
      color: var(--color12);
    }
    .ProseMirror p {
      /* @tamagui/core reset.css does p { all: unset } (display -> inline); restore block flow */
      display: block;
      margin: 0 0 0.5em 0;
    }
    .ProseMirror p:last-child {
      margin-bottom: 0;
    }
    .ProseMirror h1,
    .ProseMirror h2,
    .ProseMirror h3,
    .ProseMirror h4,
    .ProseMirror h5,
    .ProseMirror h6 {
      font-family: ${headingFont};
    }
    .ProseMirror h1 {
      font-size: 2em;
      font-weight: 700;
      margin: 0.5em 0;
    }
    .ProseMirror h2 {
      font-size: 1.5em;
      font-weight: 600;
      margin: 0.5em 0;
    }
    .ProseMirror h3 {
      font-size: 1.17em;
      font-weight: 600;
      margin: 0.5em 0;
    }
    .ProseMirror h4 {
      font-size: 1em;
      font-weight: 600;
      margin: 0.5em 0;
    }
    .ProseMirror h5 {
      font-size: 0.875em;
      font-weight: 600;
      margin: 0.5em 0;
    }
    .ProseMirror h6 {
      font-size: 0.75em;
      font-weight: 600;
      margin: 0.5em 0;
    }
    .ProseMirror ul,
    .ProseMirror ol {
      /* reset.css also unsets ul/ol display; restore block flow.
         Logical padding so list indent mirrors in RTL content. */
      display: block;
      padding-inline-start: 1em;
      margin: 0.5em 0;
    }
    .ProseMirror ul {
      list-style-type: disc;
    }
    .ProseMirror ol {
      list-style-type: decimal;
    }
    .ProseMirror li {
      display: list-item;
      line-height: 1.6;
    }
    .ProseMirror li p {
      margin: 0;
    }
    .ProseMirror ul ul {
      list-style-type: circle;
    }
    .ProseMirror ul ul ul {
      list-style-type: square;
    }
    .ProseMirror ul[data-type="taskList"] {
      list-style: none;
      padding-inline-start: 0;
      margin-inline-start: 0;
    }
    .ProseMirror ul[data-type="taskList"] li {
      display: flex;
      align-items: flex-start;
      gap: 0.5em;
    }
    .ProseMirror ul[data-type="taskList"] li > label {
      flex: 0 0 auto;
      margin-top: 0.2em;
    }
    .ProseMirror ul[data-type="taskList"] li > div {
      flex: 1 1 auto;
    }
    .ProseMirror ul[data-type="taskList"] input[type="checkbox"] {
      cursor: pointer;
      width: 1em;
      height: 1em;
    }
    .ProseMirror img {
      max-width: 100%;
      height: auto;
      border-radius: 4px;
    }
    .ProseMirror img.ProseMirror-selectednode {
      outline: 2px solid var(--blue10);
    }
    .ProseMirror blockquote {
      /* Logical start rail so the quote accent mirrors in RTL. */
      border-inline-start: 3px solid var(--color6);
      padding-inline-start: 1em;
      margin: 0.5em 0;
      color: var(--color11);
    }
    .ProseMirror code {
      background-color: var(--color4);
      padding: 0.15em 0.35em;
      border-radius: 4px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.875em;
      word-break: break-word;
    }
    .ProseMirror pre {
      background-color: var(--color3);
      border: 1px solid var(--color5);
      padding: 0.75em 1em;
      border-radius: 4px;
      overflow-x: auto;
      margin: 0.5em 0;
      display: block;
      width: 100%;
      box-sizing: border-box;
    }
    .ProseMirror pre code {
      background: none;
      border: none;
      padding: 0;
      border-radius: 0;
      font-size: 0.875em;
      color: inherit;
      word-break: normal;
      white-space: pre;
    }
    .ProseMirror a {
      color: var(--blue10);
      text-decoration: underline;
    }
    /* Highlight marks: the swatch palette rides scheme-aware theme ramps
       (radix step-5 washes — pastel in light, deep-dim in dark), so the
       inherited scheme ink stays legible on them; no forced ink needed. */
    .ProseMirror hr {
      border: none;
      border-top: 2px solid var(--color6);
      margin: 1em 0;
    }
    .ProseMirror p.is-editor-empty:first-child::before {
      content: attr(data-placeholder);
      /* Axiom 12: placeholder is an owned text role — color11 is the muted
         step that still clears 4.5:1 on the color2 editor surface in both
         schemes (color10 measured 3.76:1 light / 3.87:1 dark) */
      color: var(--color11);
      pointer-events: none;
      float: inline-start;
      height: 0;
    }

    /* Block drag handle (decorative fade stops at animation none) */
    .block-drag-handle {
      transition: opacity ${motionMs}ms ease;
    }
    .block-drag-handle:hover {
      background-color: var(--color4);
      opacity: 1 !important;
    }
    .block-drag-handle:active {
      cursor: grabbing;
    }

    /* Tables */
    .ProseMirror table {
      border-collapse: collapse;
      width: 100%;
      margin: 0.5em 0;
      overflow: hidden;
    }
    .ProseMirror td,
    .ProseMirror th {
      border: 1px solid var(--color6);
      padding: 0.4em 0.6em;
      vertical-align: top;
      position: relative;
      min-width: 80px;
    }
    .ProseMirror th {
      background-color: var(--color3);
      font-weight: 600;
    }
    .ProseMirror .selectedCell {
      background-color: var(--blue3);
    }
    .ProseMirror .column-resize-handle {
      position: absolute;
      right: -2px;
      top: 0;
      bottom: 0;
      width: 4px;
      background-color: var(--blue10);
      pointer-events: none;
    }
    .ProseMirror.resize-cursor {
      cursor: col-resize;
    }

    /* Inline math (KaTeX-rendered atom; raw TeX while loading) */
    .ProseMirror .rt-math-inline {
      display: inline-block;
      padding: 0 0.15em;
      border-radius: 4px;
      cursor: pointer;
      max-width: 100%;
    }
    .ProseMirror .rt-math-inline.ProseMirror-selectednode {
      outline: 2px solid var(--blue10);
    }
    .ProseMirror .rt-math-inline.rt-math-error {
      color: var(--red10);
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.875em;
      text-decoration: underline dashed var(--red10);
      text-underline-offset: 3px;
    }
    .ProseMirror .rt-math-inline.rt-math-empty {
      color: var(--color11);
      font-style: italic;
      border: 1px dashed var(--color8);
      padding: 0 0.4em;
    }
    .ProseMirror .katex { font-size: 1.06em; }

    /* Code block wrapper with live preview pane (mermaid / math) */
    .ProseMirror .rt-codeblock { margin: 0.5em 0; }
    .ProseMirror .rt-codeblock pre { margin: 0; }
    .ProseMirror .rt-block-preview[data-state="hidden"] { display: none; }
    .ProseMirror .rt-codeblock:has(.rt-block-preview:not([data-state="hidden"])) pre {
      border-bottom-left-radius: 0;
      border-bottom-right-radius: 0;
    }
    .ProseMirror .rt-block-preview {
      border: 1px solid var(--color5);
      border-top: 1px dashed var(--color6);
      border-radius: 0 0 4px 4px;
      padding: 0.75em 1em;
      background-color: var(--color2);
      overflow-x: auto;
    }
    .ProseMirror .rt-preview-diagram { display: flex; justify-content: center; }
    .ProseMirror .rt-preview-diagram svg { max-width: 100%; height: auto; }
    .ProseMirror .rt-preview-math .katex-display { margin: 0.25em 0; }
    .ProseMirror .rt-preview-error {
      color: var(--red10);
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.8125em;
      white-space: pre-wrap;
    }
    .ProseMirror .rt-preview-hint {
      color: var(--color10);
      font-size: 0.8125em;
      font-style: italic;
    }

    /* Collapsible details sections (GitLab <details> parity) */
    .ProseMirror [data-type="details"] {
      display: flex;
      gap: 0.4em;
      border: 1px solid var(--color5);
      border-radius: 4px;
      padding: 0.5em 0.75em;
      margin: 0.5em 0;
    }
    .ProseMirror [data-type="details"] > button {
      flex: 0 0 auto;
      width: 1.5em;
      height: 1.5em;
      margin-top: 0.1em;
      display: flex;
      align-items: center;
      justify-content: center;
      background: none;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      color: var(--color11);
      font-size: 1em;
      padding: 0;
    }
    .ProseMirror [data-type="details"] > button:hover {
      background-color: var(--color4);
    }
    .ProseMirror [data-type="details"] > button::before {
      content: "\\25B8";
      display: block;
      transition: transform ${motionMs}ms ease;
    }
    .ProseMirror [data-type="details"].is-open > button::before {
      transform: rotate(90deg);
    }
    .ProseMirror [data-type="details"] > div {
      flex: 1 1 auto;
      min-width: 0;
    }
    .ProseMirror [data-type="details"] summary {
      display: block;
      font-weight: 600;
      list-style: none;
    }
    .ProseMirror [data-type="details"] summary::-webkit-details-marker { display: none; }
    .ProseMirror [data-type="detailsContent"] { margin-top: 0.25em; }
    /* The tamagui reset defeats the UA's [hidden] display:none — restore
       it so the details toggle actually collapses the content */
    .ProseMirror [data-type="detailsContent"][hidden] { display: none; }

    /* Syntax highlighting (lowlight / highlight.js compatible). Hue ink takes
       the build's syntax tokens: bare green, blue and orange steps miss 4.5:1
       on the $color3 code surface in light (MPO-468). */
    .ProseMirror pre .hljs-comment,
    .ProseMirror pre .hljs-quote { color: var(--color11); font-style: italic; }
    .ProseMirror pre .hljs-keyword,
    .ProseMirror pre .hljs-selector-tag,
    .ProseMirror pre .hljs-meta { color: var(--syntaxPurple, var(--purple11)); }
    .ProseMirror pre .hljs-string,
    .ProseMirror pre .hljs-attr,
    .ProseMirror pre .hljs-template-tag,
    .ProseMirror pre .hljs-template-variable { color: var(--syntaxGreen, var(--green11)); }
    .ProseMirror pre .hljs-number,
    .ProseMirror pre .hljs-literal,
    .ProseMirror pre .hljs-type,
    .ProseMirror pre .hljs-params { color: var(--syntaxBlue, var(--blue11)); }
    .ProseMirror pre .hljs-built_in,
    .ProseMirror pre .hljs-builtin-name { color: var(--syntaxOrange, var(--orange11)); }
    .ProseMirror pre .hljs-title,
    .ProseMirror pre .hljs-section { color: var(--syntaxBlue, var(--blue11)); font-weight: 600; }
    .ProseMirror pre .hljs-name,
    .ProseMirror pre .hljs-tag { color: var(--syntaxGreen, var(--green11)); }
    .ProseMirror pre .hljs-attribute { color: var(--syntaxPurple, var(--purple11)); }
    .ProseMirror pre .hljs-variable,
    .ProseMirror pre .hljs-symbol,
    .ProseMirror pre .hljs-bullet { color: var(--syntaxOrange, var(--orange11)); }
    .ProseMirror pre .hljs-addition { color: var(--syntaxGreen, var(--green11)); background-color: var(--green3); }
    .ProseMirror pre .hljs-deletion { color: var(--syntaxRed, var(--red11)); background-color: var(--red3); }
    .ProseMirror pre .hljs-emphasis { font-style: italic; }
    .ProseMirror pre .hljs-strong { font-weight: bold; }
  `;
};
