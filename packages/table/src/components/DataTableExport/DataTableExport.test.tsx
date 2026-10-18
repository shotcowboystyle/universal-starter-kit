import { renderWithProviders } from '@repo/test-utils';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DataTable } from '../DataTable';

import { DataTableExport } from './index';
import type { ExportOptions } from './index';

// Test data type
interface TestItem {
  id: string;
  name: string;
  email: string;
  status: 'active' | 'inactive';
  createdAt: string;
}

// Test data
const mockData: TestItem[] = [
  {
    id: '1',
    name: 'John Doe',
    email: 'john@example.com',
    status: 'active',
    createdAt: '2024-01-15T10:00:00.000Z',
  },
  {
    id: '2',
    name: 'Jane Smith',
    email: 'jane@example.com',
    status: 'inactive',
    createdAt: '2024-01-16T10:00:00.000Z',
  },
];

// Test columns
const mockColumns = [
  {
    accessorKey: 'name',
    header: 'Name',
  },
  {
    accessorKey: 'email',
    header: 'Email',
  },
  {
    accessorKey: 'status',
    header: 'Status',
  },
  {
    accessorKey: 'createdAt',
    header: 'Created At',
  },
];

// Mock URL.createObjectURL and URL.revokeObjectURL
const mockCreateObjectURL = vi.fn<(obj: Blob) => string>(() => 'mock-url');
const mockRevokeObjectURL = vi.fn<(url: string) => void>();

// configurable: true is load-bearing — the "Blob URLs are unavailable" case
// below redefines createObjectURL, and defineProperty defaults configurable to
// false, which made that redefine throw "Cannot redefine property".
Object.defineProperty(window.URL, 'createObjectURL', {
  configurable: true,
  writable: true,
  value: mockCreateObjectURL,
});

Object.defineProperty(window.URL, 'revokeObjectURL', {
  configurable: true,
  writable: true,
  value: mockRevokeObjectURL,
});

// Mock document methods for download functionality
const mockClick = vi.fn<() => void>();
const mockAppendChild = vi.fn<(node: Node) => void>();
const mockRemoveChild = vi.fn<(node: Node) => void>();

// Store the original functions
// oxlint-disable-next-line typescript/no-deprecated -- bind() types against the last (deprecated string-options) overload; calls below pass only a tag name
const originalCreateElement = document.createElement.bind(document);
const originalAppendChild = document.body.appendChild.bind(document.body);
const originalRemoveChild = document.body.removeChild.bind(document.body);

// Mock createElement to return a mock anchor element for download tests
vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
  if (tagName === 'a') {
    const anchor = originalCreateElement(tagName);
    anchor.click = mockClick;
    return anchor;
  }
  return originalCreateElement(tagName);
});

// Spy on appendChild and removeChild without breaking them
vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
  mockAppendChild(node);
  return originalAppendChild(node);
});

vi.spyOn(document.body, 'removeChild').mockImplementation((node) => {
  mockRemoveChild(node);
  return originalRemoveChild(node);
});

