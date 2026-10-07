import { renderWithProviders } from '@repo/test-utils';
import { act, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { RichEditorContext } from '../context';

const bubble = vi.hoisted(() => ({ props: null as Record<string, any> | null }));

vi.mock(import('@tiptap/react/menus'), () => ({
  BubbleMenu: (props: any) => {
    bubble.props = props;
    return <div data-testid="bubble-menu">{props.children}</div>;
  },
}));

// The language list lives inside a Popover, which never mounts its content in
// a headless DOM. Flatten the popover so the list is inspectable.
vi.mock(import('tamagui'), async (importOriginal) => {
  const actual = await importOriginal<Record<string, any>>();
  const Popover: any = ({ children }: any) => <>{children}</>;
  Popover.Trigger = ({ children }: any) => <>{children}</>;
  return { ...actual, Popover };
});

vi.mock(import('@repo/ui'), async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  Tooltip: ({ children }: any) => children,
  PopoverContent: ({ children }: any) => <div data-testid="language-menu">{children}</div>,
}));

vi.mock(import('@repo/forms'), async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  Button: (props: any) => (
    <button
      aria-label={props['aria-label']}
      onClick={props.onPress}>
      {props.children}
    </button>
  ),
}));

const { CodeBlockBubble } = await import('./CodeBlockBubble');

function makeEditor(opts: { language?: string | null; code?: string; active?: boolean; attrs?: unknown } = {}) {
  const { language = null, code = 'const a = 1;', active = true } = opts;
  const calls: [string, ...unknown[]][] = [];
  const chain: any = new Proxy(
    {},
    {
      get:
        (_target, prop: string) =>
        (...args: unknown[]) => {
          calls.push([prop, ...args]);
          return chain;
        },
    },
  );
  const codeBlockNode = { type: { name: 'codeBlock' }, textContent: code };
  const docNode = { type: { name: 'doc' }, textContent: 'outer' };
  const editor = {
    chain: () => chain,
    getAttributes: (name: string) => ('attrs' in opts ? (opts.attrs as any) : name === 'codeBlock' ? { language } : {}),
    isActive: (name: string) => name === 'codeBlock' && active,
    state: {
      selection: { $from: { depth: 1, node: (d: number) => (d === 1 ? codeBlockNode : docNode) } },
    },
  } as any;
  return { editor, calls, names: () => calls.map((c) => c[0]) };
}

function render(editor: any) {
  return renderWithProviders(
    <RichEditorContext.Provider
      size="$true"
      compact={false}
      disabled={false}>
      <CodeBlockBubble editor={editor} />
    </RichEditorContext.Provider>,
  );
}

function labelOf(container: HTMLElement, selector: string) {
  return container.querySelector(selector)?.getAttribute('aria-label');
}

function menuLabels(container: HTMLElement) {
  const menu = container.querySelector('[data-testid="language-menu"]');
  if (!menu) {
    throw new Error('language menu did not render');
  }
  return [...menu.querySelectorAll('[aria-label]')].map((el) => el.getAttribute('aria-label'));
}

