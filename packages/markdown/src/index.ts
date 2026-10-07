/**
 * @repo/markdown
 *
 * Cross-platform markdown rendering with MDX support and syntax highlighting
 */

// Core markdown renderer
export { Markdown } from './Markdown';
export type { MarkdownProps, CodeTheme } from './types';

// Markdown parser and renderer
export { parseMarkdown } from './parser';
export { renderMarkdown } from './renderer';

// Mermaid diagrams — canonical lazy renderer (LC-16), shared with the
// rich-text editor's live code-block preview (which imports the
// dependency-free "./mermaid" subpath instead of this barrel)
export * from './mermaid';
export { MermaidBlock, type MermaidBlockProps } from './mermaid/MermaidBlock';

// Shiki syntax highlighting — canonical stack lives in
// @repo/ui (LC-16); re-exported for compatibility.
export { highlightCode, type HighlightLine, type HighlightToken } from '@repo/ui';
export type { BundledLanguage, BundledTheme } from 'shiki';

// MDX components
export * from './Aside';
export * from './ExternalIcon';
export * from './hooks';
export * from './Hr';
export * from './icons';
export * from './Li';
export * from './MarkdownSimpleTable';
export * from './Mdx';
export * from './MdxCodeBlock';
export * from './mdxComponents';
export * from './Notice';
export * from './Table';
export * from './Tabs';
export * from './Ul';
export * from './Video';
