import { renderWithProviders } from '@repo/test-utils';
import { fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { RichEditorContext } from '../context';

const bubble = vi.hoisted(() => ({ props: null as Record<string, any> | null }));

vi.mock(import('@tiptap/react/menus'), () => ({
  BubbleMenu: (props: any) => {
    bubble.props = props;
    return <div data-testid="bubble-menu">{props.children}</div>;
  },
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

vi.mock(import('@repo/ui'), async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  Tooltip: ({ children }: any) => children,
}));

const { LinkBubble } = await import('./LinkBubble');

function makeEditor(attrs: Record<string, unknown> = {}, active = true) {
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
  const editor = {
    chain: () => chain,
    getAttributes: (name: string) => (name === 'link' ? attrs : {}),
    isActive: (name: string) => name === 'link' && active,
  } as any;
  return { editor, calls, names: () => calls.map((c) => c[0]) };
}

function render(editor: any) {
  return renderWithProviders(
    <RichEditorContext.Provider
      size="$true"
      compact={false}
      disabled={false}>
      <LinkBubble editor={editor} />
    </RichEditorContext.Provider>,
  );
}

function press(container: HTMLElement, label: string) {
  const el = container.querySelector(`[aria-label="${label}"]`);
  if (!el) {
    throw new Error(`no control labelled "${label}"`);
  }
  fireEvent.click(el);
  return el;
}

describe('LinkBubble', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing at all without an editor', () => {
    const { container } = render(null);
    expect(container.textContent).toBe('');
  });

  it('shows itself only while the caret is on a link', () => {
    const onLink = makeEditor({ href: 'https://example.com' }, true);
    render(onLink.editor);
    expect(bubble.props?.shouldShow({ editor: onLink.editor })).toBe(true);

    const offLink = makeEditor({}, false);
    render(offLink.editor);
    expect(bubble.props?.shouldShow({ editor: offLink.editor })).toBe(false);
  });

  it('shows the href, and says so plainly when the mark carries none', () => {
    const withHref = render(makeEditor({ href: 'https://example.com/a' }).editor);
    expect(withHref.getByText('https://example.com/a')).toBeTruthy();

    const withoutHref = render(makeEditor({}).editor);
    expect(withoutHref.getByText('No URL')).toBeTruthy();
  });

  it('opens the href in a new tab with noopener, from both the label and the button', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const { container, getByText } = render(makeEditor({ href: 'https://example.com' }).editor);

    fireEvent.click(getByText('https://example.com'));
    press(container, 'Open link');

    expect(open).toHaveBeenCalledTimes(2);
    expect(open).toHaveBeenCalledWith('https://example.com', '_blank', 'noopener,noreferrer');
  });

  it('does not open a window when there is no href to open', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const { container } = render(makeEditor({}).editor);

    press(container, 'Open link');
    expect(open).not.toHaveBeenCalled();
  });

  it('prefills the edit field with the current href', () => {
    const { container } = render(makeEditor({ href: 'https://example.com' }).editor);
    press(container, 'Edit link');
    expect((container.querySelector('input') as HTMLInputElement).value).toBe('https://example.com');
  });

  it('saves over the whole mark range, with the value trimmed', () => {
    const { editor, calls, names } = makeEditor({ href: 'https://old.example' });
    const { container } = render(editor);

    press(container, 'Edit link');
    fireEvent.change(container.querySelector('input') as HTMLInputElement, {
      target: { value: '  https://new.example  ' },
    });
    press(container, 'Save link');

    expect(names()).toEqual(['focus', 'extendMarkRange', 'setLink', 'run']);
    expect(calls[1]).toEqual(['extendMarkRange', 'link']);
    expect(calls[2]).toEqual(['setLink', { href: 'https://new.example' }]);
  });

  it('refuses to save a blank href, and still closes the editor', () => {
    const { editor, calls } = makeEditor({ href: 'https://old.example' });
    const { container, getByText } = render(editor);

    press(container, 'Edit link');
    fireEvent.change(container.querySelector('input') as HTMLInputElement, {
      target: { value: '   ' },
    });
    press(container, 'Save link');

    expect(calls).toEqual([]);
    expect(getByText('https://old.example')).toBeTruthy();
  });

  it('unlinks over the whole mark range rather than the selection alone', () => {
    const { editor, calls, names } = makeEditor({ href: 'https://example.com' });
    const { container } = render(editor);

    press(container, 'Remove link');
    expect(names()).toEqual(['focus', 'extendMarkRange', 'unsetLink', 'run']);
    expect(calls[1]).toEqual(['extendMarkRange', 'link']);
  });
});