describe('CodeBlockBubble', () => {
  let writeText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    writeText = vi.fn(async () => {});
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing at all without an editor', () => {
    const { container } = render(null);
    expect(container.textContent).toBe('');
  });

  it('shows itself only while the caret is inside a code block', () => {
    const inside = makeEditor({ active: true });
    render(inside.editor);
    expect(bubble.props?.shouldShow({ editor: inside.editor })).toBe(true);

    const outside = makeEditor({ active: false });
    render(outside.editor);
    expect(bubble.props?.shouldShow({ editor: outside.editor })).toBe(false);
  });

  it('anchors to the block rect, not the caret, so it does not chase typing', () => {
    render(makeEditor().editor);
    expect(bubble.props?.getReferencedVirtualElement).toBeTypeOf('function');
    expect(bubble.props?.options).toMatchObject({ placement: 'top-start' });
  });

  it('labels a null language as Plain text', () => {
    const { container } = render(makeEditor({ language: null }).editor);
    expect(container.querySelector('[aria-label="Select language"]')?.textContent).toBe('Plain text');
  });

  it('labels a known language with its catalog label, not its attribute value', () => {
    const { container } = render(makeEditor({ language: 'typescript' }).editor);
    const trigger = container.querySelector('[aria-label="Select language"]');
    expect(trigger?.textContent).toBe('TypeScript');
    expect(trigger?.textContent).not.toBe('typescript');
  });

  it('falls back to the raw attribute for a language the catalog does not know', () => {
    const { container } = render(makeEditor({ language: 'brainfuck' }).editor);
    const trigger = container.querySelector('[aria-label="Select language"]');
    expect(trigger?.textContent).toBe('brainfuck');
  });

  it('falls back to Plain text when the node carries no language attribute at all', () => {
    const { container } = render(makeEditor({ attrs: undefined }).editor);
    const trigger = container.querySelector('[aria-label="Select language"]');
    expect(trigger?.textContent).toBe('Plain text');
  });

  it('offers a language list headed by Plain text', () => {
    const { container } = render(makeEditor().editor);
    const labels = menuLabels(container);
    expect(labels[0]).toBe('Plain text');
    for (const label of ['TypeScript', 'Python', 'SQL', 'Mermaid', 'Math (TeX)']) {
      expect(labels).toContain(label);
    }
  });

  it('picking a language writes it onto the node; picking Plain text clears it to null', () => {
    const picked = makeEditor({ language: null });
    const { container } = render(picked.editor);
    const menu = container.querySelector('[data-testid="language-menu"]') as HTMLElement;

    fireEvent.click(menu.querySelector('[aria-label="Python"]')!);
    expect(picked.names()).toEqual(['focus', 'updateAttributes', 'run']);
    expect(picked.calls[1]).toEqual(['updateAttributes', 'codeBlock', { language: 'python' }]);

    const cleared = makeEditor({ language: 'python' });
    const { container: c2 } = render(cleared.editor);
    const menu2 = c2.querySelector('[data-testid="language-menu"]') as HTMLElement;
    fireEvent.click(menu2.querySelector('[aria-label="Plain text"]')!);
    expect(cleared.calls[1]).toEqual(['updateAttributes', 'codeBlock', { language: null }]);
  });

  it('copies the text of the code block the caret is in, and says so for 1.5s', async () => {
    vi.useFakeTimers();
    const { container } = render(makeEditor({ code: "print('hi')" }).editor);

    await act(async () => {
      fireEvent.click(container.querySelector('[aria-label="Copy code"]'));
    });

    expect(writeText).toHaveBeenCalledWith("print('hi')");
    expect(labelOf(container, '[aria-label="Copied"]')).toBe('Copied');

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(container.querySelector('[aria-label="Copied"]')).toBeNull();
    expect(container.querySelector('[aria-label="Copy code"]')).toBeTruthy();
  });

  it('a rejected clipboard write warns and leaves the label alone', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    writeText.mockRejectedValueOnce(new Error('denied'));
    const { container } = render(makeEditor().editor);

    await act(async () => {
      fireEvent.click(container.querySelector('[aria-label="Copy code"]'));
    });

    expect(warn).toHaveBeenCalledWith();
    expect(container.querySelector('[aria-label="Copied"]')).toBeNull();
    warn.mockRestore();
  });

  it('remove toggles the code block off rather than deleting the selection', () => {
    const { editor, names, calls } = makeEditor();
    const { container } = render(editor);

    fireEvent.click(container.querySelector('[aria-label="Remove code block"]'));
    expect(names()).toEqual(['focus', 'toggleCodeBlock', 'run']);
    expect(calls.some(([n]) => n === 'deleteSelection')).toBe(false);
  });
});
