import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderWithProviders } from '@repo/test-utils';
import { useChartPalette, type ChartPalette } from '@repo/theme';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import * as React from 'react';
import { Theme } from 'tamagui';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { componentColors } from '../componentColors';

import {
  Calendar,
  computeEventMoveRange,
  eventChipTextColor,
  findDayKeyAtPoint,
  type CalendarDayLayout,
  type CalendarEvent,
} from './Calendar';
import * as GanttMathExports from './ganttMath';

import * as ViewExports from './index';

// ChartSurface measures its width via onLayout, which never fires in
// happy-dom (no layout engine) — pin the measurement so the universal
// charts inside ChartCard render; scales, marks, and palette resolution
// stay real (same convention as the explicit widths in charts.test.tsx).
vi.mock('../charts/ChartSurface', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../charts/ChartSurface')>();
  return {
    ...actual,
    ChartSurface: (props: React.ComponentProps<typeof actual.ChartSurface>) => (
      <actual.ChartSurface {...props} width={props.width ?? 400} />
    ),
  };
});

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
    };
  },
}));

import { ImageGrid } from './ImageGrid';
import { Kanban, type KanbanColumn } from './Kanban';
// Import view components AFTER the mock is set up
import { List } from './List';
import { TreeView, type TreeNode } from './TreeView';

const here = dirname(fileURLToPath(import.meta.url));

afterEach(cleanup);

