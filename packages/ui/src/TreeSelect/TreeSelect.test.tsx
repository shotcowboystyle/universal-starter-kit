import { renderWithProviders } from '@repo/test-utils';
import { act, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { TreeNode } from '../views/TreeView';

import { TreeSelect } from './index';

const accounts: TreeNode[] = [
  {
    id: 'assets',
    label: 'Assets',
    children: [
      {
        id: 'current',
        label: 'Current Assets',
        children: [
          {
            id: 'bank',
            label: 'Bank Accounts',
            children: [
              { id: 'hdfc', label: 'HDFC Current' },
              { id: 'cash', label: 'Cash' },
            ],
          },
        ],
      },
      { id: 'fixed', label: 'Fixed Assets' },
    ],
  },
  { id: 'liabilities', label: 'Liabilities' },
];

function mockRect(el: HTMLElement, rect: { x: number; y: number; width: number; height: number }) {
  const next = {
    ...rect,
    top: rect.y,
    left: rect.x,
    right: rect.x + rect.width,
    bottom: rect.y + rect.height,
    toJSON: () => ({}),
  } as DOMRect;
  el.getBoundingClientRect = () => next;
  const proto = HTMLElement.prototype.getBoundingClientRect;
  HTMLElement.prototype.getBoundingClientRect = function mockedTriggerRect() {
    if (this === el || this.closest?.("[data-testid='tree-select-trigger']") === el) {
      return next;
    }
    return proto.call(this);
  };
  return () => {
    HTMLElement.prototype.getBoundingClientRect = proto;
  };
}

function tabStops(root: ParentNode) {
  return [
    ...root.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ].filter((el) => {
    if (el.getAttribute('aria-hidden') === 'true') {
      return false;
    }
    const style = el.getAttribute('style') ?? '';
    return !style.includes('display: none');
  });
}

function setViewport(width: number) {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: width,
  });
  window.dispatchEvent(new Event('resize'));
}

describe('TreeSelect cover + width', () => {
  it('panel attaches at zero over the trigger and honours at-least-trigger', async () => {
    setViewport(1200);
    const result = renderWithProviders(
      <TreeSelect
        label="Account"
        nodes={accounts}
        value="hdfc"
        defaultExpandedIds={['assets', 'current', 'bank']}
        open
      />,
    );
    const trigger = result.baseElement.querySelector('[data-testid="tree-select-trigger"]') as HTMLElement;
    expect(trigger).toBeTruthy();
    const restoreRect = mockRect(trigger, { x: 40, y: 80, width: 280, height: 44 });
    window.dispatchEvent(new Event('resize'));

    try {
      await waitFor(() => {
        const panel = result.baseElement.querySelector('[data-testid="tree-select-panel"]') as HTMLElement | null;
        expect(panel).toBeTruthy();
        expect(panel?.getAttribute('data-width-mode')).toBe('at-least-trigger');
        expect(panel?.getAttribute('data-dismiss-class')).toBe('commit');
        expect(Number.parseFloat(panel?.style.top ?? '')).toBe(80);
        expect(Number.parseFloat(panel?.style.minWidth ?? '')).toBeGreaterThanOrEqual(280);
      });
    } finally {
      restoreRect();
    }
  });
});

describe('TreeSelect one tab stop', () => {
  it('closed field is one tab stop; open tree is search + activedescendant', async () => {
    setViewport(1200);
    const result = renderWithProviders(<TreeSelect label="Account" nodes={accounts} value="hdfc" />);
    const closedStops = tabStops(result.baseElement);
    expect(closedStops.length).toBe(1);
    expect(closedStops[0]?.getAttribute('data-testid')).toBe('tree-select-trigger');

    result.rerender(<TreeSelect label="Account" nodes={accounts} value="hdfc" open defaultExpandedIds={['assets']} />);
    await waitFor(() => {
      expect(result.baseElement.querySelector('[data-testid="tree-select-search"]')).toBeTruthy();
    });
    const openRoot = result.baseElement;
    const search = openRoot.querySelector('[data-testid="tree-select-search"] input') as HTMLElement;
    expect(search).toBeTruthy();
    const tree = openRoot.querySelector('[role="tree"]') as HTMLElement;
    expect(tree?.tabIndex).toBe(-1);
    const carets = [...openRoot.querySelectorAll('[data-treeselect-caret]')];
    for (const caret of carets) {
      expect(caret.getAttribute('tabindex')).toBe('-1');
    }
    const rows = [...openRoot.querySelectorAll('[data-treeselect-row]')];
    for (const row of rows) {
      expect(row.getAttribute('tabindex')).toBe('-1');
    }
    expect(search.getAttribute('aria-activedescendant')).toMatch(/-node-0$/);

    await act(async () => {
      fireEvent.keyDown(search, { key: 'ArrowDown' });
    });
    expect(search.getAttribute('aria-activedescendant')).toMatch(/-node-1$/);
  });
});

