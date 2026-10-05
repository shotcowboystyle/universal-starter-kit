import { renderWithProviders } from '@repo/test-utils';
import { HotkeyManager } from '@tanstack/hotkeys';
import { cleanup, screen, fireEvent } from '@testing-library/react';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock @tanstack/react-virtual so that useVirtualizer renders all items
// in the happy-dom test environment (which has no layout engine).
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: (opts: { count: number; estimateSize: () => number; overscan?: number }) => {
    const size = opts.estimateSize();
    const items = Array.from({ length: opts.count }, (_, i) => ({
      index: i,
      key: String(i),
      start: i * size,
      end: (i + 1) * size,
      size,
    }));
    return {
      getVirtualItems: () => items,
      getTotalSize: () => opts.count * size,
      measureElement: () => {},
      scrollToIndex: () => {},
    };
  },
}));

// Import view components AFTER the mock is set up
import { List } from './List';

afterEach(() => {
  cleanup();
  HotkeyManager.resetInstance();
});

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const items = [
  { id: '0', name: 'Item 0' },
  { id: '1', name: 'Item 1' },
  { id: '2', name: 'Item 2' },
  { id: '3', name: 'Item 3' },
  { id: '4', name: 'Item 4' },
];

function renderList(props: Partial<React.ComponentProps<typeof List<(typeof items)[0]>>> = {}) {
  return renderWithProviders(
    <List
      items={items}
      renderItem={(item) => <span data-testid={`item-${item.id}`}>{item.name}</span>}
      height={300}
      estimateSize={50}
      {...props}
    />,
  );
}

// ---------------------------------------------------------------------------
// Test 1: List supports ArrowDown/Up to navigate items
// ---------------------------------------------------------------------------
describe('List keyboard navigation: ArrowDown/Up', () => {
  it('ArrowDown focuses items sequentially, ArrowUp reverses', () => {
    renderList();
    const container = screen.getByRole('list');

    // Initially no focused item
    expect(container.querySelector('[data-focused]')).toBeNull();

    // ArrowDown → focus first item (index 0)
    fireEvent.keyDown(container, { key: 'ArrowDown' });
    let focused = container.querySelector('[data-focused]');
    expect(focused).not.toBeNull();
    expect(focused!.textContent).toContain('Item 0');

    // ArrowDown → focus second item (index 1)
    fireEvent.keyDown(container, { key: 'ArrowDown' });
    focused = container.querySelector('[data-focused]');
    expect(focused!.textContent).toContain('Item 1');

    // ArrowDown → index 2
    fireEvent.keyDown(container, { key: 'ArrowDown' });
    focused = container.querySelector('[data-focused]');
    expect(focused!.textContent).toContain('Item 2');

    // ArrowUp → back to index 1
    fireEvent.keyDown(container, { key: 'ArrowUp' });
    focused = container.querySelector('[data-focused]');
    expect(focused!.textContent).toContain('Item 1');

    // ArrowUp → back to index 0
    fireEvent.keyDown(container, { key: 'ArrowUp' });
    focused = container.querySelector('[data-focused]');
    expect(focused!.textContent).toContain('Item 0');

    // ArrowUp at top → stays at index 0
    fireEvent.keyDown(container, { key: 'ArrowUp' });
    focused = container.querySelector('[data-focused]');
    expect(focused!.textContent).toContain('Item 0');
  });
});

// ---------------------------------------------------------------------------
// Test 2: List supports Enter to select focused item
// ---------------------------------------------------------------------------
describe('List keyboard navigation: Enter to select', () => {
  it('Enter triggers onItemClick with the focused item', () => {
    const onItemClick = vi.fn();
    renderList({ onItemClick });
    const container = screen.getByRole('list');

    // Enter without focus does nothing
    fireEvent.keyDown(container, { key: 'Enter' });
    expect(onItemClick).not.toHaveBeenCalled();

    // Focus first item, then select with Enter
    fireEvent.keyDown(container, { key: 'ArrowDown' });
    fireEvent.keyDown(container, { key: 'Enter' });
    expect(onItemClick).toHaveBeenCalledTimes(1);
    expect(onItemClick).toHaveBeenCalledWith(items[0]);

    // Move to second item and select
    fireEvent.keyDown(container, { key: 'ArrowDown' });
    fireEvent.keyDown(container, { key: 'Enter' });
    expect(onItemClick).toHaveBeenCalledTimes(2);
    expect(onItemClick).toHaveBeenCalledWith(items[1]);
  });
});

