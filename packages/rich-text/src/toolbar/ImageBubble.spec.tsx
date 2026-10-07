import { renderWithProviders } from '@repo/test-utils';
import { fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

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

const { ImageBubble } = await import('./ImageBubble');

/** Records every link in the command chain so an assertion can read the whole call. */
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
    getAttributes: (name: string) => (name === 'image' ? attrs : {}),
    isActive: (name: string) => name === 'image' && active,
  } as any;
  return { editor, calls, names: () => calls.map((c) => c[0]) };
}

function render(editor: any) {
  return renderWithProviders(
    <RichEditorContext.Provider
      size="$true"
      compact={false}
      disabled={false}>
      <ImageBubble editor={editor} />
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

describe('ImageBubble', () => {
  it('renders nothing at all without an editor', () => {
    const { container } = render(null);
    expect(container.textContent).toBe('');
    expect(container.querySelector('[data-testid="bubble-menu"]')).toBeNull();
  });

  it('shows itself only while an image node is selected', () => {
    const onImage = makeEditor({ src: 'a.png' }, true);
    render(onImage.editor);
    expect(bubble.props?.shouldShow({ editor: onImage.editor })).toBe(true);

    const offImage = makeEditor({}, false);
    render(offImage.editor);
    expect(bubble.props?.shouldShow({ editor: offImage.editor })).toBe(false);
  });

  it("shows the image's alt text, and says so plainly when there is none", () => {
    const withAlt = render(makeEditor({ alt: 'A red bicycle' }).editor);
    expect(withAlt.getByText('A red bicycle')).toBeTruthy();

    const withoutAlt = render(makeEditor({ src: 'a.png' }).editor);
    expect(withoutAlt.getByText('No alt text')).toBeTruthy();
  });

  it('prefills the editing field with the alt text already on the node', () => {
    const { container, getByText } = render(makeEditor({ alt: 'A red bicycle' }).editor);
    press(container, 'Edit alt text');

    expect(getByText('Alt text')).toBeTruthy();
    const input = container.querySelector('input') as HTMLInputElement;
    expect(input.value).toBe('A red bicycle');
  });

  it('writes the edited alt text back onto the image node and leaves editing', () => {
    const { editor, calls, names } = makeEditor({ alt: 'old' });
    const { container, queryByText } = render(editor);

    press(container, 'Edit alt text');
    fireEvent.change(container.querySelector('input') as HTMLInputElement, {
      target: { value: 'new alt' },
    });
    press(container, 'Save alt text');

    expect(names()).toEqual(['focus', 'updateAttributes', 'run']);
    expect(calls[1]).toEqual(['updateAttributes', 'image', { alt: 'new alt' }]);
    expect(queryByText('Alt text')).toBeNull();
  });

  it('cancel leaves editing without touching the document', () => {
    const { editor, calls } = makeEditor({ alt: 'old' });
    const { container, queryByText, getByText } = render(editor);

    press(container, 'Edit alt text');
    fireEvent.change(container.querySelector('input') as HTMLInputElement, {
      target: { value: 'discarded' },
    });
    press(container, 'Cancel');

    expect(calls).toEqual([]);
    expect(queryByText('Alt text')).toBeNull();
    expect(getByText('old')).toBeTruthy();
  });

  it('delete removes the selected node rather than clearing its attributes', () => {
    const { editor, calls, names } = makeEditor({ alt: 'old' });
    const { container } = render(editor);

    press(container, 'Delete image');
    expect(names()).toEqual(['focus', 'deleteSelection', 'run']);
    expect(calls.some(([name]) => name === 'updateAttributes')).toBe(false);
  });
});
