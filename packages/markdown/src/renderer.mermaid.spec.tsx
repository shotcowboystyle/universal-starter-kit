/**
 * Renderer mermaid-fence spec (MPO-195).
 *
 * renderer.spec.tsx covers the node types that map onto plain components and
 * deliberately runs unmocked. The `code` case has a second branch it does not
 * reach: a ```mermaid fence goes to MermaidBlock (GitLab parity), and a
 * custom `code` component still wins over that. Both need MermaidBlock
 * stubbed — the real one lazy-imports the mermaid engine — so they live in
 * their own file rather than putting a module mock over the whole contract
 * suite.
 */

import { renderWithProviders } from '@repo/test-utils';
import { describe, expect, it, vi } from 'vitest';

// The factory is hoisted above every import, so it closes over nothing but
// JSX — a tamagui element here would be read before its module initialises.
vi.mock(import('./mermaid/MermaidBlock'), () => ({
  MermaidBlock: ({ children }: { children: string }) => <span data-testid="mermaid-block">{children}</span>,
}));

import { parseMarkdown } from './parser';
import { renderMarkdown } from './renderer';
import type { MarkdownComponents } from './types';

const MERMAID_DOC = '```mermaid\ngraph TD\n  A-->B\n```';

function renderDoc(markdown: string, components?: Partial<MarkdownComponents>) {
  return renderWithProviders(<>{renderMarkdown(parseMarkdown(markdown), { components })}</>);
}

describe('renderMarkdown — mermaid fences', () => {
  it('routes a mermaid fence to MermaidBlock, not the code block', () => {
    const { getByTestId } = renderDoc(MERMAID_DOC);
    expect(getByTestId('mermaid-block').textContent).toContain('graph TD');
  });

  it('leaves every other language on the code block path', () => {
    const { queryByTestId, container } = renderDoc('```typescript\nconst a = 1;\n```');
    expect(queryByTestId('mermaid-block')).toBeNull();
    expect(container.textContent).toContain('const a = 1;');
  });

  it('treats an unlabelled fence as code, never as a diagram', () => {
    const { queryByTestId } = renderDoc('```\ngraph TD\n  A-->B\n```');
    expect(queryByTestId('mermaid-block')).toBeNull();
  });

  it('gives a custom code component precedence over the mermaid branch', () => {
    const seen: (string | null | undefined)[] = [];
    const components: Partial<MarkdownComponents> = {
      code: ({ children, lang }) => {
        seen.push(lang);
        return <span data-testid="custom-code">{children}</span>;
      },
    };
    const { getByTestId, queryByTestId } = renderDoc(MERMAID_DOC, components);
    expect(queryByTestId('mermaid-block')).toBeNull();
    expect(getByTestId('custom-code').textContent).toContain('graph TD');
    expect(seen).toEqual(['mermaid']);
  });

  it('renders an empty document as an empty frame rather than throwing', () => {
    const { container } = renderDoc('');
    expect(container.textContent).toBe('');
  });
});
