/**
 * Native fallback for mermaid blocks: the engine needs a DOM, so the
 * diagram source renders as a plain highlighted code block.
 */

import { CodeBlock } from '../components';

export interface MermaidBlockProps {
  /** Mermaid diagram source */
  children: string;
}

export function MermaidBlock({ children }: MermaidBlockProps) {
  return <CodeBlock lang="mermaid">{children}</CodeBlock>;
}
