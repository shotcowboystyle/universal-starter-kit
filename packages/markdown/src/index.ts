/**
 * `@repo/markdown`
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
// dependency-free "./mermaid" subpath instead of this entry)
export {
  mountDiagramSvg,
  renderMermaidDiagram,
  resetMermaidForTesting,
  type MermaidRenderOptions,
  type MermaidRenderResult,
} from './mermaid';
export { MermaidBlock, type MermaidBlockProps } from './mermaid/MermaidBlock';

// Shiki syntax highlighting — canonical stack lives in
// @repo/ui (LC-16); re-exported for compatibility.
export { highlightCode, type HighlightLine, type HighlightToken } from '@repo/ui';
export type { BundledLanguage, BundledTheme } from 'shiki';

// MDX components
export { MDXAside, MDXNote, type MDXAsideProps, type MDXNoteProps } from './Aside';
export { ExternalIcon } from './ExternalIcon';
export { useCompileAndEvaluateMdx } from './hooks/use-compile-and-evaluate-mdx';
export { parseFrontmatter, useCompileMdx } from './hooks/use-compile-mdx';
export { useEvaluateMdx } from './hooks/use-evaluate-mdx';
export { HR } from './Hr';
export { ClipboardIcon, CheckIcon, CheckCircleIcon, LinkIcon } from './icons';
export { LI, type LIProps } from './Li';
export { MarkdownSimpleTable, type MarkdownSimpleTableProps } from './MarkdownSimpleTable';
export { MDX, type MDXProps } from './Mdx';
export { MDXCodeBlock, type MDXCodeBlockProps } from './MdxCodeBlock';
export { TableHighlight, type TableHighlightProps, mdxComponents } from './mdx-components';
export { Notice, type NoticeProps } from './Notice';
export { MDXTable, MDXTableHead, MDXTableBody, MDXTableRow, MDXTableHeaderCell, MDXTableCell } from './Table';
export { MDXTabs, MDXTab, type MDXTabsProps, type MDXTabProps } from './Tabs';
export { UL, type ULProps } from './Ul';
export { Video, type VideoProps } from './Video';