// ---------------------------------------------------------------------------
// Test 3: List supports Home/End and PageUp/PageDown
// ---------------------------------------------------------------------------
describe('List keyboard navigation: Home/End/PageUp/PageDown', () => {
  it('Home goes to first, End goes to last, PageDown/Up jump by 10', () => {
    const manyItems = Array.from({ length: 50 }, (_, i) => ({
      id: String(i),
      name: `Item ${i}`,
    }));

    renderWithProviders(
      <List items={manyItems} renderItem={(item) => <span>{item.name}</span>} height={300} estimateSize={30} />,
    );

    const container = screen.getByRole('list');

    // End → focus last item
    fireEvent.keyDown(container, { key: 'End' });
    let focused = container.querySelector('[data-focused]');
    expect(focused!.textContent).toContain('Item 49');

    // Home → focus first item
    fireEvent.keyDown(container, { key: 'Home' });
    focused = container.querySelector('[data-focused]');
    expect(focused!.textContent).toContain('Item 0');

    // PageDown → jump forward by 10
    fireEvent.keyDown(container, { key: 'PageDown' });
    focused = container.querySelector('[data-focused]');
    expect(focused!.textContent).toContain('Item 10');

    // PageDown again → jump to 20
    fireEvent.keyDown(container, { key: 'PageDown' });
    focused = container.querySelector('[data-focused]');
    expect(focused!.textContent).toContain('Item 20');

    // PageUp → jump back by 10 to 10
    fireEvent.keyDown(container, { key: 'PageUp' });
    focused = container.querySelector('[data-focused]');
    expect(focused!.textContent).toContain('Item 10');

    // PageUp → back to 0
    fireEvent.keyDown(container, { key: 'PageUp' });
    focused = container.querySelector('[data-focused]');
    expect(focused!.textContent).toContain('Item 0');
  });
});

// ---------------------------------------------------------------------------
// Test 4: Hotkeys are overridable via props
// ---------------------------------------------------------------------------
describe('List keyboard navigation: hotkey overrides', () => {
  it('custom hotkeys replace default keybindings', () => {
    renderList({
      hotkeys: {
        next: 'ArrowRight',
        prev: 'ArrowLeft',
      },
    });
    const container = screen.getByRole('list');

    // Default ArrowDown should NOT move focus (it was overridden)
    fireEvent.keyDown(container, { key: 'ArrowDown' });
    expect(container.querySelector('[data-focused]')).toBeNull();

    // Custom ArrowRight should work as "next"
    fireEvent.keyDown(container, { key: 'ArrowRight' });
    let focused = container.querySelector('[data-focused]');
    expect(focused).not.toBeNull();
    expect(focused!.textContent).toContain('Item 0');

    // Move forward again with ArrowRight
    fireEvent.keyDown(container, { key: 'ArrowRight' });
    focused = container.querySelector('[data-focused]');
    expect(focused!.textContent).toContain('Item 1');

    // Custom ArrowLeft should work as "prev"
    fireEvent.keyDown(container, { key: 'ArrowLeft' });
    focused = container.querySelector('[data-focused]');
    expect(focused!.textContent).toContain('Item 0');

    // Default ArrowUp should NOT work
    fireEvent.keyDown(container, { key: 'ArrowUp' });
    focused = container.querySelector('[data-focused]');
    // Still on Item 0 (ArrowUp didn't do anything because it's no longer registered)
    expect(focused!.textContent).toContain('Item 0');
  });
});
