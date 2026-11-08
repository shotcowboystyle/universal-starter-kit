/**
 * Native fallback for mermaid blocks: the engine needs a DOM, so the
 * diagram source renders as a plain highlighted code block.
 */

import { CodeBlock } from '../components/CodeBlock';

export interface MermaidBlockProps {
  /** Mermaid diagram source */
  children: string;
}

export const MermaidBlock = ({ children }: MermaidBlockProps) => <CodeBlock lang="mermaid">{children}</CodeBlock>;
