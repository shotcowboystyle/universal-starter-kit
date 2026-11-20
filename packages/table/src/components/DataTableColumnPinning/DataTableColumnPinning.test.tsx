import { renderWithProviders } from '@repo/test-utils';
import { createColumnHelper, functionalUpdate, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { DataTableColumnPinning, useColumnPinning } from './index';

const mockData = [
  {
    id: 1,
    name: 'John Doe',
    email: 'john@example.com',
    role: 'Admin',
    status: 'Active',
  },
  {
    id: 2,
    name: 'Jane Smith',
    email: 'jane@example.com',
    role: 'User',
    status: 'Active',
  },
  {
    id: 3,
    name: 'Bob Johnson',
    email: 'bob@example.com',
    role: 'User',
    status: 'Inactive',
  },
];

const columnHelper = createColumnHelper<(typeof mockData)[0]>();

const columns = [
  columnHelper.accessor('id', {
    header: 'ID',
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor('name', {
    header: 'Name',
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor('email', {
    header: 'Email',
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor('role', {
    header: 'Role',
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor('status', {
    header: 'Status',
    cell: (info) => info.getValue(),
  }),
];

const TestComponent = ({
  onPinChange,
  maxPinnedColumns = 3,
  allowPinning = true,
  disabled = false,
}: {
  onPinChange?: (columnId: string, position?: 'left' | 'right') => void;
  maxPinnedColumns?: number;
  allowPinning?: boolean;
  disabled?: boolean;
}) => {
  const [pinnedColumns, setPinnedColumns] = React.useState<{
    left: string[];
    right: string[];
  }>({
    left: [],
    right: [],
  });

  const [forceRender, setForceRender] = React.useState(0);

  // oxlint-disable-next-line react/incompatible-library -- test harness; TanStack's mutable table instance is the API under test
  const table = useReactTable({
    data: mockData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    state: {
      columnPinning: pinnedColumns,
    },
    onColumnPinningChange: (updater) => {
      const newState = functionalUpdate(updater, pinnedColumns);
      setPinnedColumns({
        left: newState.left ?? [],
        right: newState.right ?? [],
      });
      // Force re-render
      setForceRender((prev) => prev + 1);
    },
  });

  const pinning = DataTableColumnPinning({
    table,
    onPinChange,
    maxPinnedColumns,
    allowPinning,
    disabled,
  });

  // Force pinning to use current state
  React.useEffect(() => {
    // This effect will run whenever forceRender changes, ensuring the component re-renders
  }, [forceRender]);

  return (
    <div>
      {table.getAllColumns().map((column) => (
        <div
          key={column.id}
          data-testid={`column-${column.id}`}>
          <span>{column.id}</span>
          <pinning.PinButton
            columnId={column.id}
            position="left"
          />
          <span data-testid={`pinned-${column.id}`}>{pinning.isPinned(column.id) ? 'pinned' : 'not-pinned'}</span>
          <span data-testid={`position-${column.id}`}>{pinning.getPinPosition(column.id) ?? 'none'}</span>
        </div>
      ))}
      <div data-testid="pinned-left">{pinning.pinnedLeftColumns.length}</div>
      <div data-testid="pinned-right">{pinning.pinnedRightColumns.length}</div>
      <div data-testid="scrollable">{pinning.scrollableColumns.length}</div>
    </div>
  );
};

describe(DataTableColumnPinning, () => {
  it('should render without errors', () => {
    renderWithProviders(<TestComponent />);

    expect(screen.getByTestId('column-id')).toBeDefined();
    expect(screen.getByTestId('column-name')).toBeDefined();
  });

  it('should pin column to left', async () => {
    const onPinChange = vi.fn<(columnId: string, position?: 'left' | 'right') => void>();
    renderWithProviders(<TestComponent onPinChange={onPinChange} />);

    const nameColumn = screen.getByTestId('column-name');
    const pinButton = nameColumn.querySelector('[role="button"], button');

    expect(screen.getByTestId('pinned-name')).toHaveTextContent('not-pinned');
    expect(screen.getByTestId('position-name')).toHaveTextContent('none');

    fireEvent.click(pinButton!);

    await waitFor(() => {
      expect(screen.getByTestId('pinned-name')).toHaveTextContent('pinned');
      expect(screen.getByTestId('position-name')).toHaveTextContent('left');
      expect(onPinChange).toHaveBeenCalledWith('name', 'left');
    });
  });

  it('should track pin state changes', async () => {
    const onPinChange = vi.fn<(columnId: string, position?: 'left' | 'right') => void>();
    renderWithProviders(<TestComponent onPinChange={onPinChange} />);

    const nameColumn = screen.getByTestId('column-name');
    const pinButton = nameColumn.querySelector('[role="button"], button');

    expect(pinButton).toBeDefined();
    expect(screen.getByTestId('pinned-name')).toHaveTextContent('not-pinned');
  });

  it('should render with maxPinnedColumns prop', async () => {
    renderWithProviders(<TestComponent maxPinnedColumns={2} />);

    const idButton = screen.getByTestId('column-id').querySelector('[role="button"], button');
    const nameButton = screen.getByTestId('column-name').querySelector('[role="button"], button');

    expect(idButton).toBeDefined();
    expect(nameButton).toBeDefined();
    expect(screen.getByTestId('pinned-left')).toHaveTextContent('0');
  });

  it('should not show pin buttons when allowPinning is false', () => {
    renderWithProviders(<TestComponent allowPinning={false} />);

    const buttons = screen.queryAllByRole('button');
    expect(buttons).toHaveLength(0);
  });

  it('should correctly categorize columns', async () => {
    renderWithProviders(<TestComponent />);

    expect(screen.getByTestId('pinned-left')).toHaveTextContent('0');
    expect(screen.getByTestId('pinned-right')).toHaveTextContent('0');
    expect(screen.getByTestId('scrollable')).toHaveTextContent('5');

    // Pin a column
    const nameButton = screen.getByTestId('column-name').querySelector('[role="button"], button');
    fireEvent.click(nameButton!);

    await waitFor(() => {
      expect(screen.getByTestId('pinned-left')).toHaveTextContent('1');
      expect(screen.getByTestId('scrollable')).toHaveTextContent('4');
    });
  });
});

const floorFor = (columnId: string) =>
  screen.getByTestId(`column-${columnId}`).querySelector<HTMLElement>('[role="button"]')!;

// LC-54 amendment (2026-08-13) VERIFY arm: in hover/press the element
// carrying the press-target outset keeps `background-color: transparent` —
// painted feedback lives on the glyph-scale ring inside it. jsdom never
// applies :hover, but tamagui compiles state backgrounds into value-carrying
// atomic classes (`_bg-0hover-color4`), so the paint channel is asserted
// through the atoms each node carries — red on the old anatomy (the floor
// carried the hover AND press fills), green only when the floor is
// paint-free in every state.
describe('DataTableColumnPinning press-floor paint (LC-54 amendment)', () => {
  const paintedStateAtom = /_bg-0(?:hover|active)-(?!transparent)/u;

  it('floor node carries no hover/press background paint', () => {
    renderWithProviders(<TestComponent />);
    expect(floorFor('name').className).not.toMatch(paintedStateAtom);
  });

  it('positive control: the glyph-scale ring is where the hover fill lives', () => {
    renderWithProviders(<TestComponent />);
    const floor = floorFor('name');
    const ring = floor.firstElementChild as HTMLElement;
    expect(ring).not.toBeNull();
    // Proves the atom detector can see hover paint in this harness (the
    // no-paint assert above is meaningless without this arm), and pins the
    // fill to the ring: icon + one space token, never the 44px floor.
    expect(ring.className).toMatch(/_bg-0hover-color4/u);
    expect(ring.querySelector('svg')).not.toBeNull();
  });

  it('activation bubbles from a press on the glyph ring', async () => {
    const onPinChange = vi.fn<(columnId: string, position?: 'left' | 'right') => void>();
    renderWithProviders(<TestComponent onPinChange={onPinChange} />);
    // Real pointers land on the glyph-scale ring inside the grown target —
    // activation must bubble through it to the floor's press handler.
    const ring = floorFor('name').firstElementChild as HTMLElement;
    fireEvent.click(ring);
    await waitFor(() => {
      expect(onPinChange).toHaveBeenCalledWith('name', 'left');
    });
  });

  it('a pinned column keeps full rest opacity (honest active state)', async () => {
    // 0.7 compiles to the `_o-0--7` atom (dots escape as double dashes).
    renderWithProviders(<TestComponent />);
    expect(floorFor('name').className).toMatch(/_o-0--7/u);
    fireEvent.click(floorFor('name'));
    await waitFor(() => {
      expect(screen.getByTestId('pinned-name')).toHaveTextContent('pinned');
    });
    expect(floorFor('name').className).not.toMatch(/_o-0--7/u);
  });

  it('an inert trigger keeps its LC-40 dim and paints no ring hover', () => {
    renderWithProviders(<TestComponent disabled />);
    const floor = floorFor('name');
    expect(floor.getAttribute('aria-disabled')).toBe('true');
    expect(floor.className).toMatch(/_o-0--4/u);
    // Feedback on an inert control would promise an action it won't take —
    // the ring's hover fill is gated off with the press handler.
    const ring = floor.firstElementChild as HTMLElement;
    expect(ring.className).not.toMatch(paintedStateAtom);
  });
});

const HookTestComponent = () => {
  // oxlint-disable-next-line react/incompatible-library -- test harness; TanStack's mutable table instance is the API under test
  const table = useReactTable({
    data: mockData,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const { pinnedState, pinColumn, unpinColumn, resetPinning } = useColumnPinning(table, {
    maxPinnedColumns: 2,
    initialPinnedColumns: { left: ['id'], right: [] },
  });

  return (
    <div>
      <div data-testid="left-pins">{pinnedState.left.join(',')}</div>
      <div data-testid="right-pins">{pinnedState.right.join(',')}</div>
      <button
        type="button"
        onClick={() => {
          pinColumn('name', 'left');
        }}>
        Pin Name Left
      </button>
      <button
        type="button"
        onClick={() => {
          pinColumn('email', 'right');
        }}>
        Pin Email Right
      </button>
      <button
        type="button"
        onClick={() => {
          unpinColumn('id');
        }}>
        Unpin ID
      </button>
      <button
        type="button"
        onClick={() => {
          resetPinning();
        }}>
        Reset
      </button>
    </div>
  );
};

describe(useColumnPinning, () => {
  it('should initialize with provided pinned columns', () => {
    renderWithProviders(<HookTestComponent />);

    expect(screen.getByTestId('left-pins')).toHaveTextContent('id');
    expect(screen.getByTestId('right-pins')).toHaveTextContent('');
  });

  it('should pin column to specified position', async () => {
    renderWithProviders(<HookTestComponent />);

    const pinNameButton = screen.getByText('Pin Name Left');
    fireEvent.click(pinNameButton);

    await waitFor(() => {
      expect(screen.getByTestId('left-pins')).toHaveTextContent('id,name');
    });

    const pinEmailButton = screen.getByText('Pin Email Right');
    fireEvent.click(pinEmailButton);

    await waitFor(() => {
      expect(screen.getByTestId('right-pins')).toHaveTextContent('email');
    });
  });

  it('should unpin column', async () => {
    renderWithProviders(<HookTestComponent />);

    const unpinButton = screen.getByText('Unpin ID');
    fireEvent.click(unpinButton);

    await waitFor(() => {
      expect(screen.getByTestId('left-pins')).toHaveTextContent('');
    });
  });

  it('should reset all pinning', async () => {
    renderWithProviders(<HookTestComponent />);

    // Pin some columns first
    fireEvent.click(screen.getByText('Pin Name Left'));
    fireEvent.click(screen.getByText('Pin Email Right'));

    await waitFor(() => {
      expect(screen.getByTestId('left-pins')).not.toHaveTextContent('');
      expect(screen.getByTestId('right-pins')).not.toHaveTextContent('');
    });

    // Reset
    fireEvent.click(screen.getByText('Reset'));

    await waitFor(() => {
      expect(screen.getByTestId('left-pins')).toHaveTextContent('');
      expect(screen.getByTestId('right-pins')).toHaveTextContent('');
    });
  });

  it('should move column between positions', async () => {
    renderWithProviders(<HookTestComponent />);

    // Pin name to left
    fireEvent.click(screen.getByText('Pin Name Left'));

    await waitFor(() => {
      expect(screen.getByTestId('left-pins')).toHaveTextContent('id,name');
    });

    // Pin email to right
    fireEvent.click(screen.getByText('Pin Email Right'));

    await waitFor(() => {
      expect(screen.getByTestId('right-pins')).toHaveTextContent('email');
      expect(screen.getByTestId('left-pins')).toHaveTextContent('id,name');
    });
  });
});
