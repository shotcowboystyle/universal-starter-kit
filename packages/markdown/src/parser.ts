import type { Root } from 'mdast';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
/**
 * Markdown parser using unified/remark ecosystem
 * Parses markdown string to mdast (Markdown Abstract Syntax Tree)
 */
import { unified } from 'unified';

// Create a reusable processor
const processor = unified().use(remarkParse).use(remarkGfm);

/**
 * Parse markdown string to AST
 */
export function parseMarkdown(markdown: string): Root {
  return processor.parse(markdown);
}

/**
 * Parse markdown string to AST (async version for consistency)
 */
export async function parseMarkdownAsync(markdown: string): Promise<Root> {
  return processor.parse(markdown);
}

export type { Root };
