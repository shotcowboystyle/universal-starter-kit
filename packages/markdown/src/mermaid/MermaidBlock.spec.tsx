/**
 * MermaidBlock spec (MPO-120). The block owns three faces: loading (source
 * as a mermaid CodeBlock), ok (mounted SVG), error (parse message above the
 * source). Native is a CodeBlock of the source and never mounts a diagram.
 */

import { renderWithProviders } from '@repo/test-utils';
import { waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { renderMermaidDiagram, mountDiagramSvg } = vi.hoisted(() => ({
  renderMermaidDiagram: vi.fn(),
  mountDiagramSvg: vi.fn(() => true),
}));

vi.mock(import('./renderMermaidDiagram'), () => ({
  renderMermaidDiagram,
  resetMermaidForTesting: vi.fn(),
}));

vi.mock(import('./mountDiagramSvg'), () => ({
  mountDiagramSvg,
}));

import { MermaidBlock } from './MermaidBlock';
import { MermaidBlock as NativeMermaidBlock } from './MermaidBlock.native';

const FLOWCHART = 'graph TD\n A-->B';

describe(MermaidBlock, () => {
  it('mounts a diagram after the lazy render succeeds', async () => {
    renderMermaidDiagram.mockResolvedValue({ ok: true, svg: '<svg><g>ok</g></svg>' });
    const { container } = renderWithProviders(<MermaidBlock>{FLOWCHART}</MermaidBlock>);
    // The mount is a passive effect after the host's commit, so the wait
    // ends on the mount itself, not on the host appearing.
    await waitFor(() => {
      const host = container.querySelector('[data-mermaid-diagram="true"]');
      expect(host).toBeTruthy();
      expect(mountDiagramSvg).toHaveBeenCalledWith(host, '<svg><g>ok</g></svg>');
    });
    expect(renderMermaidDiagram).toHaveBeenCalledWith(FLOWCHART, expect.objectContaining({}));
    expect(container.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('Mermaid diagram');
  });

  it('shows the parse error above the source when the engine fails (Axiom 6)', async () => {
    renderMermaidDiagram.mockResolvedValue({ ok: false, error: 'Parse error on line 2' });
    const { container } = renderWithProviders(<MermaidBlock>{'graph TD\n A--'}</MermaidBlock>);
    await waitFor(() => {
      expect(container.querySelector('[role="alert"]')?.textContent).toContain('Parse error on line 2');
    });
    expect(container.querySelector('[data-mermaid-diagram="true"]')).toBeNull();
    expect(container.textContent).toContain('graph TD');
  });

  it('shows the mermaid CodeBlock while loading', () => {
    renderMermaidDiagram.mockReturnValue(new Promise(() => {}));
    const { container } = renderWithProviders(<MermaidBlock>{FLOWCHART}</MermaidBlock>);
    expect(container.querySelector('[data-mermaid-diagram="true"]')).toBeNull();
    expect(container.textContent).toContain('graph TD');
  });
});

/**
 * The native tier is its own module, not a branch of the web one (MPO-195).
 * It never touches the engine, so it has no loading state, no error state and
 * no diagram host — every input is source, shown as source.
 */
describe('MermaidBlock native fallback', () => {
  it('renders the source as a mermaid CodeBlock, never a diagram host', () => {
    const { container } = renderWithProviders(<NativeMermaidBlock>{FLOWCHART}</NativeMermaidBlock>);
    expect(container.querySelector('[data-mermaid-diagram="true"]')).toBeNull();
    expect(container.textContent).toContain('graph TD');
  });

  it('never calls the engine or the mount helper', () => {
    renderMermaidDiagram.mockClear();
    mountDiagramSvg.mockClear();
    renderWithProviders(<NativeMermaidBlock>{FLOWCHART}</NativeMermaidBlock>);
    expect(renderMermaidDiagram).not.toHaveBeenCalled();
    expect(mountDiagramSvg).not.toHaveBeenCalled();
  });

  it('shows invalid source verbatim with no error alert', () => {
    const { container } = renderWithProviders(<NativeMermaidBlock>{'graph TD\n A--'}</NativeMermaidBlock>);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.textContent).toContain('graph TD');
  });

  it('renders a code block for empty source instead of nothing', () => {
    const { container } = renderWithProviders(<NativeMermaidBlock />);
    expect(container.querySelector('[data-mermaid-diagram="true"]')).toBeNull();
    expect(container.firstElementChild).toBeTruthy();
  });

  it('is a different component from the web block', () => {
    expect(NativeMermaidBlock).not.toBe(MermaidBlock);
  });
});
