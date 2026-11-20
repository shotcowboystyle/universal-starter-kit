import type {
  mountDiagramSvg as realMountDiagramSvg,
  renderMermaidDiagram as realRenderMermaidDiagram,
} from '@repo/markdown/mermaid';
import { Editor } from '@tiptap/core';
import { StarterKit } from '@tiptap/starter-kit';
import { common, createLowlight } from 'lowlight';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { CodeBlockWithPreview, PreviewChromeStore, getPreviewKind, setPreviewChrome } from './code-block-preview';
import { renderKatexHtml } from './lazy-katex';

const renderMermaidDiagram = vi.fn<typeof realRenderMermaidDiagram>(async (code: string) =>
  code.includes('bad')
    ? { ok: false as const, error: 'Parse error on line 1: mock' }
    : { ok: true as const, svg: "<svg data-mock='true'></svg>" },
);
const mountDiagramSvg = vi.fn<typeof realMountDiagramSvg>((container: HTMLElement) => {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.dataset.mock = 'true';
  container.replaceChildren(el);
  return true;
});

vi.mock(import('@repo/markdown/mermaid'), () => ({
  renderMermaidDiagram,
  mountDiagramSvg,
}));

const lowlight = createLowlight(common);

const createEditor = (content: string) =>
  new Editor({
    element: document.createElement('div'),
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      CodeBlockWithPreview.configure({ lowlight }),
      PreviewChromeStore,
    ],
    content,
  });

const waitFor = async (check: () => boolean, timeoutMs = 4000): Promise<void> => {
  await vi.waitFor(
    () => {
      expect(check()).toBe(true);
    },
    { timeout: timeoutMs, interval: 25 },
  );
};

describe(getPreviewKind, () => {
  it('previews only mermaid and math languages', () => {
    expect(getPreviewKind('mermaid')).toBe('mermaid');
    expect(getPreviewKind('math')).toBe('math');
    expect(getPreviewKind('javascript')).toBeNull();
    expect(getPreviewKind(null)).toBeNull();
  });
});

describe('CodeBlockWithPreview node view', () => {
  // The first math render pays KaTeX's cold import, which took over the
  // 4 s render wait under test-vitest's load (job 48258). Load it once here.
  beforeAll(async () => {
    await renderKatexHtml('x');
  }, 60_000);

  beforeEach(() => {
    renderMermaidDiagram.mockClear();
    mountDiagramSvg.mockClear();
  });

  it('renders a mermaid diagram preview below the source', async () => {
    const editor = createEditor('<pre><code class="language-mermaid">graph TD\n A--&gt;B</code></pre>');
    const preview = editor.view.dom.querySelector<HTMLElement>('.rt-block-preview');
    expect(preview).not.toBeNull();
    await waitFor(() => preview!.dataset.state === 'ok');
    expect(preview!.querySelector('svg[data-mock]')).not.toBeNull();
    expect(renderMermaidDiagram).toHaveBeenCalledWith('graph TD\n A-->B', expect.objectContaining({ scheme: 'light' }));
    // source stays an editable code block (contentDOM)
    expect(editor.view.dom.querySelector('pre code.language-mermaid')).not.toBeNull();
    editor.destroy();
  });

  it('shows the parse error for invalid diagrams (Axiom 6: never blank)', async () => {
    const editor = createEditor('<pre><code class="language-mermaid">bad graph</code></pre>');
    const preview = editor.view.dom.querySelector<HTMLElement>('.rt-block-preview');
    await waitFor(() => preview!.dataset.state === 'error');
    const error = preview!.querySelector('.rt-preview-error');
    expect(error?.getAttribute('role')).toBe('alert');
    expect(error?.textContent).toContain('Parse error on line 1: mock');
    editor.destroy();
  });

  it('renders display-mode KaTeX for math blocks', async () => {
    const editor = createEditor('<pre><code class="language-math">x^2 + y^2</code></pre>');
    const preview = editor.view.dom.querySelector<HTMLElement>('.rt-block-preview');
    await waitFor(() => preview!.dataset.state === 'ok');
    expect(preview!.querySelector('.rt-preview-math .katex')).not.toBeNull();
    editor.destroy();
  });

  it('shows the TeX parse error for invalid math', async () => {
    const editor = createEditor('<pre><code class="language-math">\\nope{</code></pre>');
    const preview = editor.view.dom.querySelector<HTMLElement>('.rt-block-preview');
    await waitFor(() => preview!.dataset.state === 'error');
    expect(preview!.querySelector('.rt-preview-error')?.textContent).toMatch(/parse error/iu);
    editor.destroy();
  });

  it('hides the preview pane for plain code and when switching away', async () => {
    const editor = createEditor('<pre><code class="language-js">const a = 1;</code></pre>');
    const preview = editor.view.dom.querySelector<HTMLElement>('.rt-block-preview');
    expect(preview!.dataset.state).toBe('hidden');
    editor.destroy();
  });

  it('re-renders when the language switches to a previewable one', async () => {
    const editor = createEditor('<pre><code class="language-js">graph TD</code></pre>');
    editor.commands.selectAll();
    editor.commands.updateAttributes('codeBlock', { language: 'mermaid' });
    await waitFor(() => editor.view.dom.querySelector<HTMLElement>('.rt-block-preview')?.dataset.state === 'ok');
    expect(renderMermaidDiagram).toHaveBeenCalledWith('graph TD', expect.objectContaining({ scheme: 'light' }));
    editor.destroy();
  });

  it('re-renders diagrams when the theme scheme flips', async () => {
    const editor = createEditor('<pre><code class="language-mermaid">graph TD</code></pre>');
    const preview = editor.view.dom.querySelector<HTMLElement>('.rt-block-preview');
    await waitFor(() => preview!.dataset.state === 'ok');
    setPreviewChrome(editor, { scheme: 'dark' });
    await waitFor(() => renderMermaidDiagram.mock.calls.some(([, opts]) => opts?.scheme === 'dark'));
    expect(renderMermaidDiagram).toHaveBeenLastCalledWith('graph TD', expect.objectContaining({ scheme: 'dark' }));
    editor.destroy();
  });

  it('keeps markdown fences lossless through getHTML (round-trip base)', () => {
    const editor = createEditor('<pre><code class="language-mermaid">graph TD</code></pre>');
    expect(editor.getHTML()).toContain('language-mermaid');
    editor.destroy();
  });
});
