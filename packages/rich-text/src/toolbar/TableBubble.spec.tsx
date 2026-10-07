import { renderWithProviders } from '@repo/test-utils';
import { fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { RichEditorContext } from '../context';
import type { EditorCapabilities } from '../types';

const bubble = vi.hoisted(() => ({ props: null as Record<string, any> | null }));

vi.mock(import('@tiptap/react/menus'), () => ({
  BubbleMenu: (props: any) => {
    bubble.props = props;
    return <div data-testid="bubble-menu">{props.children}</div>;
  },
}));

// The table menu lives inside a Popover, which never mounts its content in a
// headless DOM. Flatten the popover so the menu is inspectable; nothing else
// about tamagui is replaced.
vi.mock(import('tamagui'), async (importOriginal) => {
  const actual = await importOriginal<Record<string, any>>();
  const Popover: any = ({ children }: any) => <>{children}</>;
  Popover.Trigger = ({ children }: any) => <>{children}</>;
  return { ...actual, Popover };
});

vi.mock(import('@repo/ui'), async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  Tooltip: ({ children }: any) => children,
  PopoverContent: ({ children }: any) => <div data-testid="table-menu">{children}</div>,
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

const { TableBubble } = await import('./TableBubble');

function makeEditor(active = true) {
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
    getAttributes: () => ({}),
    isActive: (name: string) => name === 'table' && active,
  } as any;
  return { editor, calls, names: () => calls.map((c) => c[0]) };
}

function render(editor: any, capabilities?: EditorCapabilities) {
  return renderWithProviders(
    <RichEditorContext.Provider
      size="$true"
      compact={false}
      disabled={false}>
      <TableBubble
        editor={editor}
        capabilities={capabilities}
      />
    </RichEditorContext.Provider>,
  );
}

/** Labels of the items inside the Table dropdown, in document order. */
function menuLabels(container: HTMLElement) {
  const menu = container.querySelector('[data-testid="table-menu"]');
  if (!menu) {
    throw new Error('table menu did not render');
  }
  return [...menu.querySelectorAll('[aria-label]')].map((el) => el.getAttribute('aria-label'));
}

function pressInMenu(container: HTMLElement, label: string) {
  const menu = container.querySelector('[data-testid="table-menu"]') as HTMLElement;
  const el = menu.querySelector(`[aria-label="${label}"]`);
  if (!el) {
    throw new Error(`no menu item labelled "${label}"`);
  }
  fireEvent.click(el);
}

const ROW_AND_COLUMN = [
  'Add row above',
  'Add row below',
  'Delete row',
  'Add column before',
  'Add column after',
  'Delete column',
];

describe('TableBubble', () => {
  it('renders nothing at all without an editor', () => {
    const { container } = render(null);
    expect(container.textContent).toBe('');
  });

  it('shows itself only while the caret is inside a table', () => {
    const inTable = makeEditor(true);
    render(inTable.editor);
    expect(bubble.props?.shouldShow({ editor: inTable.editor })).toBe(true);

    const outside = makeEditor(false);
    render(outside.editor);
    expect(bubble.props?.shouldShow({ editor: outside.editor })).toBe(false);
  });

  it('anchors to the table rect, not the caret, so it cannot cover the first row', () => {
    const { editor } = makeEditor();
    render(editor);
    expect(bubble.props?.getReferencedVirtualElement).toBeTypeOf('function');
    expect(bubble.props?.options).toMatchObject({ placement: 'top-start' });
  });

  it('attaches flush to the table at the overlay family gap, not a private 6px (MPO-35)', () => {
    const { editor } = makeEditor();
    render(editor);
    expect(bubble.props?.options).toMatchObject({ offset: 0 });
  });

  // LC-52: GFM pipe tables are plain grids, so merge and split have no
  // markdown form. The markdown capability must drop exactly those two.
  it('markdown capability removes exactly mergeCells and splitCell', () => {
    const { container } = render(makeEditor().editor, 'markdown');
    const labels = menuLabels(container);

    expect(labels).not.toContain('Merge cells');
    expect(labels).not.toContain('Split cell');
    expect(labels).toContain('Toggle header row');
    expect(labels).toContain('Delete table');
  });

  it('full capability keeps all four table actions', () => {
    const { container } = render(makeEditor().editor, 'full');
    const labels = menuLabels(container);

    expect(labels).toContain('Toggle header row');
    expect(labels).toContain('Merge cells');
    expect(labels).toContain('Split cell');
    expect(labels).toContain('Delete table');
  });

  it('defaults to the full surface when no capability is passed', () => {
    const { container } = render(makeEditor().editor);
    expect(menuLabels(container)).toEqual(menuLabels(render(makeEditor().editor, 'full').container));
  });

  it('the capability filter touches table actions only — every row and column action survives', () => {
    const full = menuLabels(render(makeEditor().editor, 'full').container);
    const markdown = menuLabels(render(makeEditor().editor, 'markdown').container);

    for (const label of ROW_AND_COLUMN) {
      expect(full).toContain(label);
      expect(markdown).toContain(label);
    }
    expect(full.length - markdown.length).toBe(2);
  });

  it('the quick buttons add after the current row and column, not before', () => {
    const { editor, names } = makeEditor();
    const { container } = render(editor);

    fireEvent.click(container.querySelector('[aria-label="Add row"]'));
    expect(names()).toEqual(['focus', 'addRowAfter', 'run']);

    fireEvent.click(container.querySelector('[aria-label="Add column"]'));
    expect(names()).toEqual(['focus', 'addRowAfter', 'run', 'focus', 'addColumnAfter', 'run']);
  });

  it('each menu item runs its own command', () => {
    const cases: [string, string][] = [
      ['Add row above', 'addRowBefore'],
      ['Delete row', 'deleteRow'],
      ['Add column before', 'addColumnBefore'],
      ['Delete column', 'deleteColumn'],
      ['Toggle header row', 'toggleHeaderRow'],
      ['Merge cells', 'mergeCells'],
      ['Split cell', 'splitCell'],
    ];

    for (const [label, command] of cases) {
      const { editor, names } = makeEditor();
      const { container } = render(editor, 'full');
      pressInMenu(container, label);
      expect(names()).toEqual(['focus', command, 'run']);
    }
  });
});
