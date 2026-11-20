/**
 * Types for the markdown renderer
 */
import type { AlignType, Heading as MdastHeading } from 'mdast';
import type { ReactNode } from 'react';

export type {
  Root,
  Heading,
  Paragraph,
  Text,
  Emphasis,
  Strong,
  Delete,
  InlineCode,
  Code,
  Link,
  Image,
  List,
  ListItem,
  Blockquote,
  ThematicBreak,
  Table,
  TableRow,
  TableCell,
  Html,
  Break,
} from 'mdast';

/**
 * Code theme for syntax highlighting. "auto" paints the house syntax theme,
 * whose inks are theme tokens that follow the scheme and tint; a named theme
 * is an eject to its literal palette.
 */
export type CodeTheme = 'auto' | 'github-dark' | 'github-light' | 'dracula' | 'nord' | 'one-dark-pro';

/**
 * Props for the main Markdown component
 */
export interface MarkdownProps {
  /** Markdown string to render */
  children: string;
  /** Custom components to override defaults */
  components?: Partial<MarkdownComponents>;
  /** Theme for code highlighting */
  codeTheme?: CodeTheme;
}

/**
 * Custom component overrides
 */
export interface MarkdownComponents {
  h1: React.ComponentType<HeadingProps>;
  h2: React.ComponentType<HeadingProps>;
  h3: React.ComponentType<HeadingProps>;
  h4: React.ComponentType<HeadingProps>;
  h5: React.ComponentType<HeadingProps>;
  h6: React.ComponentType<HeadingProps>;
  p: React.ComponentType<ParagraphProps>;
  strong: React.ComponentType<InlineProps>;
  em: React.ComponentType<InlineProps>;
  del: React.ComponentType<InlineProps>;
  code: React.ComponentType<CodeBlockProps>;
  inlineCode: React.ComponentType<InlineCodeProps>;
  a: React.ComponentType<LinkProps>;
  img: React.ComponentType<ImageProps>;
  ul: React.ComponentType<ListProps>;
  ol: React.ComponentType<ListProps>;
  li: React.ComponentType<ListItemProps>;
  blockquote: React.ComponentType<BlockquoteProps>;
  hr: React.ComponentType<HorizontalRuleProps>;
  table: React.ComponentType<TableProps>;
  tr: React.ComponentType<TableRowProps>;
  td: React.ComponentType<TableCellProps>;
  th: React.ComponentType<TableCellProps>;
  br: React.ComponentType<BreakProps>;
}

/**
 * Props for heading components
 */
export interface HeadingProps {
  level: MdastHeading['depth'];
  children: ReactNode;
}

/**
 * Props for paragraph components
 */
export interface ParagraphProps {
  children: ReactNode;
}

/**
 * Props for inline text styling (strong, em, del)
 */
export interface InlineProps {
  children: ReactNode;
}

/**
 * Props for code blocks
 */
export interface CodeBlockProps {
  children: string;
  lang?: string | null;
  meta?: string | null;
}

/**
 * Props for inline code
 */
export interface InlineCodeProps {
  children: string;
}

/**
 * Props for links
 */
export interface LinkProps {
  href: string;
  title?: string | null;
  children: ReactNode;
}

/**
 * Props for images
 */
export interface ImageProps {
  src: string;
  alt?: string | null;
  title?: string | null;
}

/**
 * Props for lists
 */
export interface ListProps {
  ordered: boolean;
  start?: number | null;
  children: ReactNode;
}

/**
 * Props for list items
 */
export interface ListItemProps {
  checked?: boolean | null;
  children: ReactNode;
}

/**
 * Props for blockquotes
 */
export interface BlockquoteProps {
  children: ReactNode;
}

/**
 * Props for horizontal rules
 */
export type HorizontalRuleProps = object;

/**
 * Props for tables
 */
export interface TableProps {
  children: ReactNode;
}

/**
 * Props for table rows
 */
export interface TableRowProps {
  children: ReactNode;
  isHeader?: boolean;
}

/**
 * Props for table cells
 */
export interface TableCellProps {
  children: ReactNode;
  isHeader?: boolean;
  align?: AlignType;
}

/**
 * Props for line breaks
 */
export type BreakProps = object;

/**
 * Render context passed to renderer
 */
export interface RenderContext {
  components: MarkdownComponents;
  codeTheme: string;
}
