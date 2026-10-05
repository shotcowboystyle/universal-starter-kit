import { renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as KanbanModule from './Kanban';
import { Kanban, type KanbanColumn } from './Kanban';

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: (opts: { count: number; estimateSize: () => number }) => {
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
      isScrolling: false,
      scrollToIndex: () => {},
    };
  },
}));

afterEach(cleanup);

const columns: KanbanColumn<{ id: string; title: string }>[] = [
  {
    id: 'todo',
    title: 'To Do',
    color: '$blue9',
    items: [{ id: '1', title: 'Task 1' }],
  },
  {
    id: 'done',
    title: 'Done',
    items: [{ id: '2', title: 'Task 2' }],
  },
];

function radiusClassOn(el: Element | null): string | undefined {
  let node = el as HTMLElement | null;
  for (let i = 0; i < 16 && node; i++) {
    const found = String(node.className || '')
      .split(' ')
      .find((c) => c.startsWith('_btlr-'));
    if (found) {
      return found;
    }
    node = node.parentElement;
  }
  return undefined;
}

describe('Kanban exports', () => {
  it('exposes only named exports', () => {
    expect(KanbanModule).toHaveProperty('Kanban');
    expect(KanbanModule).not.toHaveProperty('default');
  });
});

describe('Kanban design law', () => {
  it('declares the column status dot as R-PILL and paints it only when color is set', () => {
    const { container } = renderWithProviders(
      <Kanban columns={columns} renderCard={(item) => <span>{item.title}</span>} />,
    );

    const dots = container.querySelectorAll('[data-radius-part="Kanban column dot"]');
    expect(dots).toHaveLength(1);
    expect(dots[0]?.getAttribute('data-radius-class')).toBe('R-PILL');
    expect(container.querySelectorAll('[data-kanban-column-stripe]')).toHaveLength(0);
  });

  it('does not leak Card dataSet onto the web card host', () => {
    const { container } = renderWithProviders(
      <Kanban columns={columns} renderCard={(item) => <span>{item.title}</span>} />,
    );
    const cards = container.querySelectorAll('[data-kanban-card]');
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      expect(card.hasAttribute('dataset')).toBe(false);
    }
  });

  it('lets the radius knob reshape cards and column frames', () => {
    const { rerender } = renderWithProviders(
      <Preset overrides={{ borderRadius: 'full' }}>
        <Kanban columns={columns} renderCard={(item) => <span>{item.title}</span>} />
      </Preset>,
    );
    const fullCard = radiusClassOn(screen.getByText('Task 1'));
    const fullColumn = radiusClassOn(document.querySelector("[data-kanban-column='todo']")!);

    rerender(
      <Preset overrides={{ borderRadius: 'none' }}>
        <Kanban columns={columns} renderCard={(item) => <span>{item.title}</span>} />
      </Preset>,
    );
    const noneCard = radiusClassOn(screen.getByText('Task 1'));
    const noneColumn = radiusClassOn(document.querySelector("[data-kanban-column='todo']")!);

    expect(fullCard).toBeDefined();
    expect(noneCard).toBeDefined();
    expect(fullCard).not.toBe(noneCard);
    expect(fullColumn).toBeDefined();
    expect(noneColumn).toBeDefined();
    expect(fullColumn).not.toBe(noneColumn);
  });

  it('caps the padded column frame at its own padding (CONTAINER-CAP)', () => {
    const columnRadius = (overrides: Parameters<typeof Preset>[0]['overrides']) => {
      renderWithProviders(
        <Preset overrides={overrides}>
          <Kanban columns={columns} renderCard={(item) => <span>{item.title}</span>} />
        </Preset>,
      );
      const found = radiusClassOn(document.querySelector("[data-kanban-column='todo']"));
      cleanup();
      return found;
    };
    expect(columnRadius({ borderRadius: 'full', space: 'medium' })).toBe('_btlr-18px');
    expect(columnRadius({ borderRadius: 'large', space: 'small' })).toBe('_btlr-13px');
  });

  it('does not paint raw input-surface borders on the column frame', () => {
    renderWithProviders(<Kanban columns={columns} renderCard={(item) => <span>{item.title}</span>} />);
    const column = document.querySelector("[data-kanban-column='todo']") as HTMLElement;
    expect(column).toBeTruthy();
    const className = String(column.className || '');
    expect(className).not.toMatch(/_bw-/);
  });
});