describe(DataTableExport, () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders export buttons for enabled formats', () => {
    renderWithProviders(
      <DataTableExport
        data={mockData}
        columns={mockColumns}
      />,
    );

    expect(screen.getByText('CSV')).toBeInTheDocument();
    expect(screen.getByText('Excel')).toBeInTheDocument();
    expect(screen.getByText('Print')).toBeInTheDocument();
  });

  it('shows only first 3 enabled formats as quick buttons', () => {
    const customFormats = [
      {
        id: 'csv',
        label: 'CSV',
        icon: null,
        extension: 'csv',
        mimeType: 'text/csv',
        description: 'CSV',
        enabled: true,
      },
      {
        id: 'excel',
        label: 'Excel',
        icon: null,
        extension: 'xlsx',
        mimeType: 'application/vnd.ms-excel',
        description: 'Excel',
        enabled: true,
      },
      {
        id: 'pdf',
        label: 'PDF',
        icon: null,
        extension: 'pdf',
        mimeType: 'application/pdf',
        description: 'PDF',
        enabled: true,
      },
      {
        id: 'json',
        label: 'JSON',
        icon: null,
        extension: 'json',
        mimeType: 'application/json',
        description: 'JSON',
        enabled: true,
      },
      {
        id: 'xml',
        label: 'XML',
        icon: null,
        extension: 'xml',
        mimeType: 'application/xml',
        description: 'XML',
        enabled: true,
      },
    ];

    renderWithProviders(
      <DataTableExport
        data={mockData}
        columns={mockColumns}
        exportFormats={customFormats}
      />,
    );

    expect(screen.getByText('CSV')).toBeInTheDocument();
    expect(screen.getByText('Excel')).toBeInTheDocument();
    expect(screen.getByText('PDF')).toBeInTheDocument();
    expect(screen.queryByText('JSON')).not.toBeInTheDocument();
    expect(screen.queryByText('XML')).not.toBeInTheDocument();
  });

  it('calls onExport with correct options when export button is clicked', async () => {
    const mockOnExport = vi.fn<(options: ExportOptions) => Promise<void>>().mockResolvedValue();

    renderWithProviders(
      <DataTableExport
        data={mockData}
        columns={mockColumns}
        onExport={mockOnExport}
      />,
    );

    fireEvent.click(screen.getByText('CSV'));

    await waitFor(() => {
      expect(mockOnExport).toHaveBeenCalledWith({
        format: 'csv',
        includeHeaders: true,
        filename: 'export',
      });
    });
  });

  it('shows loading state when export is in progress', async () => {
    const { promise: pending, resolve: finishExport } = Promise.withResolvers<null>();
    const mockOnExport = vi.fn<(options: ExportOptions) => Promise<void>>(async () => {
      await pending;
    });

    renderWithProviders(
      <DataTableExport
        data={mockData}
        columns={mockColumns}
        onExport={mockOnExport}
      />,
    );

    const exportButton = screen.getByRole('button', { name: /Export as CSV/iu });
    try {
      fireEvent.click(exportButton);
      expect(screen.getByText('...')).toBeInTheDocument();
      expect(exportButton).toHaveAttribute('aria-disabled', 'true');
    } finally {
      await act(async () => {
        finishExport(null);
        await pending;
      });
    }
    expect(exportButton).toHaveTextContent('CSV');
    expect(exportButton).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('disables buttons when disabled prop is true', () => {
    renderWithProviders(
      <DataTableExport
        data={mockData}
        columns={mockColumns}
        disabled
      />,
    );

    const csvButton = screen.getByRole('button', { name: /CSV/iu });
    expect(csvButton).toHaveAttribute('aria-disabled', 'true');
  });

  it('handles export errors gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const mockOnExport = vi.fn<(options: ExportOptions) => Promise<void>>(async () => {
      throw new Error('Export failed');
    });

    renderWithProviders(
      <DataTableExport
        data={mockData}
        columns={mockColumns}
        onExport={mockOnExport}
      />,
    );

    fireEvent.click(screen.getByText('CSV'));

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('Export failed:', expect.any(Error));
    });

    consoleSpy.mockRestore();
  });

  it('opens export options popover when options button is clicked', async () => {
    renderWithProviders(
      <DataTableExport
        data={mockData}
        columns={mockColumns}
      />,
    );

    const optionsButton = screen.getByText('Options');
    fireEvent.click(optionsButton);

    await waitFor(() => {
      expect(screen.getByText('Export Options')).toBeInTheDocument();
    });
  });

  it('allows filename customization in options', async () => {
    renderWithProviders(
      <DataTableExport
        data={mockData}
        columns={mockColumns}
      />,
    );

    fireEvent.click(screen.getByText('Options'));

    await waitFor(() => {
      expect(screen.getByText('Export Options')).toBeInTheDocument();
    });

    const filenameInput = screen.getByPlaceholderText('Enter filename');
    fireEvent.change(filenameInput, { target: { value: 'custom-export' } });

    // The input should be updated
    expect(filenameInput).toHaveValue('custom-export');
  });

  it('toggles include headers checkbox', async () => {
    renderWithProviders(
      <DataTableExport
        data={mockData}
        columns={mockColumns}
      />,
    );

    fireEvent.click(screen.getByText('Options'));

    await waitFor(() => {
      expect(screen.getByText('Export Options')).toBeInTheDocument();
    });

    const checkbox = screen.getByText('Include headers');
    fireEvent.click(checkbox);
    // Checkbox behavior would be tested in integration tests
  });

  it('honors popover column deselection in the exported CSV', async () => {
    mockCreateObjectURL.mockClear();
    renderWithProviders(
      <DataTableExport
        data={mockData}
        columns={mockColumns}
      />,
    );

    fireEvent.click(screen.getByText('Options'));
    await waitFor(() => {
      expect(screen.getByText('Export Options')).toBeInTheDocument();
    });

    // Uncheck "Email" in the Select Columns list, then export via the quick
    // CSV button (first match — the popover format list also says "CSV") —
    // the deselected column must not reach the file.
    fireEvent.click(screen.getByText('Email'));
    fireEvent.click(screen.getAllByText('CSV')[0]);

    await waitFor(() => {
      expect(mockCreateObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    });
    const [blob] = mockCreateObjectURL.mock.calls.at(-1)!;
    const text = await blob.text();
    const lines = text.trim().split('\n');
    expect(lines[0]).toBe('Name,Status,Created At');
    expect(text).not.toContain('jane@example.com');
    // Data rows keep pace with the reduced column set (no ragged rows).
    expect(lines[1]).toBe('John Doe,active,2024-01-15T10:00:00.000Z');
  });

  it('filters disabled export formats', () => {
    const customFormats = [
      {
        id: 'csv',
        label: 'CSV',
        icon: null,
        extension: 'csv',
        mimeType: 'text/csv',
        description: 'CSV',
        enabled: true,
      },
      {
        id: 'excel',
        label: 'Excel',
        icon: null,
        extension: 'xlsx',
        mimeType: 'application/vnd.ms-excel',
        description: 'Excel',
        enabled: false,
      },
    ];

    renderWithProviders(
      <DataTableExport
        data={mockData}
        columns={mockColumns}
        exportFormats={customFormats}
      />,
    );

    expect(screen.getByText('CSV')).toBeInTheDocument();
    expect(screen.queryByText('Excel')).not.toBeInTheDocument();
  });

  it('uses custom filename prop', () => {
    renderWithProviders(
      <DataTableExport
        data={mockData}
        columns={mockColumns}
        filename="my-custom-data"
      />,
    );

    // This would be tested by checking the export options
    expect(screen.getByText('Options')).toBeInTheDocument();
  });

  it('handles print functionality', async () => {
    // Mock window.open with a real detached document (printTable builds DOM
    // nodes instead of writing an HTML string).
    const mockPrint = vi.fn<() => void>();
    const printDoc = document.implementation.createHTMLDocument('print');
    const mockPrintWindow = { document: printDoc, print: mockPrint };

    vi.spyOn(window, 'open').mockReturnValue(mockPrintWindow as any);

    renderWithProviders(
      <DataTableExport
        data={mockData}
        columns={mockColumns}
      />,
    );

    fireEvent.click(screen.getByText('Print'));

    await waitFor(() => {
      expect(window.open).toHaveBeenCalledWith('', '_blank');
      expect(mockPrint).toHaveBeenCalledWith();
    });

    // The printed table contains the data rows.
    expect(printDoc.body.textContent).toContain('John Doe');
    expect(printDoc.body.textContent).toContain('jane@example.com');

    vi.restoreAllMocks();
  });

  it('creates file download for CSV export', async () => {
    mockCreateObjectURL.mockClear();
    mockRevokeObjectURL.mockClear();

    renderWithProviders(
      <DataTableExport
        data={mockData}
        columns={mockColumns}
      />,
    );

    const csvButton = screen.getByText('CSV');
    fireEvent.click(csvButton);

    // URL.createObjectURL is set via Object.defineProperty (not vi.spyOn) so it
    // survives vi.restoreAllMocks() and reliably tracks blob-based downloads.
    await waitFor(
      () => {
        expect(mockCreateObjectURL).toHaveBeenCalledWith(expect.any(Blob));
      },
      { timeout: 3000 },
    );
  });

  it('exports raw values: 0 and false survive, JSX cell renderers never leak', async () => {
    mockCreateObjectURL.mockClear();

    const data = [{ name: 'Widget', stock: 0, active: false, status: 'active' }];
    const columns = [
      { accessorKey: 'name', header: 'Name' },
      { accessorKey: 'stock', header: 'Stock' },
      { accessorKey: 'active', header: 'Active' },
      {
        accessorKey: 'status',
        header: 'Status',
        // JSX-style renderer — used to export as "[object Object]"
        cell: () => ({ type: 'span', props: { children: 'Active' } }),
      },
    ];

    renderWithProviders(
      <DataTableExport
        data={data}
        columns={columns as any}
      />,
    );

    fireEvent.click(screen.getByText('CSV'));

    await waitFor(
      () => {
        expect(mockCreateObjectURL).toHaveBeenCalledWith(expect.any(Blob));
      },
      { timeout: 3000 },
    );

    const [[blob]] = mockCreateObjectURL.mock.calls;
    const text = await blob.text();
    expect(text).toContain('Widget,0,false,active');
    expect(text).not.toContain('[object Object]');
  });

  it('handles empty data array', () => {
    renderWithProviders(
      <DataTableExport
        data={[]}
        columns={mockColumns}
      />,
    );

    expect(screen.getByText('CSV')).toBeInTheDocument();
    expect(screen.getByText('Excel')).toBeInTheDocument();
  });

  it('handles columns without accessorKey', () => {
    const columnsWithoutAccessor = [{ header: 'Name' }, { header: 'Email' }];

    renderWithProviders(
      <DataTableExport
        data={mockData}
        columns={columnsWithoutAccessor as any}
      />,
    );

    expect(screen.getByText('CSV')).toBeInTheDocument();
  });

  it("quotes CSV values containing newlines so rows don't split", async () => {
    mockCreateObjectURL.mockClear();

    const data = [{ name: 'Line one\nLine two', note: 'with\r\nCRLF' }];
    const columns = [
      { accessorKey: 'name', header: 'Name' },
      { accessorKey: 'note', header: 'Note' },
    ];

    renderWithProviders(
      <DataTableExport
        data={data}
        columns={columns}
      />,
    );
    fireEvent.click(screen.getByText('CSV'));

    await waitFor(() => {
      expect(mockCreateObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    });
    const [blob] = mockCreateObjectURL.mock.calls.at(-1)!;
    const text = await blob.text();
    // Header + exactly one (quoted, multi-line) data record.
    expect(text).toContain('"Line one\nLine two"');
    expect(text).toContain('"with\r\nCRLF"');
  });

  it('escapes commas and quotes in CSV headers', async () => {
    mockCreateObjectURL.mockClear();

    const data = [{ a: 'x', b: 'y' }];
    const columns = [
      { accessorKey: 'a', header: 'Name, Legal' },
      { accessorKey: 'b', header: 'The "B" column' },
    ];

    renderWithProviders(
      <DataTableExport
        data={data}
        columns={columns}
      />,
    );
    fireEvent.click(screen.getByText('CSV'));

    await waitFor(() => {
      expect(mockCreateObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    });
    const [blob] = mockCreateObjectURL.mock.calls.at(-1)!;
    const text = await blob.text();
    const [headerLine] = text.split('\n');
    expect(headerLine).toBe('"Name, Legal","The ""B"" column"');
  });

  it('guards CSV formula injection on string values but leaves numbers intact', async () => {
    mockCreateObjectURL.mockClear();

    const data = [{ formula: '=SUM(A1:A9)', phone: '+15125551234', note: '@import', delta: -42 }];
    const columns = [
      { accessorKey: 'formula', header: 'Formula' },
      { accessorKey: 'phone', header: 'Phone' },
      { accessorKey: 'note', header: 'Note' },
      { accessorKey: 'delta', header: 'Delta' },
    ];

    renderWithProviders(
      <DataTableExport
        data={data}
        columns={columns}
      />,
    );
    fireEvent.click(screen.getByText('CSV'));

    await waitFor(() => {
      expect(mockCreateObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    });
    const [blob] = mockCreateObjectURL.mock.calls.at(-1)!;
    const text = await blob.text();
    const [, dataLine] = text.split('\n');
    // Strings that spreadsheet apps would evaluate get the OWASP `'` prefix;
    // genuine numbers (raw typeof number) are untouched.
    expect(dataLine).toBe("'=SUM(A1:A9),'+15125551234,'@import,-42");
  });

  it('exports the current view when composed in a DataTable (sort order + hidden columns)', async () => {
    mockCreateObjectURL.mockClear();

    const rows = [
      { id: '1', name: 'Charlie', email: 'c@x.com', status: 'active' },
      { id: '2', name: 'Alice', email: 'a@x.com', status: 'inactive' },
      { id: '3', name: 'Bob', email: 'b@x.com', status: 'active' },
    ];
    const cols = [
      { id: 'name', accessorKey: 'name', header: 'Name' },
      { id: 'email', accessorKey: 'email', header: 'Email' },
      { id: 'status', accessorKey: 'status', header: 'Status' },
    ];

    renderWithProviders(
      <DataTable
        data={rows}
        columns={cols as any}
        initialState={{
          sorting: [{ id: 'name', desc: false }],
          columnVisibility: { email: false },
        }}>
        <DataTable.Export />
      </DataTable>,
    );

    fireEvent.click(screen.getByText('CSV'));

    await waitFor(() => {
      expect(mockCreateObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    });
    const [blob] = mockCreateObjectURL.mock.calls.at(-1)!;
    const text = await blob.text();
    const lines = text.trim().split('\n');
    // Hidden column excluded, view (sorted) order preserved.
    expect(lines[0]).toBe('Name,Status');
    expect(lines[1]).toBe('Alice,inactive');
    expect(lines[2]).toBe('Bob,active');
    expect(lines[3]).toBe('Charlie,active');
  });

  it('exports only filtered rows when composed in a DataTable with an active filter', async () => {
    mockCreateObjectURL.mockClear();

    const rows = [
      { id: '1', name: 'Charlie', status: 'ready' },
      { id: '2', name: 'Alice', status: 'blocked' },
      { id: '3', name: 'Bob', status: 'ready' },
    ];
    const cols = [
      { id: 'name', accessorKey: 'name', header: 'Name' },
      { id: 'status', accessorKey: 'status', header: 'Status' },
    ];

    renderWithProviders(
      <DataTable
        data={rows}
        columns={cols as any}
        initialState={{ columnFilters: [{ id: 'status', value: 'ready' }] }}>
        <DataTable.Export />
      </DataTable>,
    );

    fireEvent.click(screen.getByText('CSV'));

    await waitFor(() => {
      expect(mockCreateObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    });
    const [blob] = mockCreateObjectURL.mock.calls.at(-1)!;
    const text = await blob.text();
    expect(text).toContain('Charlie');
    expect(text).toContain('Bob');
    expect(text).not.toContain('Alice');
  });

  it("escapes HTML in print output so cell values can't inject markup", async () => {
    const printDoc = document.implementation.createHTMLDocument('print');
    const mockPrintWindow = { document: printDoc, print: vi.fn<() => void>() };
    vi.spyOn(window, 'open').mockReturnValue(mockPrintWindow as any);

    const data = [{ name: '<img src=x onerror=alert(1)>', note: 'a & b < c' }];
    const columns = [
      { accessorKey: 'name', header: 'Name <script>' },
      { accessorKey: 'note', header: 'Note' },
    ];

    renderWithProviders(
      <DataTableExport
        data={data}
        columns={columns}
      />,
    );
    fireEvent.click(screen.getByText('Print'));

    await waitFor(() => {
      expect(mockPrintWindow.print).toHaveBeenCalledWith();
    });
    // No live elements were injected from the data...
    expect(printDoc.querySelector('img')).toBeNull();
    expect(printDoc.querySelector('script')).toBeNull();
    // ...but the literal text survives (serialized escaped).
    // oxlint-disable-next-line github/no-inner-html -- read-only: asserts the markup-like cell text is serialized escaped
    expect(printDoc.body.innerHTML).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(printDoc.body.textContent).toContain('a & b < c');
  });

  it('prevents multiple simultaneous exports', async () => {
    const { promise: pending, resolve: finishExport } = Promise.withResolvers<null>();
    const mockOnExport = vi.fn<(options: ExportOptions) => Promise<void>>(async () => {
      await pending;
    });

    renderWithProviders(
      <DataTableExport
        data={mockData}
        columns={mockColumns}
        onExport={mockOnExport}
      />,
    );

    // Click export twice quickly - button shows "..." when loading
    const exportButton = screen.getByRole('button', { name: /Export as CSV/iu });
    try {
      fireEvent.click(exportButton);
      fireEvent.click(exportButton);

      // Should only call once
      await waitFor(() => {
        expect(mockOnExport).toHaveBeenCalledOnce();
      });
    } finally {
      await act(async () => {
        finishExport(null);
        await pending;
      });
    }
    expect(exportButton).toHaveTextContent('CSV');
    expect(exportButton).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('surfaces an inline error when Blob URLs are unavailable', async () => {
    const previous = Object.getOwnPropertyDescriptor(window.URL, 'createObjectURL');
    Object.defineProperty(window.URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      // oxlint-disable-next-line sonarjs/no-undefined-assignment -- simulates a runtime where createObjectURL is absent
      value: undefined,
    });
    try {
      renderWithProviders(
        <DataTableExport
          data={mockData}
          columns={mockColumns}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: /Export as CSV/iu }));
      await waitFor(() => {
        expect(screen.getByRole('alert').textContent).toMatch(/not available on this platform/iu);
      });
      expect(mockCreateObjectURL).not.toHaveBeenCalled();
    } finally {
      if (previous) {
        Object.defineProperty(window.URL, 'createObjectURL', previous);
      } else {
        Object.defineProperty(window.URL, 'createObjectURL', {
          configurable: true,
          writable: true,
          value: mockCreateObjectURL,
        });
      }
    }
  });
});
