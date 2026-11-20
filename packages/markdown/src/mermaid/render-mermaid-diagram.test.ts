import type { MermaidConfig, ParseResult, RenderResult } from 'mermaid';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderMermaidDiagram, resetMermaidForTesting } from './render-mermaid-diagram';

const { initialize, parse, render } = vi.hoisted(() => ({
  initialize: vi.fn<(config: MermaidConfig) => void>(),
  parse: vi.fn<(text: string) => Promise<ParseResult>>(),
  render: vi.fn<(id: string, text: string) => Promise<Pick<RenderResult, 'svg'>>>(),
}));

vi.mock<object>(import('mermaid'), () => ({
  default: { initialize, parse, render },
}));

// oxlint-disable-next-line vitest/require-top-level-describe -- shared mock reset for every describe block in this file
beforeEach(() => {
  resetMermaidForTesting();
  initialize.mockClear();
  parse.mockReset().mockResolvedValue({ diagramType: 'flowchart-v2', config: {} });
  render.mockReset().mockResolvedValue({ svg: '<svg><g>ok</g></svg>' });
});

describe(renderMermaidDiagram, () => {
  it('renders valid source to svg through the lazy engine', async () => {
    const result = await renderMermaidDiagram('graph TD\n A-->B');
    expect(result).toStrictEqual({ ok: true, svg: '<svg><g>ok</g></svg>' });
    expect(parse).toHaveBeenCalledWith('graph TD\n A-->B');
  });

  it('passes the dark scheme to mermaid theme config', async () => {
    await renderMermaidDiagram('graph TD\n A-->B', { scheme: 'dark' });
    expect(initialize).toHaveBeenCalledWith(
      expect.objectContaining({ theme: 'dark', securityLevel: 'strict', startOnLoad: false }),
    );
  });

  it('defaults to the light theme and re-initializes only on scheme change', async () => {
    await renderMermaidDiagram('a');
    await renderMermaidDiagram('b');
    expect(initialize).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ theme: 'default' }));
    await renderMermaidDiagram('c', { scheme: 'dark' });
    expect(initialize).toHaveBeenCalledTimes(2);
  });

  it('returns the parse error for invalid source (Axiom 6: never blank)', async () => {
    parse.mockRejectedValue(new Error('Parse error on line 2: unexpected token'));
    const result = await renderMermaidDiagram('graph TD\n A--');
    expect(result).toStrictEqual({
      ok: false,
      error: 'Parse error on line 2: unexpected token',
    });
    expect(render).not.toHaveBeenCalled();
  });

  it('returns render failures as errors too', async () => {
    render.mockRejectedValue(new Error('boom'));
    const result = await renderMermaidDiagram('graph TD\n A-->B');
    expect(result).toStrictEqual({ ok: false, error: 'boom' });
  });

  it('forwards fontFamily into the theme config and re-inits when it changes', async () => {
    await renderMermaidDiagram('a', { fontFamily: 'Courier New, monospace' });
    await renderMermaidDiagram('b', { fontFamily: 'Courier New, monospace' });
    expect(initialize).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ fontFamily: 'Courier New, monospace' }),
    );
    await renderMermaidDiagram('c', { fontFamily: 'Inter' });
    expect(initialize).toHaveBeenCalledTimes(2);
  });

  it('omits fontFamily entirely when none is given', async () => {
    await renderMermaidDiagram('a');
    expect(initialize.mock.calls[0][0]).not.toHaveProperty('fontFamily');
  });

  it('stringifies a non-Error rejection instead of dropping it', async () => {
    parse.mockRejectedValue('plain string failure');
    await expect(renderMermaidDiagram('graph TD\n A--')).resolves.toStrictEqual({
      ok: false,
      error: 'plain string failure',
    });
  });
});

// mountDiagramSvg has its own colocated spec (mount-diagram-svg.test.ts);
// its cases used to live here, one module behind another module's name.

// MPO-10: the native tier ships no mermaid import at all. It answers with
// the same "requires a DOM" result the web tier gives without a document,
// so callers need no platform branch.
describe('renderMermaidDiagram (native tier)', () => {
  it('refuses with the DOM error and never touches the engine', async () => {
    const native = await import('./render-mermaid-diagram.native');
    await expect(native.renderMermaidDiagram('graph TD\n A-->B')).resolves.toStrictEqual({
      ok: false,
      error: 'Mermaid diagrams require a DOM environment',
    });
    expect(parse).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();
  });

  it("keeps the web tier's export surface", async () => {
    const [web, native] = await Promise.all([
      import('./render-mermaid-diagram'),
      import('./render-mermaid-diagram.native'),
    ]);
    expect(Object.keys(native).toSorted()).toStrictEqual(Object.keys(web).toSorted());
  });
});