describe('TreeSelect commit vs expand', () => {
  it('row pick commits and closes; caret expand does not', async () => {
    setViewport(1200);
    const onChange = vi.fn();
    const onOpenChange = vi.fn();
    const result = renderWithProviders(
      <TreeSelect label="Account" nodes={accounts} open onChange={onChange} onOpenChange={onOpenChange} />,
    );
    await waitFor(() => {
      expect(result.baseElement.querySelector('[data-treeselect-caret]')).toBeTruthy();
    });
    const caret = result.baseElement.querySelector('[data-treeselect-caret]') as HTMLElement;
    await act(async () => {
      fireEvent.click(caret);
    });
    expect(onChange).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);

    const cash = result.baseElement.querySelector('[data-treeselect-row="liabilities"]') as HTMLElement;
    await act(async () => {
      fireEvent.click(cash);
    });
    expect(onChange).toHaveBeenCalledWith('liabilities');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe('TreeSelect sheet at <=640', () => {
  it('renders the sheet; rows match the desktop tree', async () => {
    setViewport(1200);
    const desktop = renderWithProviders(
      <TreeSelect label="Account" nodes={accounts} open defaultExpandedIds={['assets', 'current', 'bank']} />,
    );
    await waitFor(() => {
      expect(desktop.baseElement.querySelector('[data-treeselect-row]')).toBeTruthy();
    });
    const desktopTree = desktop.baseElement.querySelector('[data-testid="tree-select-tree"]');
    const desktopRows = [...desktop.baseElement.querySelectorAll('[data-treeselect-row]')].map((el) => ({
      id: el.getAttribute('data-treeselect-row'),
      depth: el.getAttribute('data-depth'),
    }));
    const desktopIndent = desktopTree?.getAttribute('data-indent-step');
    const desktopRowHeight = desktopTree?.getAttribute('data-row-height');

    desktop.unmount();
    setViewport(640);
    const mobile = renderWithProviders(
      <TreeSelect label="Account" nodes={accounts} open defaultExpandedIds={['assets', 'current', 'bank']} />,
    );
    await waitFor(() => {
      expect(mobile.baseElement.querySelector('[data-treeselect-row]')).toBeTruthy();
    });
    expect(mobile.baseElement.querySelector('[data-testid="floating-panel-viewport"]')).toBeNull();
    const mobileTree = mobile.baseElement.querySelector('[data-testid="tree-select-tree"]');
    const mobileRows = [...mobile.baseElement.querySelectorAll('[data-treeselect-row]')].map((el) => ({
      id: el.getAttribute('data-treeselect-row'),
      depth: el.getAttribute('data-depth'),
    }));
    expect(mobileRows).toEqual(desktopRows);
    expect(mobileTree?.getAttribute('data-indent-step')).toBe(desktopIndent);
    expect(mobileTree?.getAttribute('data-row-height')).toBe(desktopRowHeight);
  });
});

describe('TreeSelect empty filter', () => {
  it('shows a 44 row, not an EmptyState well', async () => {
    setViewport(1200);
    const result = renderWithProviders(
      <TreeSelect label="Account" nodes={accounts} open emptyMessage="No matching accounts" />,
    );
    await waitFor(() => {
      expect(result.baseElement.querySelector('[data-testid="tree-select-search"]')).toBeTruthy();
    });
    const search = result.baseElement.querySelector('[data-testid="tree-select-search"] input') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(search, { target: { value: 'xyzzy' } });
    });
    const empty = result.baseElement.querySelector('[data-testid="tree-select-empty"]') as HTMLElement;
    expect(empty).toBeTruthy();
    expect(empty.textContent).toContain('No matching accounts');
    expect(result.baseElement.querySelector('[data-testid="empty-state"]')).toBeNull();
  });
});