// ---------------------------------------------------------------------------
// Test 1: List renders items as ListItem rows
// ---------------------------------------------------------------------------
describe('List', () => {
  it('renders items from array prop', () => {
    const items = [
      { id: '1', name: 'Pikachu' },
      { id: '2', name: 'Charmander' },
      { id: '3', name: 'Bulbasaur' },
    ];

    renderWithProviders(
      <List
        items={items}
        renderItem={(item) => <span data-testid={`item-${item.id}`}>{item.name}</span>}
        height={300}
        estimateSize={50}
      />,
    );

    expect(screen.getByText('Pikachu')).toBeInTheDocument();
    expect(screen.getByText('Charmander')).toBeInTheDocument();
    expect(screen.getByText('Bulbasaur')).toBeInTheDocument();
  });

  it('renders empty message when items array is empty', () => {
    renderWithProviders(<List items={[]} renderItem={() => <span />} emptyMessage="No Pokemon found" />);

    expect(screen.getByText('No Pokemon found')).toBeInTheDocument();
  });

  it('shows list skeleton while loading with no items', () => {
    renderWithProviders(<List items={[]} renderItem={() => <span />} isLoading emptyMessage="No Pokemon found" />);
    expect(document.querySelector('[data-async-skeleton="list"]')).toBeTruthy();
    expect(screen.queryByText('No Pokemon found')).toBeNull();
  });

  it('forbids empty chrome when error is set', () => {
    renderWithProviders(
      <List items={[]} renderItem={() => <span />} emptyMessage="No Pokemon found" error="Failed to fetch" />,
    );
    expect(screen.queryByText('No Pokemon found')).toBeNull();
    expect(screen.getByText('Failed to fetch')).toBeInTheDocument();
    expect(document.querySelector('[data-async-state="error"]')).toBeTruthy();
  });

  it('renders rows as ListItem with listitem role', () => {
    const items = [
      { id: '1', name: 'Pikachu' },
      { id: '2', name: 'Charmander' },
    ];

    const { container } = renderWithProviders(
      <List items={items} renderItem={(item) => <span>{item.name}</span>} height={300} estimateSize={50} />,
    );

    const listItems = container.querySelectorAll('[role="listitem"]');
    expect(listItems.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Test 2: List uses useVirtualizer for DOM windowing
// ---------------------------------------------------------------------------
describe('List virtualization', () => {
  it('uses useVirtualizer with absolute positioning for windowed rendering', () => {
    const items = Array.from({ length: 50 }, (_, i) => ({
      id: String(i),
      name: `Item ${i}`,
    }));

    const { container } = renderWithProviders(
      <List
        items={items}
        renderItem={(item) => <div data-testid={`item-${item.id}`}>{item.name}</div>}
        height={200}
        estimateSize={50}
        overscan={2}
      />,
    );

    // The virtualizer renders items with absolute positioning + translateY
    const renderedItems = container.querySelectorAll('[data-testid^="item-"]');
    expect(renderedItems.length).toBeGreaterThan(0);

    // Items are positioned via transform (virtualizer pattern)
    const firstItemParent = renderedItems[0]?.closest('[role="listitem"]');
    expect(firstItemParent).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Test 3: Kanban renders columns as Card and cards from props
// ---------------------------------------------------------------------------
describe('Kanban', () => {
  it('renders columns and cards from props', () => {
    const columns: KanbanColumn<{ id: string; title: string }>[] = [
      {
        id: 'todo',
        title: 'To Do',
        items: [
          { id: '1', title: 'Task 1' },
          { id: '2', title: 'Task 2' },
        ],
      },
      {
        id: 'done',
        title: 'Done',
        items: [{ id: '3', title: 'Task 3' }],
      },
    ];

    renderWithProviders(
      <Kanban columns={columns} renderCard={(item) => <span>{item.title}</span>} estimateSize={80} />,
    );

    // Column headers
    expect(screen.getByText('To Do')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();

    // Cards
    expect(screen.getByText('Task 1')).toBeInTheDocument();
    expect(screen.getByText('Task 2')).toBeInTheDocument();
    expect(screen.getByText('Task 3')).toBeInTheDocument();

    // Counts
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('shows error UI and hides board chrome when error is set', () => {
    renderWithProviders(
      <Kanban
        columns={[{ id: 'todo', title: 'To Do', items: [] }]}
        renderCard={() => <span />}
        error="Board failed to load"
        emptyColumnMessage="No items"
      />,
    );
    expect(screen.queryByText('To Do')).toBeNull();
    expect(screen.queryByText('No items')).toBeNull();
    expect(screen.getByText('Board failed to load')).toBeInTheDocument();
  });

  it('shows kanban skeleton while loading empty board', () => {
    renderWithProviders(
      <Kanban columns={[{ id: 'todo', title: 'To Do', items: [] }]} renderCard={() => <span />} isLoading />,
    );
    expect(document.querySelector('[data-async-skeleton="kanban"]')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Test 4: TreeView — EUI-style flat rows + expand/select contracts
// ---------------------------------------------------------------------------
describe('TreeView', () => {
  const nodes: TreeNode[] = [
    {
      id: 'root',
      label: 'Root Node',
      children: [
        { id: 'child-1', label: 'Child 1' },
        {
          id: 'child-2',
          label: 'Child 2',
          children: [{ id: 'grandchild', label: 'Grandchild' }],
        },
      ],
    },
    {
      id: 'root-2',
      label: 'Root 2',
    },
  ];

  it('renders nested tree data from props', () => {
    renderWithProviders(
      <TreeView
        nodes={nodes}
        renderNode={(node) => <span>{node.label}</span>}
        defaultExpandedIds={['root', 'child-2']}
        height={400}
      />,
    );

    expect(screen.getByText('Root Node')).toBeInTheDocument();
    expect(screen.getByText('Root 2')).toBeInTheDocument();
    expect(screen.getByText('Child 1')).toBeInTheDocument();
    expect(screen.getByText('Child 2')).toBeInTheDocument();
    expect(screen.getByText('Grandchild')).toBeInTheDocument();
  });

  it('expandByDefault shows all nested descendants', () => {
    renderWithProviders(<TreeView nodes={nodes} expandByDefault ariaLabel="Test tree" height={400} />);

    expect(screen.getByText('Root Node')).toBeInTheDocument();
    expect(screen.getByText('Child 1')).toBeInTheDocument();
    expect(screen.getByText('Child 2')).toBeInTheDocument();
    expect(screen.getByText('Grandchild')).toBeInTheDocument();
  });

  it('marks the selectedId row as aria-selected', () => {
    renderWithProviders(
      <TreeView
        nodes={nodes}
        defaultExpandedIds={['root']}
        selectedId="child-1"
        ariaLabel="Selection tree"
        height={400}
      />,
    );

    const selected = screen.getByText('Child 1').closest('[role="treeitem"]');
    expect(selected).toHaveAttribute('aria-selected', 'true');
  });

  it('exposes expandable branches via aria-expanded rows', () => {
    renderWithProviders(<TreeView nodes={nodes} showExpansionArrows ariaLabel="Arrow tree" height={400} />);

    // The whole branch row is the toggle target (EUI/VS Code semantics);
    // the caret is a rotating indicator, not a separate sub-44px control.
    const branch = screen.getByText('Root Node').closest('[role="treeitem"]');
    expect(branch).toHaveAttribute('aria-expanded', 'false');
  });

  it('toggles a branch on row press and again with Space', () => {
    renderWithProviders(<TreeView nodes={nodes} showExpansionArrows ariaLabel="Space tree" height={400} />);

    expect(screen.queryByText('Child 1')).not.toBeInTheDocument();

    // Pressing the branch row expands it (and focuses the row).
    fireEvent.click(screen.getByText('Root Node'));
    expect(screen.getByText('Child 1')).toBeInTheDocument();
    expect(screen.getByText('Root Node').closest('[role="treeitem"]')).toHaveAttribute('aria-expanded', 'true');

    // Space on the focused branch collapses it again.
    const tree = screen.getByRole('tree');
    tree.focus();
    fireEvent.keyDown(tree, { key: ' ', code: 'Space' });

    expect(screen.queryByText('Child 1')).not.toBeInTheDocument();
  });

  it('uses compressed estimateSize defaults without crashing', () => {
    renderWithProviders(
      <TreeView nodes={nodes} display="compressed" expandByDefault ariaLabel="Compressed tree" height={280} />,
    );

    expect(screen.getByRole('tree')).toHaveAttribute('aria-label', 'Compressed tree');
    expect(screen.getByText('Grandchild')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Test 5: ImageGrid renders image items from props
// ---------------------------------------------------------------------------
describe('ImageGrid', () => {
  it('renders image items from props', () => {
    const items = [
      { id: '1', title: 'Photo A', url: 'https://example.com/a.jpg' },
      { id: '2', title: 'Photo B', url: 'https://example.com/b.jpg' },
      { id: '3', title: 'Photo C', url: 'https://example.com/c.jpg' },
    ];

    renderWithProviders(
      <ImageGrid
        items={items}
        columns={3}
        renderItem={(item) => (
          <div data-testid={`grid-item-${item.id}`}>
            <span>{item.title}</span>
          </div>
        )}
        height={400}
        estimateSize={200}
      />,
    );

    expect(screen.getByText('Photo A')).toBeInTheDocument();
    expect(screen.getByText('Photo B')).toBeInTheDocument();
    expect(screen.getByText('Photo C')).toBeInTheDocument();
  });

  it('shows the grid-shaped skeleton twin while loading with no items', () => {
    renderWithProviders(<ImageGrid items={[]} renderItem={() => <div />} isLoading columns={3} />);

    const twin = document.querySelector('[data-async-skeleton="image-grid"]');
    expect(twin).toBeTruthy();
    // Two rows of `columns` flex tracks, the ready wall's row geometry:
    // gutters ride row gap, never a negative cell margin.
    const rows = Array.from(twin?.children ?? []);
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.children).toHaveLength(3);
    }
    expect(screen.queryByText('No items found')).toBeNull();
  });

  it('error wins over empty and the retry action fires', () => {
    const onRetry = vi.fn();
    renderWithProviders(
      <ImageGrid
        items={[]}
        renderItem={() => <div />}
        emptyMessage="No images"
        error="Image list failed to load"
        onRetry={onRetry}
      />,
    );

    expect(screen.queryByText('No images')).toBeNull();
    expect(document.querySelector('[data-async-state="error"]')).toBeTruthy();
    expect(screen.getByText('Image list failed to load')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('renders empty message when items array is empty', () => {
    renderWithProviders(<ImageGrid items={[]} renderItem={() => <div />} emptyMessage="No images" />);

    expect(screen.getByText('No images')).toBeInTheDocument();
  });

  it('does not paint a status pip on the media; tile radius stays UNCLAMPED', () => {
    const src = readFileSync(join(here, 'ImageGrid.tsx'), 'utf8');
    expect(src).not.toMatch(/capContainerRadius\(|knobProps\.containerRadius|knobProps\.cardSurface/);
    expect(src).toContain('knobProps.borderRadius');
    expect(src).not.toMatch(/data-status-pip|StatusPip|statusPip/);

    const items = [
      { id: '1', title: 'Photo A' },
      { id: '2', title: 'Photo B' },
    ];
    renderWithProviders(
      <ImageGrid items={items} columns={2} renderItem={(item) => <div>{item.title}</div>} height={400} />,
    );
    const cells = document.querySelectorAll('[role="gridcell"]');
    expect(cells.length).toBe(2);
    for (const cell of cells) {
      expect(cell.querySelector('[data-status-pip]')).toBeNull();
      expect(cell.getAttribute('data-media-tile')).toBe('image-grid');
    }
  });
});

// ---------------------------------------------------------------------------
// Test 6: Calendar renders events and uses ToggleGroup for view switcher
// ---------------------------------------------------------------------------
describe('Calendar', () => {
  it('renders events from props', () => {
    const today = new Date();
    const events: CalendarEvent[] = [
      {
        id: 'evt-1',
        title: 'Team Meeting',
        start: today,
        color: '#3b82f6',
      },
      {
        id: 'evt-2',
        title: 'Sprint Review',
        start: today,
        color: '#10b981',
      },
    ];

    renderWithProviders(<Calendar events={events} viewType="month" initialDate={today} height={600} />);

    // Events should be rendered in the month view
    expect(screen.getByText('Team Meeting')).toBeInTheDocument();
    expect(screen.getByText('Sprint Review')).toBeInTheDocument();

    // Navigation controls should be present
    expect(screen.getByText('Today')).toBeInTheDocument();
    // ToggleGroup items for view switcher
    expect(screen.getByText('Month')).toBeInTheDocument();
    expect(screen.getByText('Week')).toBeInTheDocument();
    expect(screen.getByText('Day')).toBeInTheDocument();
  });

  it('a colourless event chip takes the ink resolved for the accent fill', () => {
    expect(eventChipTextColor(undefined, '#ffffff')).toBe('#ffffff');
    expect(eventChipTextColor('', '#f0eff1')).toBe('#f0eff1');
    expect(eventChipTextColor(undefined)).toBe('$accentColor');
    expect(eventChipTextColor('#10b981', '#ffffff')).toBe('#000000');
    expect(eventChipTextColor('$green9', '#ffffff')).toBe('$accentColor');
  });
});

// ---------------------------------------------------------------------------
// Test 6b: Calendar event drag-and-drop (computeEventMoveRange + pointer flow)
// ---------------------------------------------------------------------------
describe('Calendar event drag', () => {
  describe('computeEventMoveRange', () => {
    it('preserves time-of-day and duration when moving to another day', () => {
      const event: CalendarEvent = {
        id: 'evt-1',
        title: 'Standup',
        start: new Date(2026, 2, 10, 9, 0),
        end: new Date(2026, 2, 10, 9, 30),
      };
      const range = computeEventMoveRange(event, new Date(2026, 2, 20));
      expect(range.start).toEqual(new Date(2026, 2, 20, 9, 0));
      expect(range.end).toEqual(new Date(2026, 2, 20, 9, 30));
      expect(range.end.getTime() - range.start.getTime()).toBe(30 * 60 * 1000);
    });

    it('preserves the day span of multi-day events', () => {
      const event: CalendarEvent = {
        id: 'evt-2',
        title: 'Conference',
        start: new Date(2026, 2, 10, 9, 0),
        end: new Date(2026, 2, 12, 17, 0),
      };
      const range = computeEventMoveRange(event, new Date(2026, 2, 25));
      expect(range.start).toEqual(new Date(2026, 2, 25, 9, 0));
      expect(range.end).toEqual(new Date(2026, 2, 27, 17, 0));
    });

    it('moves backwards and across month boundaries', () => {
      const event: CalendarEvent = {
        id: 'evt-3',
        title: 'Review',
        start: new Date(2026, 2, 10, 14, 15),
        end: new Date(2026, 2, 10, 15, 45),
      };
      const range = computeEventMoveRange(event, new Date(2026, 1, 27));
      expect(range.start).toEqual(new Date(2026, 1, 27, 14, 15));
      expect(range.end).toEqual(new Date(2026, 1, 27, 15, 45));
    });

    it('returns a zero-duration range for events without an end', () => {
      const event: CalendarEvent = {
        id: 'evt-4',
        title: 'Reminder',
        start: new Date(2026, 2, 10, 8, 0),
      };
      const range = computeEventMoveRange(event, new Date(2026, 2, 11));
      expect(range.start).toEqual(new Date(2026, 2, 11, 8, 0));
      expect(range.end).toEqual(range.start);
    });
  });

  describe('findDayKeyAtPoint (native hit-test)', () => {
    const layouts: CalendarDayLayout[] = [
      { key: '2026-03-10', x: 0, y: 0, width: 100, height: 80 },
      { key: '2026-03-11', x: 100, y: 0, width: 100, height: 80 },
      { key: '2026-03-17', x: 0, y: 80, width: 100, height: 80 },
    ];

    it('returns the day key whose rect contains the point', () => {
      expect(findDayKeyAtPoint(150, 40, layouts)).toBe('2026-03-11');
      expect(findDayKeyAtPoint(10, 100, layouts)).toBe('2026-03-17');
    });

    it('returns null when the point misses every day cell', () => {
      expect(findDayKeyAtPoint(500, 500, layouts)).toBeNull();
    });

    it('assigns shared edges to the next cell (half-open rects)', () => {
      expect(findDayKeyAtPoint(100, 0, layouts)).toBe('2026-03-11');
      expect(findDayKeyAtPoint(0, 80, layouts)).toBe('2026-03-17');
      expect(findDayKeyAtPoint(199, 79, layouts)).toBe('2026-03-11');
    });
  });

  describe('pointer drag interaction', () => {
    const start = new Date(2026, 2, 10, 9, 0);
    const dragEvents: CalendarEvent[] = [{ id: 'evt-1', title: 'Standup', start, end: new Date(2026, 2, 10, 9, 30) }];
    const originalElementFromPoint = document.elementFromPoint;

    afterEach(() => {
      (document as any).elementFromPoint = originalElementFromPoint;
    });

    function renderDraggableCalendar(onEventMove = vi.fn(), onEventClick = vi.fn()) {
      const { container } = renderWithProviders(
        <Calendar
          events={dragEvents}
          viewType="month"
          initialDate={start}
          onEventMove={onEventMove}
          onEventClick={onEventClick}
          height={600}
        />,
      );
      const chip = container.querySelector('[data-calendar-event="evt-1"]');
      const targetCell = container.querySelector('[data-calendar-day="2026-03-20"]');
      expect(chip).toBeTruthy();
      expect(targetCell).toBeTruthy();
      // happy-dom has no layout engine, so stub hit-testing to the target cell.
      (document as any).elementFromPoint = vi.fn(() => targetCell);
      return { chip: chip as Element, targetCell: targetCell as Element };
    }

    it('moves an event to another day via pointer drag', () => {
      const onEventMove = vi.fn();
      const onEventClick = vi.fn();
      const { chip } = renderDraggableCalendar(onEventMove, onEventClick);

      fireEvent.pointerDown(chip, { button: 0, clientX: 100, clientY: 100 });
      fireEvent.pointerMove(window, { clientX: 160, clientY: 160 });
      fireEvent.pointerUp(window, { clientX: 160, clientY: 160 });

      expect(onEventMove).toHaveBeenCalledTimes(1);
      const [movedEvent, range] = onEventMove.mock.calls[0];
      expect(movedEvent.id).toBe('evt-1');
      expect(range.start).toEqual(new Date(2026, 2, 20, 9, 0));
      expect(range.end).toEqual(new Date(2026, 2, 20, 9, 30));
      expect(onEventClick).not.toHaveBeenCalled();
    });

    it('does not fire onEventMove when movement stays under the drag threshold', () => {
      const onEventMove = vi.fn();
      const { chip } = renderDraggableCalendar(onEventMove);

      fireEvent.pointerDown(chip, { button: 0, clientX: 100, clientY: 100 });
      fireEvent.pointerMove(window, { clientX: 101, clientY: 101 });
      fireEvent.pointerUp(window, { clientX: 101, clientY: 101 });

      expect(onEventMove).not.toHaveBeenCalled();
    });

    it('still fires onEventClick for a plain click when drag is enabled', () => {
      const onEventMove = vi.fn();
      const onEventClick = vi.fn();
      const { chip } = renderDraggableCalendar(onEventMove, onEventClick);

      fireEvent.pointerDown(chip, { button: 0, clientX: 100, clientY: 100 });
      fireEvent.pointerUp(window, { clientX: 100, clientY: 100 });
      fireEvent.click(screen.getByText('Standup'));

      expect(onEventClick).toHaveBeenCalledTimes(1);
      expect(onEventClick.mock.calls[0][0].id).toBe('evt-1');
      expect(onEventMove).not.toHaveBeenCalled();
    });

    it('cancels an in-flight drag with Escape', () => {
      const onEventMove = vi.fn();
      const { chip } = renderDraggableCalendar(onEventMove);

      fireEvent.pointerDown(chip, { button: 0, clientX: 100, clientY: 100 });
      fireEvent.pointerMove(window, { clientX: 160, clientY: 160 });
      fireEvent.keyDown(window, { key: 'Escape' });
      fireEvent.pointerUp(window, { clientX: 160, clientY: 160 });

      expect(onEventMove).not.toHaveBeenCalled();
    });

    it('disables drag when enableEventDrag is false', () => {
      const onEventMove = vi.fn();
      const { container } = renderWithProviders(
        <Calendar
          events={dragEvents}
          viewType="month"
          initialDate={start}
          onEventMove={onEventMove}
          enableEventDrag={false}
          height={600}
        />,
      );
      const chip = container.querySelector('[data-calendar-event="evt-1"]') as Element;
      const targetCell = container.querySelector('[data-calendar-day="2026-03-20"]');
      (document as any).elementFromPoint = vi.fn(() => targetCell);

      fireEvent.pointerDown(chip, { button: 0, clientX: 100, clientY: 100 });
      fireEvent.pointerMove(window, { clientX: 160, clientY: 160 });
      fireEvent.pointerUp(window, { clientX: 160, clientY: 160 });

      expect(onEventMove).not.toHaveBeenCalled();
      (document as any).elementFromPoint = originalElementFromPoint;
    });
  });
});

// ---------------------------------------------------------------------------
// Test 7: Dashboard renders KPICard and ChartCard as Card components
// ---------------------------------------------------------------------------
describe('Dashboard', () => {
  it('renders KPI widgets from props', () => {
    renderWithProviders(
      <ViewExports.Dashboard
        title="Sales Overview"
        widgets={[
          {
            id: 'revenue',
            type: 'kpi',
            kpiConfig: {
              id: 'revenue',
              title: 'Revenue',
              value: 125000,
              format: 'currency',
              trend: 'up',
              trendValue: '+12%',
            },
          },
        ]}
      />,
    );

    expect(screen.getByText('Sales Overview')).toBeInTheDocument();
    expect(screen.getByText('Revenue')).toBeInTheDocument();
    expect(screen.getByText('$125,000')).toBeInTheDocument();
    expect(screen.getByText('+12%')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Test 7b: trend color encodes sentiment, never
// direction. resolveTrendColor is the one sentinel resolver: color comes
// from trend × goodDirection; undeclared sentiment renders neutral.
// ---------------------------------------------------------------------------
describe('KPICard trend sentiment', () => {
  const { resolveTrendColor } = ViewExports;
  const success = componentColors.semantic.success;
  const error = componentColors.semantic.error;
  // The neutral ink is the resolver's, handed in by the caller.
  const neutral = '$color11';

  it('renders neutral when goodDirection is undeclared — direction alone never picks a verdict color', () => {
    expect(resolveTrendColor('up', undefined, neutral)).toBe(neutral);
    expect(resolveTrendColor('down', undefined, neutral)).toBe(neutral);
  });

  it("renders neutral when goodDirection is 'none' (direction without sentiment)", () => {
    expect(resolveTrendColor('up', 'none', neutral)).toBe(neutral);
    expect(resolveTrendColor('down', 'none', neutral)).toBe(neutral);
  });

  it('colors by improvement when sentiment is declared (trend × goodDirection)', () => {
    // improving → success
    expect(resolveTrendColor('up', 'up', neutral)).toBe(success);
    expect(resolveTrendColor('down', 'down', neutral)).toBe(success);
    // worsening → error
    expect(resolveTrendColor('down', 'up', neutral)).toBe(error);
    expect(resolveTrendColor('up', 'down', neutral)).toBe(error);
  });

  it('renders neutral for a neutral or absent trend regardless of declaration', () => {
    expect(resolveTrendColor('neutral', 'up', neutral)).toBe(neutral);
    expect(resolveTrendColor('neutral', undefined, neutral)).toBe(neutral);
    expect(resolveTrendColor(undefined, 'down', neutral)).toBe(neutral);
  });

  it('KPICard passes the resolved sentiment color to the trend text', () => {
    // Declared down-good falling metric (an improvement) and an undeclared
    // one render through the same sentinel resolver — smoke the DOM wiring.
    renderWithProviders(
      <ViewExports.KPICard
        config={{
          id: 'overdue',
          title: 'Overdue Balance',
          value: 25470,
          trend: 'down',
          trendValue: '-8%',
          goodDirection: 'down',
        }}
      />,
    );
    expect(screen.getByText('↓')).toBeInTheDocument();
    expect(screen.getByText('-8%')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Test 7a: ReportBuilder honest async states
// ---------------------------------------------------------------------------
describe('ReportBuilder', () => {
  const reportColumns = [
    { fieldname: 'name', label: 'Name', fieldtype: 'Data', enabled: true },
    { fieldname: 'status', label: 'Status', fieldtype: 'Select', enabled: true },
  ];

  it('shows the table skeleton twin while loading with no rows', () => {
    renderWithProviders(<ViewExports.ReportBuilder columns={reportColumns} data={[]} isLoading />);

    expect(document.querySelector('[data-async-skeleton="table"]')).toBeTruthy();
    expect(screen.queryByText('No data to display')).toBeNull();
  });

  it('error wins over empty, hides the toolbar counts, and retry fires', () => {
    const onRetry = vi.fn();
    renderWithProviders(
      <ViewExports.ReportBuilder
        columns={reportColumns}
        data={[]}
        error="Report rows failed to load"
        onRetry={onRetry}
      />,
    );

    // Failed load must never masquerade as an empty report
    expect(screen.queryByText('No data to display')).toBeNull();
    expect(document.querySelector('[data-async-state="error"]')).toBeTruthy();
    expect(screen.getByText('Report rows failed to load')).toBeInTheDocument();
    // Toolbar column count hides with the toolbar
    expect(screen.queryByText(/2 \/ 2 columns/)).toBeNull();

    fireEvent.click(screen.getByText('Retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('distinguishes no-results (active filters) from true empty (Axiom 6)', () => {
    const { unmount } = renderWithProviders(
      <ViewExports.ReportBuilder columns={reportColumns} data={[]} hasActiveFilters />,
    );
    expect(screen.getByText('No results found')).toBeInTheDocument();
    expect(screen.queryByText('No data to display')).toBeNull();
    unmount();

    renderWithProviders(<ViewExports.ReportBuilder columns={reportColumns} data={[]} />);
    expect(screen.getByText('No data to display')).toBeInTheDocument();
    expect(screen.queryByText('No results found')).toBeNull();
  });

  function atoms(el: Element, prefixes: string[]): string[] {
    return String((el as HTMLElement).className || '')
      .split(' ')
      .filter((c) => prefixes.some((p) => c.startsWith(p)))
      .sort();
  }

  it('header and totals labels ride the fontWeight knob — never 500 or 600', () => {
    renderWithProviders(
      <ViewExports.ReportBuilder columns={reportColumns} data={[{ name: 'Alpha', status: 'Open' }]} />,
    );
    const header = screen.getByText('Name');
    const totals = screen.getByText('Totals');
    for (const node of [header, totals]) {
      const weight = atoms(node, ['_fow-']);
      expect(weight.length).toBeGreaterThan(0);
      expect(weight.join(' ')).not.toMatch(/500|600|weight-5|weight-6|fow-5|fow-6/);
    }
    const root = document.querySelector('[data-testid="report-builder"]') as HTMLElement;
    expect(root.getAttribute('data-size')).toBeTruthy();
    expect(root.getAttribute('data-density')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Test 7b: ChartCard default colors come from the canonical chart palette
// (single-series identity, categorical palette, tint
// re-anchor, explicit data colors pass through untouched).
// ---------------------------------------------------------------------------
describe('ChartCard palette', () => {
  const pieData = [
    { label: 'A', value: 4 },
    { label: 'B', value: 3 },
    { label: 'C', value: 2 },
    { label: 'D', value: 1 },
  ];

  function PaletteProbe({ into }: { into: { current?: ChartPalette } }) {
    into.current = useChartPalette();
    return null;
  }

  function pieSliceFills(): Array<string | null> {
    return Array.from(document.querySelectorAll('svg [data-mpo-chart-mark]')).map((p) => p.getAttribute('fill'));
  }

  function barFills(): Array<string | null> {
    return Array.from(document.querySelectorAll('svg [data-mpo-chart-bar]')).map((bar) => bar.getAttribute('fill'));
  }

  it('pie slices take the categorical palette from useChartPalette()', () => {
    const captured: { current?: ChartPalette } = {};
    renderWithProviders(
      <>
        <PaletteProbe into={captured} />
        <ViewExports.ChartCard config={{ id: 'p', title: 'Pie', type: 'pie', data: pieData }} />
      </>,
    );
    expect(captured.current).toBeDefined();
    const fills = pieSliceFills();
    expect(fills).toEqual(captured.current?.categorical.slice(0, pieData.length));
  });

  it('single-series bars all take the identity solid', () => {
    const captured: { current?: ChartPalette } = {};
    renderWithProviders(
      <>
        <PaletteProbe into={captured} />
        <ViewExports.ChartCard config={{ id: 'b', title: 'Bar', type: 'bar', data: pieData }} />
      </>,
    );
    const fills = barFills();
    expect(fills.length).toBe(pieData.length);
    for (const fill of fills) {
      expect(fill).toBe(captured.current?.single);
    }
  });

  it('re-anchors the palette identity under a tint sub-theme', () => {
    const captured: { current?: ChartPalette } = {};
    const base: { current?: ChartPalette } = {};
    renderWithProviders(
      <>
        <PaletteProbe into={base} />
        <Theme name={'red' as any}>
          <PaletteProbe into={captured} />
          <ViewExports.ChartCard config={{ id: 't', title: 'Bar', type: 'bar', data: pieData }} />
        </Theme>
      </>,
    );
    expect(captured.current).toBeDefined();
    expect(base.current).toBeDefined();
    // Tint identity is the re-ramped $color9, not the base accent.
    expect(captured.current?.single).not.toBe(base.current?.single);
    const fills = barFills();
    expect(fills.length).toBe(pieData.length);
    for (const fill of fills) {
      expect(fill).toBe(captured.current?.single);
    }
  });

  it('explicit data colors pass through untouched (VALUE IS DATA)', () => {
    renderWithProviders(
      <ViewExports.ChartCard
        config={{
          id: 'v',
          title: 'Pie',
          type: 'pie',
          data: [
            { label: 'custom', value: 5, color: '#123456' },
            { label: 'default', value: 5 },
          ],
        }}
      />,
    );
    const fills = pieSliceFills();
    expect(fills[0]).toBe('#123456');
    expect(fills[1]).not.toBe('#123456');
  });

  it('explicit config.colors list passes through untouched', () => {
    renderWithProviders(
      <ViewExports.ChartCard
        config={{
          id: 'cc',
          title: 'Bar',
          type: 'bar',
          data: pieData,
          colors: ['#0a0b0c'],
        }}
      />,
    );
    const fills = barFills();
    expect(fills.length).toBe(pieData.length);
    for (const fill of fills) {
      expect(fill).toBe('#0a0b0c');
    }
  });
});

// ---------------------------------------------------------------------------
// Barrel export validation
// ---------------------------------------------------------------------------
describe('Views barrel exports', () => {
  it('exports all view components', () => {
    expect(ViewExports).toHaveProperty('List');
    expect(ViewExports).toHaveProperty('Kanban');
    expect(ViewExports).toHaveProperty('Calendar');
    expect(ViewExports).toHaveProperty('computeEventMoveRange');
    expect(ViewExports).toHaveProperty('TreeView');
    expect(ViewExports).toHaveProperty('ImageGrid');
    expect(ViewExports).toHaveProperty('Dashboard');
    expect(ViewExports).toHaveProperty('ReportBuilder');
    expect(ViewExports).toHaveProperty('KPICard');
    expect(ViewExports).toHaveProperty('ChartCard');
    expect(ViewExports).toHaveProperty('calculateTrend');
    expect(ViewExports).toHaveProperty('calculatePercentageChange');
    expect(ViewExports).toHaveProperty('aggregateData');
  });

  // The barrel used to re-export a hand-written subset of ganttMath,
  // and the subset had drifted — `dateToX` was on it, `xToDate` was not, so a
  // consumer could map a date onto the axis but not a pointer back off it and
  // had to rewrite the inverse itself. Assert the whole module is reachable
  // rather than re-listing names, so the next addition to ganttMath cannot be
  // silently unreachable. Runtime only: `import * as` cannot see type-only
  // exports, so the interfaces are still covered by the typecheck.
  it('re-exports every ganttMath value export', () => {
    const missing = Object.keys(GanttMathExports).filter((name) => !(name in ViewExports));
    expect(missing).toEqual([]);
  });

  // Exercised off the BARREL rather than off ganttMath: the thing
  // that was broken is what a consumer can reach through the package, so the
  // pair has to be read the way a consumer reads it. `xToDate` floors to the
  // start of the day (its own doc comment), so the round trip lands on
  // startOfDay(date), not on the wall-clock instant — asserting that is what
  // makes the pair usable without a consumer re-deriving the flooring rule.
  it('converts both ways on one axis, straight off the barrel', () => {
    const { computeGanttRange, dateToX, startOfDay, xToDate } = ViewExports;
    // `today` pinned so the padded range does not move with the clock.
    const range = computeGanttRange(
      [{ start: new Date(2026, 0, 5), end: new Date(2026, 0, 20) }],
      'day',
      new Date(2026, 0, 10),
    );
    const pxPerDay = 24;
    const pointer = new Date(2026, 0, 12, 14, 30);

    const x = dateToX(pointer, range.start, pxPerDay);
    expect(xToDate(x, range.start, pxPerDay).getTime()).toBe(startOfDay(pointer).getTime());

    // And the direction a drag needs: a pointer anywhere inside a day maps to
    // that day, so a hit-test cannot land one day early on a 14:30 grab.
    const dayStart = dateToX(startOfDay(pointer), range.start, pxPerDay);
    expect(xToDate(dayStart, range.start, pxPerDay).getTime()).toBe(startOfDay(pointer).getTime());
  });
});
