/**
 * Markdown parser using unified/remark ecosystem
 * Parses markdown string to mdast (Markdown Abstract Syntax Tree)
 */
import type { Root } from 'mdast';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

export type { Root } from 'mdast';

// Create a reusable processor
const processor = unified().use(remarkParse).use(remarkGfm);

/**
 * Parse markdown string to AST
 */
export const parseMarkdown = (markdown: string): Root => processor.parse(markdown);

/**
 * Parse markdown string to AST (async version for consistency)
 */
export const parseMarkdownAsync = async (markdown: string): Promise<Root> => processor.parse(markdown);
