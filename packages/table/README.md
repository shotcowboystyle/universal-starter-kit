# @repo/table

> **Note:** `@repo/router` is optional - works with any React router or framework!

[![npm version](https://badge.fury.io/js/%40universal-starter-kit%2Ftable.svg)](https://badge.fury.io/js/%40universal-starter-kit%2Ftable)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

## 🎯 Key Features

- **🔍 Advanced Filtering** - query builder with 20+ operators
- **🔗 URL State Management** - Bookmarkable/shareable table states
- **🌍 Universal Compatibility** - Works with any React router or framework
- **📱 Cross-Platform** - Web, React Native, Tauri, GNOME, and more
- **⚡ Performance** - Server/client-side filtering and pagination
- **🎨 Beautiful UI** - Built with Tamagui for consistent design
- **♿ Accessible** - WCAG 2.1 AA compliant
- **🔧 Type-Safe** - Full TypeScript support
- **📦 Modular** - Tree-shakeable components

## 🚀 Quick Start

```bash
# For OneStack apps
pnpm add @repo/table @repo/router

# For other React apps
pnpm add @repo/table

# For React Router apps
pnpm add @repo/table react-router-dom

# For Next.js apps
pnpm add @repo/table next
```

```tsx
import { DataTable, createUrlStrategy } from '@repo/table';

function UserTable() {
  const data = [
    { id: 1, name: 'John', email: 'john@example.com', role: 'admin' },
    { id: 2, name: 'Jane', email: 'jane@example.com', role: 'user' },
  ];

  const columns = [
    { accessorKey: 'name', header: 'Name' },
    { accessorKey: 'email', header: 'Email' },
    { accessorKey: 'role', header: 'Role' },
  ];

  return (
    <DataTable
      data={data}
      columns={columns}
      syncWithUrl={true} // Enable URL state management
      enableFiltering={true}
      enableSorting={true}
      enablePagination={true}
      // urlStrategy: optional - defaults to OneStack, or use createUrlStrategy for other routers
    />
  );
}
```

## 📦 Package Boundaries

| Package           | Responsibility                                                                                                                                                                           |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@repo/table`     | Framework-agnostic table: display, filter, sort, paginate, virtualize, resize, pin, expand, keyboard nav. No Frappe or API assumptions.                                                  |
| `@repo/frappe-ui` | Frappe integration: FrappeTable wraps DataTable, fetches from Frappe, maps to DataTable props. Uses `manualFiltering`, `manualPagination`, `manualSorting` when `serverSide` is enabled. |

**Dependency direction**: frappe-ui → table. Table does not depend on frappe-ui or frappe.

---

## 🌍 Cross-Platform Compatibility

Works with **any React framework** and **all platforms**:

| Framework/Router       | URL Strategy                      | Status          |
| ---------------------- | --------------------------------- | --------------- |
| **OneStack**           | Automatic (default)               | ✅ Full Support |
| **React Router**       | `createUrlStrategy.reactRouter()` | ✅ Full Support |
| **Next.js App Router** | `createUrlStrategy.nextJs()`      | ✅ Full Support |
| **React Native**       | `syncWithUrl={false}`             | ✅ Full Support |
| **Tauri**              | `createUrlStrategy.universal()`   | ✅ Full Support |
| **GNOME (GTK/GJS)**    | `syncWithUrl={false}`             | ✅ Full Support |
| **Vanilla React**      | `createUrlStrategy.universal()`   | ✅ Full Support |
| **Any Router**         | `createUrlStrategy.custom()`      | ✅ Full Support |

### Semantic Table Markup

On web, tables render **real semantic elements** — `<table>`, `<thead>`, `<tbody>`,
`<tfoot>`, `<tr>`, `<th scope="col">`, `<td>`, `<caption>` — with explicit ARIA
table roles kept on them, so the grid semantics survive even where the display
mode is overridden (DataTable's flex grid). User-agent styles are neutralized
(border spacing, bold/centered headers), so the visual output is unchanged.
Virtualized DataTable rows are the one deliberate exception: absolutely
positioned rows render as a roles-based `div` grid bridged behind
presentation-role elements — valid HTML, clean accessibility tree. Native is
unaffected (React Native views as before). `SimpleTable`'s per-column `align`
now works in both display modes (alignment is applied as `textAlign` on the
cell text).

### React Router Integration

```tsx
import { useSearchParams } from 'react-router-dom';
import { DataTable, createUrlStrategy } from '@repo/table';

function MyTable() {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlStrategy = createUrlStrategy.reactRouter(() => [searchParams, setSearchParams], 500);

  return (
    <DataTable
      data={data}
      columns={columns}
      syncWithUrl={true}
      urlStrategy={urlStrategy}
    />
  );
}
```

### Next.js App Router Integration

```tsx
import { useSearchParams, useRouter } from 'next/navigation';
import { DataTable, createUrlStrategy } from '@repo/table';

function MyTable() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const urlStrategy = createUrlStrategy.nextJs(
    () => searchParams,
    () => router,
    500,
  );

  return (
    <DataTable
      data={data}
      columns={columns}
      syncWithUrl={true}
      urlStrategy={urlStrategy}
    />
  );
}
```

### Universal Strategy (Works Everywhere)

```tsx
import { DataTable, createUrlStrategy } from '@repo/table';

function MyTable() {
  const urlStrategy = createUrlStrategy.universal(500);

  return (
    <DataTable
      data={data}
      columns={columns}
      syncWithUrl={true}
      urlStrategy={urlStrategy}
    />
  );
}
```

## 📊 Advanced Filtering

### Text Filters

- `contains` - Partial text matching
- `doesNotContain` - Exclusion search
- `startsWith` / `endsWith` - Prefix/suffix matching
- `is` / `isNot` - Exact matching
- `isEmpty` / `isNotEmpty` - Null/empty checks

### Number Filters

- `is` / `isNot` - Exact matching
- `isLessThan` / `isGreaterThan` - Comparison operators
- `isBetween` / `isNotBetween` - Range filtering

### Date Filters

- All number operators plus date-specific comparisons
- `isBefore` / `isAfter` - Date comparisons
- `isOnOrBefore` / `isOnOrAfter` - Inclusive date ranges

### Select Filters (with faceted counts)

- `isAnyOf` / `isNoneOf` - Multi-select filtering
- Live counts showing how many items match each option
- Like Amazon/Etsy filter experience

### Filter Panel Interaction Contract

Filter panels compose — they never auto-dismiss on pick:

- Picking a filter value (a date preset, a faceted checkbox, the builder's
  "Add Filter") applies it **immediately** and the panel **stays open**, so multiple
  filters compose in one visit.
- Panels dismiss only on explicit dismissal intent: outside click, Escape, the trigger
  toggle, or an explicit close/done affordance (e.g. the column header filter's Apply
  button, which commits its draft and closes).
- Single-choice pickers (e.g. the saved-filter dropdown) are menu-class and commit on
  pick.

This is rule LC-21 in the living rulebook (`docs/theme-propagation-spec.md` in the
[universal-starter-kit repo](https://github.com/shotcowboystyle/universal-starter-kit/mpo)).

## 📊 Data Export

Export table data in multiple formats with advanced customization options:

```tsx
import { DataTable, DataTableExport } from '@repo/table';

function MyTable() {
  const columns = [
    { accessorKey: 'name', header: 'Name' },
    { accessorKey: 'email', header: 'Email' },
    { accessorKey: 'price', header: 'Price', cell: (info) => `$${info.getValue()}` },
  ];

  // Custom export handler (optional)
  const handleExport = async (options) => {
    // Call your API or use libraries like xlsx, jsPDF
    console.log('Exporting:', options.format, options.filename);
  };

  return (
    <DataTable
      data={products}
      columns={columns}
      renderToolbar={(props) => (
        <DataTableToolbar
          {...props}
          customActions={
            <DataTableExport
              data={products}
              columns={columns}
              filename="products-export"
              onExport={handleExport}
            />
          }
        />
      )}
    />
  );
}
```

### Export Features

- ✅ **Multiple Formats:** CSV, JSON, Excel, PDF, Print
- ✅ **Column Selection:** Choose which columns to export
- ✅ **Custom Filename:** Specify export filename
- ✅ **Header Control:** Include/exclude column headers
- ✅ **Server Integration:** Custom export handlers for large datasets
- ✅ **Rich Content:** Exports cell renderer content, not raw data

## 🔍 Full-Text Search with Highlighting

Powerful search functionality that searches across all columns with real-time highlighting:

```tsx
import { DataTable, DataTableSearch } from '@repo/table';

function MyTable() {
  const [filteredData, setFilteredData] = useState(data);
  const [searchOptions, setSearchOptions] = useState(null);

  // Columns with highlighting
  const columns = [
    {
      accessorKey: 'name',
      header: 'Name',
      cell: (info) => {
        const value = info.getValue();
        return searchOptions?.highlightResults && searchOptions.searchTerm
          ? highlightTextInCell(value, searchOptions)
          : value;
      },
    },
    // ... other columns with highlighting
  ];

  const handleSearchResults = (results, options) => {
    setFilteredData(results);
    setSearchOptions(options);
  };

  return (
    <DataTable
      data={filteredData}
      columns={columns}
      renderToolbar={(props) => (
        <DataTableToolbar
          {...props}
          customActions={
            <DataTableSearch
              data={data}
              columns={columns}
              onSearchResults={handleSearchResults}
              placeholder="Search across all columns..."
              showAdvancedOptions={true}
            />
          }
        />
      )}
    />
  );
}
```

### Search Features

- ✅ **Multi-column search:** Search across all text fields simultaneously
- ✅ **Real-time highlighting:** Search terms highlighted in results
- ✅ **Advanced options:** Case sensitivity, whole word, regex support
- ✅ **Column selection:** Choose which columns to search in
- ✅ **Debounced search:** Optimized performance for large datasets
- ✅ **Flexible API:** Component-based or hook-based usage

## 📅 Advanced Date Filtering

Powerful date filtering with presets, ranges, and calendar integration:

```tsx
import { DataTableDateFilter, type DateFilterValue } from '@repo/table';

function MyTable() {
  const [dateFilter, setDateFilter] = useState<DateFilterValue>();

  return (
    <DataTableDateFilter
      value={dateFilter}
      onChange={setDateFilter}
      placeholder="Filter by date..."
      showPresets={true}
      customPresets={[
        {
          id: 'lastWeekOrders',
          label: 'Ordered Last Week',
          operator: 'isLastWeek',
          icon: <CalendarIcon />,
        },
      ]}
    />
  );
}
```

### Date Filter Features

- ✅ **Quick Presets:** Today, Yesterday, This Week, Last 7/30 Days, etc.
- ✅ **Relative Dates:** This Month, Last Month, This Year, etc.
- ✅ **Custom Ranges:** Select start and end dates manually
- ✅ **Comparison Operators:** Is, Before, After, Between, etc.
- ✅ **Empty Handling:** Filter for records with/without dates
- ✅ **Multiple Filters:** Combine different date field filters
- ✅ **Calendar Integration:** Native HTML5 date inputs

## 📊 Grouping & Aggregation

Powerful data analysis with hierarchical grouping and calculated aggregations:

```tsx
import { DataTableGrouping, DataTableGroupingConfig } from '@repo/table';

function SalesReport() {
  const [groupingConfig, setGroupingConfig] = useState({
    columns: ['region', 'category'], // Multi-level grouping
    aggregations: [
      {
        column: 'revenue',
        function: 'sum',
        label: 'Total Revenue',
      },
      {
        column: 'quantity',
        function: 'count',
        label: 'Order Count',
      },
      {
        column: 'revenue',
        function: 'avg',
        label: 'Average Order',
      },
    ],
  });

  return (
    <DataTableGrouping
      data={salesData}
      columns={columns}
      groupBy={groupingConfig.columns}
      aggregations={groupingConfig.aggregations}
      showAggregations={true}
      renderGroupHeader={(group, level) => (
        <div
          style={{
            backgroundColor: level === 0 ? '#e3f2fd' : '#f3e5f5',
            padding: '12px',
            borderLeft: `4px solid ${level === 0 ? '#2196f3' : '#9c27b0'}`,
          }}>
          <h3>
            {group.value} ({group.count} items)
          </h3>
          <div>Total Revenue: ${group.aggregations.revenue?.sum?.toLocaleString()}</div>
        </div>
      )}
    />
  );
}
```

### Grouping Features

- ✅ **Multi-level grouping** - Group by multiple columns hierarchically
- ✅ **Dynamic aggregations** - Sum, count, average, min, max calculations
- ✅ **Custom aggregation functions** - Define your own calculations
- ✅ **Expandable/collapsible groups** - Show/hide group details
- ✅ **Group state persistence** - Remember which groups are expanded
- ✅ **Performance optimized** - Efficient grouping algorithms
- ✅ **Custom group headers** - Flexible rendering and styling

### Aggregation Functions

- ✅ **Count** - Number of items in group
- ✅ **Sum** - Total of numeric values
- ✅ **Average** - Mean of numeric values
- ✅ **Min/Max** - Smallest/largest values
- ✅ **Custom** - User-defined aggregation functions

### Use Cases

- **Sales Reports** - Group by region/product, show totals
- **Financial Data** - Group by account type, calculate balances
- **Employee Management** - Group by department, show headcount
- **Time Tracking** - Group by project, show total hours
- **Product Analytics** - Group by category, show performance metrics

### Production Setup

For full Excel and PDF support in production:

```bash
npm install xlsx jsPDF html2canvas
```

## ☑️ Row Selection & Bulk Actions

Complete row selection and bulk operations system:

```tsx
import { useRowSelection, DataTableBulkActions, createBulkActions } from '@repo/table';

function MyTable() {
  // Row selection hook
  const rowSelection = useRowSelection({
    data: users,
    selectionKey: 'id',
    onSelectionChange: (selected) => console.log(`${selected.length} items selected`),
  });

  // Define bulk actions
  const bulkActions = createBulkActions([
    {
      id: 'send-email',
      label: 'Send Email',
      icon: <MailIcon />,
      onExecute: async (selectedItems, clearSelection) => {
        await sendBulkEmail(selectedItems.map((u) => u.email));
        clearSelection();
      },
    },
    {
      id: 'export',
      label: 'Export CSV',
      icon: <DownloadIcon />,
      onExecute: async (selectedItems) => {
        const csv = convertToCSV(selectedItems);
        downloadCSV(csv, 'selected-users.csv');
      },
    },
  ]);

  // Add selection column to table
  const columns = [
    {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={rowSelection.isAllSelected}
          indeterminate={rowSelection.isIndeterminate}
          onCheckedChange={rowSelection.toggleAll}
          aria-label="Select all rows"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={rowSelection.isSelected(row.original)}
          onCheckedChange={() => rowSelection.toggleItem(row.original)}
          aria-label={`Select ${row.original.name}`}
        />
      ),
      enableSorting: false,
      size: 50,
    },
    // ... other columns
  ];

  return (
    <>
      {/* Bulk actions bar - appears when items are selected */}
      <DataTableBulkActions
        selectedItems={rowSelection.selectedItems}
        onClearSelection={rowSelection.clearSelection}
        actions={bulkActions}
        maxVisibleActions={3}
        showSelectionCount={true}
      />

      <DataTable
        data={users}
        columns={columns}
        enableSorting={true}
        enableFiltering={true}
        enablePagination={true}
      />
    </>
  );
}
```

### Bulk Action Features

- ✅ **Confirmation dialogs** for destructive actions
- ✅ **Loading states** during execution
- ✅ **Overflow menus** for many actions
- ✅ **Custom actions** with full flexibility
- ✅ **Server integration** for bulk operations
- ✅ **CSV export** built-in
- ✅ **Selection summary** and statistics

### Row Selection Features

- ✅ **Individual row selection** with checkboxes
- ✅ **Select all / clear all** functionality
- ✅ **Indeterminate states** for partial selection
- ✅ **Keyboard navigation** support
- ✅ **Accessibility compliant** with proper ARIA labels
- ✅ **Selection persistence** across pagination

## 🎛️ Forms Integration

Seamlessly integrate with `@repo/forms` for rich filter inputs:

```tsx
import { DataTable, DataTableFilters } from '@repo/table';
import { TextField, SelectField, DatePickerField } from '@repo/forms';

function MyTable() {
  return (
    <DataTable
      data={users}
      columns={columns}
      renderFilters={(props) => (
        <DataTableFilters
          {...props}
          availableColumns={[
            {
              id: 'name',
              label: 'Name',
              type: 'text',
              // Custom form component
              renderInput: (props) => (
                <TextField
                  {...props}
                  label="Search by name"
                  placeholder="Enter name..."
                />
              ),
            },
            {
              id: 'department',
              label: 'Department',
              type: 'select',
              options: [
                { label: 'Engineering', value: 'eng', count: 25 },
                { label: 'Marketing', value: 'mkt', count: 12 },
              ],
              // Custom form component
              renderInput: (props) => (
                <SelectField
                  {...props}
                  label="Department"
                  placeholder="Select department..."
                />
              ),
            },
          ]}
        />
      )}
    />
  );
}
```

### Form Validation Integration

```tsx
import { useForm } from '@repo/forms';

function AdvancedFilters() {
  const form = useForm({
    defaultValues: {
      nameFilter: '',
      salaryRange: { min: '', max: '' },
      joinDate: null,
    },
    onSubmit: ({ value }) => {
      // Convert form values to table filters
      const filters = createTableFiltersFromForm(value);
      tableActions.setFilters(filters);
    },
  });

  return (
    <Form {...form}>
      <TextField
        name="nameFilter"
        label="Employee Name"
        placeholder="Search by name..."
      />

      <XStack gap="$4">
        <TextField
          name="salaryRange.min"
          label="Min Salary"
          placeholder="50000"
          keyboardType="numeric"
        />
        <TextField
          name="salaryRange.max"
          label="Max Salary"
          placeholder="150000"
          keyboardType="numeric"
        />
      </XStack>

      <DatePickerField
        name="joinDate"
        label="Joined After"
      />

      <SubmitButton>Apply Filters</SubmitButton>
    </Form>
  );
}
```

## 📄 Pagination Strategies

### Pagination Modes

`paginationMode` selects the presentation (default `"pages"`):

- **`"pages"`** — footer pager built on the catalog `Pagination` component from
  `@repo/ui` (`variant="numbered"`: windowed ellipsis, first/last,
  `aria-current="page"`) — one pagination idiom across the system. `DataTablePagination`
  adds the table-specific chrome around it: rows-per-page selector, go-to-page jump, and
  the item-range summary.
- **`"infinite"`** — appends the next page as the user nears the end of the list,
  pre-loading page N+1 in the background so appends resolve instantly. The footer pager
  is suppressed; a tail status line (`role="status"`, `aria-live="polite"`) reads
  "Showing X of Y rows" while more exist and an honest end state when exhausted.

### Infinite Mode

Client mode (all rows in memory) reveals rows in page-size chunks as the user scrolls:

```tsx
<DataTable
  data={allRows}
  columns={columns}
  paginationMode="infinite"
/>
```

Server/async mode supplies a `loadPage` loader. The table owns a small page cache and
requests page N+1 the moment page N is appended, so the append at the scroll tail
resolves from cache with zero wait. `loadPage` must be side-effect-free per query — the
table may call it ahead of time (prefetch) and cache the result:

```tsx
import { DataTable, type DataTablePageLoader } from '@repo/table';

const loadPage: DataTablePageLoader<User> = async (query) => {
  // query: { pageIndex, pageSize, sorting, filters, columnFilters, globalFilter }
  const response = await api.getUsers(query);
  // totalCount (optional) enables the exact end-of-data state
  return { rows: response.data, totalCount: response.totalCount };
};

<DataTable
  columns={columns}
  paginationMode="infinite"
  loadPage={loadPage}
/>;
```

With `loadPage` set, rows are treated as pre-filtered/sorted server-side (manual
filtering/sorting/pagination are forced on). Infinite mode works with
`enableVirtualization` (the tail renders an extra skeleton row and extends the virtual
scroll range) and with the non-virtualized grid and card layouts (an
IntersectionObserver sentinel below the content triggers the append).

**Reset semantics:** any change to sorting, filters, column filters, global filter, or
page size drops the page cache and all in-flight responses, restarts at page 0, and
re-prefetches page 1. Failed page loads are evicted from the cache so the next
load-more retries instead of caching the rejection.

Infinite-mode state is exposed as `computed.infinite` (`visibleRowCount`, `loadedPages`,
`totalCount`, `exhausted`, `isInitialLoading`, `isAppending`, `loadMore()`) through
`useDataTable` / `DataTableStateContext`. The accumulation + prefetch engine is also
exported standalone as `useInfiniteRows`.

### Offset-Based Pagination (Traditional)

```tsx
function OffsetPaginationTable() {
  const [pageData, setPageData] = useState([]);
  const [totalCount, setTotalCount] = useState(0);

  return (
    <DataTable
      data={pageData}
      columns={columns}
      manualPagination={true}
      rowCount={totalCount}
      onStateChange={async (state) => {
        // Server-side pagination
        const response = await api.getUsers({
          page: state.pagination.pageIndex + 1,
          pageSize: state.pagination.pageSize,
          filters: state.filters,
          sorting: state.sorting,
        });

        setPageData(response.data);
        setTotalCount(response.totalCount);
      }}
    />
  );
}
```

### Cursor-Based Pagination (Modern)

```tsx
function CursorPaginationTable() {
  const [data, setData] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [previousCursor, setPreviousCursor] = useState(null);

  const loadPage = async (cursor, direction = 'forward') => {
    const response = await api.getUsers({
      cursor,
      direction,
      limit: 20,
      filters: activeFilters,
    });

    setData(response.data);
    setNextCursor(response.nextCursor);
    setPreviousCursor(response.previousCursor);
  };

  return (
    <YStack gap="$4">
      <XStack gap="$2">
        <Button
          disabled={!previousCursor}
          onPress={() => loadPage(previousCursor, 'backward')}>
          Previous
        </Button>

        <Button
          disabled={!nextCursor}
          onPress={() => loadPage(nextCursor, 'forward')}>
          Next
        </Button>
      </XStack>

      <DataTable
        data={data}
        columns={columns}
        manualPagination={true}
        enablePagination={false} // Disable built-in pagination
      />
    </YStack>
  );
}
```

### Infinite Scroll Pagination

Use the built-in infinite mode (see [Infinite Mode](#infinite-mode) above) instead of
hand-rolling a load-more button — `paginationMode="infinite"` with a `loadPage` loader
gives you prefetch-ahead, bounded tail skeletons, and an honest end state for free.

## 🔄 Server-Side Operations

### Manual Mode Configuration

```tsx
<DataTable
  data={serverData}
  columns={columns}
  // Manual modes for server-side operations
  manualFiltering={true} // Filters applied server-side
  manualPagination={true} // Pagination handled server-side
  manualSorting={true} // Sorting handled server-side
  // Server callbacks
  onStateChange={(state) => {
    // Send all state to server
    fetchData({
      filters: state.filters,
      pagination: state.pagination,
      sorting: state.sorting,
      globalFilter: state.globalFilter,
    });
  }}
  // Provide metadata for UI
  rowCount={totalServerCount}
  pageCount={totalServerPages}
/>
```

### Real-Time Updates

```tsx
function RealTimeTable() {
  const [data, setData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const subscription = api.subscribeToUpdates((update) => {
      // Handle real-time updates
      setData((prev) => updateData(prev, update));
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleFilterChange = async (filters) => {
    setIsLoading(true);
    const filteredData = await api.getFilteredData(filters);
    setData(filteredData);
    setIsLoading(false);
  };

  return (
    <DataTable
      data={data}
      columns={columns}
      onStateChange={(state) => {
        if (state.filters !== lastFilters) {
          handleFilterChange(state.filters);
        }
      }}
      renderToolbar={(props) => (
        <DataTableToolbar
          {...props}
          customActions={isLoading && <Text>Updating...</Text>}
        />
      )}
    />
  );
}
```

```tsx
const availableColumns = [
  {
    id: 'role',
    label: 'Role',
    type: 'select',
    options: [
      { label: 'Admin', value: 'admin', count: 5 },
      { label: 'User', value: 'user', count: 23 },
      { label: 'Guest', value: 'guest', count: 12 },
    ],
  },
]

<DataTableFilters
  availableColumns={availableColumns}
  onAddFilter={handleAddFilter}
/>
```

## 🔗 URL State Management

```tsx
// Web: URL updates automatically
// /users?page=2&pageSize=50&filters=name:contains:john&sort=name:asc

// React Native / GNOME: State persists in memory
// Tauri: State syncs with IPC if needed

<DataTable
  syncWithUrl={true} // Works on all platforms!
  urlDebounceMs={300}
/>
```

### URL State Features

- **📱 Cross-Platform** - Same API everywhere
- **🔄 Auto-Sync** - URL updates as you filter/sort
- **📋 Shareable** - Copy URL to share exact table state
- **🔙 Browser History** - Back/forward buttons work
- **⚡ Fast** - Debounced updates prevent spam

## 🎛️ View Management

Save and restore filter combinations:

```tsx
const [views, setViews] = useState([])

<DataTable
  enableViews={true}
  views={views}
  onSaveView={(name) => {
    // Save current filters, sorting, pagination as a view
  }}
  onLoadView={(viewId) => {
    // Load view and apply to table
  }}
/>
```

## 🔄 Migration Notes

- **DataTableVirtual** remains exported for headless use cases. **DataTable with `enableVirtualization`** is the preferred path for full DataTable features (toolbar, filters, pagination) plus virtualization.
- **DataTableColumnPinning** remains exported; DataTable integrates it internally when `enableColumnPinning` is true. Manual composition is still supported.

## 📊 Server-Side Support

Perfect for large datasets:

```tsx
function ServerTable({ data, totalCount }) {
  return (
    <DataTable
      data={data} // Current page data
      manualFiltering={true} // We'll handle filtering server-side
      manualPagination={true} // We'll handle pagination server-side
      manualSorting={true} // We'll handle sorting server-side
      rowCount={totalCount} // Total number of rows
      onStateChange={(state) => {
        // Send filters, pagination, sorting to server
        fetchData(state.filters, state.pagination, state.sorting);
      }}
    />
  );
}
```

## 🎨 Customization

### Column widths

`DataTableColumn.width`, `minWidth` and `maxWidth` map to TanStack's `size`,
`minSize` and `maxSize` before table defaults are applied. Each canonical property
wins independently when supplied. Aliases accept finite nonnegative pixels,
including fractions; invalid aliases are ignored. A zero width still respects
the minimum, so it doesn't hide a column.

```tsx
const columns: DataTableColumn<Row>[] = [
  { accessorKey: 'rank', header: 'Rank', width: 48 },
  { accessorKey: 'name', header: 'Name', width: 320, minWidth: 200, maxWidth: 400 },
  { accessorKey: 'score', header: 'Score', width: 80 },
];

<DataTable
  data={rows}
  columns={columns}
  layout="table"
  columnLayout="scroll"
/>;
```

| Column layout                       | Sizing behavior                                                                                                                                      |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `equal` (default), without resizing | Unpinned cells share available width and ignore declared sizes. A development warning names `columnLayout` when widths are supplied.                 |
| `equal` with resizing               | Resolved sizes set fixed cell widths.                                                                                                                |
| `scroll`                            | Header, body and footer use resolved widths, including widths below 80px. Web tables scroll horizontally when their total exceeds the container.     |
| `auto`                              | Keeps the existing table-layout algorithm on web. Resolved sizes are inputs, not a promise of measured content widths or last-column-only expansion. |

Pinned cells keep their resolved size in every mode so sticky offsets match the
boxes. A column with no sizing properties defaults to 150px in sized modes.
Fixed scroll columns can leave unused space when their total is narrower than
the container. Cards and list presentations keep their existing layout.

Sizing state from resizing or a loaded view overrides the initial size, subject
to the resolved min/max constraints. Resetting sizing reveals the declaration
again. Definitions aren't mutated, and grouped leaf columns are normalized
independently; a group width isn't distributed among its children.

This activates formerly ignored aliases in sized layouts. Review tables that
supplied them alongside canonical properties, especially mixed bounds such as
`size: 180, maxWidth: 140`, which resolves to 140 unless `maxSize` is also supplied.

Saved views still use `ColumnView.width`; their schema hasn't changed. Loading a
prepared view applies its sizing state. The existing save path selects columns
from visibility-state keys, so widths for other columns can be omitted. The
view-options slider retains its mount-time width snapshot after external updates
and its existing 50–300px editing range in 10px steps. General save/load round
trips and slider synchronization aren't repaired by column-definition normalization.

### Custom Toolbar

Default web cards keep the all-field **Filter** and **Sort** together in one
primary row. Filter includes hidden and non-column `filterableFields`; its chips
still reopen the same editor and can be removed or cleared. Search gets its own
line. Saved views, Save and the fetching indicator occupy a separate wrapping
group. A long active Sort label truncates within its row budget while its full
column and direction remain in the button's accessible description.

This composition is internal to the default cards path, including responsive
`layout="auto"`. Public standalone toolbars, the grid and custom `renderToolbar`
composition keep their existing layout. Custom toolbars retain the card Sort /
Add Filter fallback. That fallback remains column-based; a custom toolbar must
still mount `DataTableFilterButton` to host canonical hidden-field/chip editing.
The existing custom-only missing-editor limitation isn't repaired here.

`DataTableToolbar` composes a global-search section (the catalog `SearchInput` with a
clear affordance) and, behind a toolbar divider, a roving-focus actions section:
a filter button (when the table has filterable fields), your `customActions`, and view
management (save-view popover + active-view indicator). It wires up two ways:

- **Inside a `DataTable`** — via the `renderToolbar` render prop or the compound
  `<DataTable.Toolbar />`, it reads state from `DataTableStateContext`; no wiring needed.
  Explicit props override context values.
- **Standalone** — control it with explicit props: `globalFilter` / `onGlobalFilterChange` /
  `onClearFilters` (search), `enableViews` + `views` / `activeViewId` / `onSaveView` /
  `onLoadView` (view management), and `customActions`. Sections toggle via
  `enableGlobalSearch`, `enableFiltering`, and `enableViews`.

```tsx
<DataTable
  renderToolbar={(props) => (
    <DataTableToolbar
      {...props}
      customActions={<Button>Export CSV</Button>}
    />
  )}
/>
```

### Custom Filters

```tsx
<DataTable
  renderFilters={(props) => (
    <DataTableFilters
      {...props}
      maxFilters={3}
      showFilterCount={true}
    />
  )}
/>
```

### Custom Pagination

```tsx
<DataTable
  renderPagination={(props) => (
    <DataTablePagination
      {...props}
      showInfo={true}
      pageSizeOptions={[10, 25, 50, 100]}
    />
  )}
/>
```

## 🔧 API Reference

### DataTable Props

| Prop                       | Type                    | Default   | Description                                                                                 |
| -------------------------- | ----------------------- | --------- | ------------------------------------------------------------------------------------------- |
| `data`                     | `TData[]`               | -         | Array of data to display                                                                    |
| `columns`                  | `ColumnDef<TData>[]`    | -         | Column definitions                                                                          |
| `syncWithUrl`              | `boolean`               | `false`   | Enable URL state management                                                                 |
| `enableFiltering`          | `boolean`               | `true`    | Enable advanced filtering                                                                   |
| `enableSorting`            | `boolean`               | `true`    | Enable column sorting                                                                       |
| `enablePagination`         | `boolean`               | `true`    | Enable pagination                                                                           |
| `paginationMode`           | `"pages" \| "infinite"` | `"pages"` | Footer pager vs. infinite scroll with prefetch-ahead.                                       |
| `loadPage`                 | `DataTablePageLoader`   | —         | Async page loader for infinite mode (server/async data). Forces manual modes on.            |
| `enableGlobalSearch`       | `boolean`               | `true`    | Enable global search                                                                        |
| `enableViews`              | `boolean`               | `false`   | Enable view management                                                                      |
| `manualFiltering`          | `boolean`               | `false`   | Handle filtering server-side                                                                |
| `manualPagination`         | `boolean`               | `false`   | Handle pagination server-side                                                               |
| `manualSorting`            | `boolean`               | `false`   | Handle sorting server-side                                                                  |
| `enableVirtualization`     | `boolean`               | `false`   | Use virtual scrolling for table body. Requires `virtualizationHeight` when true.            |
| `virtualizationHeight`     | `number`                | —         | Height (px) of scrollable body when `enableVirtualization` is true.                         |
| `enableRowExpansion`       | `boolean`               | `false`   | Enable expandable sub-rows. Requires `getSubRows` or `subRows` in row data.                 |
| `enableColumnPinning`      | `boolean`               | `false`   | Enable column pinning (left/right). Pinned columns stay fixed during horizontal scroll.     |
| `maxPinnedColumns`         | `number`                | `3`       | Max columns per side (left/right) when pinning.                                             |
| `enableKeyboardNavigation` | `boolean`               | `false`   | Enable Excel-like keyboard navigation (arrows, Home, End, PageUp/Down, Enter).              |
| `rowCount`                 | `number`                | —         | Total row count for manual pagination (server-side).                                        |
| `pageCount`                | `number`                | —         | Total page count for manual pagination. If omitted, derived from `rowCount` and `pageSize`. |

### DataTableFilters Props

| Prop               | Type             | Default | Description                      |
| ------------------ | ---------------- | ------- | -------------------------------- |
| `filters`          | `TableFilter[]`  | `[]`    | Current active filters           |
| `availableColumns` | `ColumnConfig[]` | -       | Columns available for filtering  |
| `maxFilters`       | `number`         | `10`    | Maximum number of active filters |
| `onAddFilter`      | `function`       | -       | Called when filter is added      |
| `onRemoveFilter`   | `function`       | -       | Called when filter is removed    |

## 📦 Bundle Size

Our modular architecture means you only pay for what you use:

```tsx
// Only imports DataTable core
import { DataTable } from '@repo/table';
// ~25KB gzipped

// Includes filtering
import { DataTable, DataTableFilters } from '@repo/table';
// ~35KB gzipped

// Everything
import * as Table from '@repo/table';
// ~45KB gzipped
```

## 🤝 Integration

### With @repo/forms

Leverage our forms package for rich filter inputs:

```tsx
import { useFormField } from '@repo/forms';
import { DataTableFilters } from '@repo/table';

// Forms package provides rich input components
// Table package uses them for advanced filtering
```

### With @repo/router

Automatic URL state management:

```tsx
import { useUrlState } from '@repo/router';

// Built-in integration - no extra setup needed
<DataTable syncWithUrl={true} />;
```

## **Comparison**

### What we have ✅

**✅ Features We Have:**

- Advanced filtering with complex query builders
- URL state management and bookmarkable views
- Column visibility, ordering, and resizing
- Server-side operations and manual data fetching
- Row selection and bulk operations
- Data export (CSV, Excel, PDF, JSON)
- Full-text search with highlighting
- Advanced date filtering with calendar picker
- Accessibility compliance
- Cross-platform compatibility
- TypeScript support
- Views and saved filter combinations
- Multi-format data export with column selection
- Bulk actions with confirmation dialogs
- Advanced filtering across all columns
- Full-text search with highlighting across all columns
- Advanced date filtering with calendar picker
- Server-side pagination and sorting
- Keyboard navigation
- Responsive design

**❓ Features We Could Add:**

- Virtual scrolling for 100k+ rows
- Grouping and aggregation
- Column pinning/freezing
- Row expansion with details
- Custom cell renderers
- Print functionality (enhanced)
- Undo/redo operations
- Internationalization
- Advanced keyboard navigation (Excel-like)

### What We Have

- **Native Cross-Platform Support** - Works on Web, React Native, Tauri, GNOME without changes
- **URL State Strategy Pattern** - Pluggable routing integration (OneStack, React Router, Next.js)
- **Forms Integration** - Deep integration with @repo/forms
- **Universal Router Compatibility** - Works with any React routing solution

## 🎯 **Current Status: 99% Feature Parity**

### ✅ **Implemented:**

- Advanced filtering with complex query builders
- URL state management and bookmarkable views
- Column visibility, ordering, and resizing
- Server-side operations and manual data fetching
- Row selection and bulk operations
- Data export (CSV, Excel, PDF, JSON)
- Full-text search with highlighting
- Advanced date filtering with calendar picker
- **Virtual scrolling for 100k+ rows** 🚀
- **Grouping and aggregation** 🚀
- Accessibility compliance
- Cross-platform compatibility
- TypeScript support
- Views and saved filter combinations

### ❌ **Still Missing (1%):**

- Column pinning/freezing
- Row expansion with details
- Custom cell renderers
- Print functionality (enhanced)
- Undo/redo operations
- Internationalization
- Advanced keyboard navigation (Excel-like)

## 🧪 Testing

```bash
# Run tests
pnpm test

# Run with coverage
pnpm test --coverage

# Run specific test
pnpm test DataTable.test.tsx
```

## 📚 Examples

See `/examples` directory for:

- **AdvancedTableExample** - Full-featured table with all bells and whistles
- **GroupingExample** - Hierarchical grouping and aggregation
- **VirtualScrollingExample** - Handle 100k+ rows with performance
- **BulkActionsExample** - Row selection and bulk operations
- **ExportExample** - Data export in multiple formats
- **FullTextSearchExample** - Advanced search with highlighting
- **DateFilterExample** - Advanced date filtering with presets
- **FormsIntegrationExample** - Integration with @repo/forms
- **SimpleTableExample** - Basic table for simple use cases
- **ServerTableExample** - Server-side rendering example
- **CustomTableExample** - Custom styling and components

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](../../CONTRIBUTING.md).

## 📄 License

Apache License 2.0 - see [LICENSE](../../LICENSE) file.

---

**Built with ❤️ by [BitSpur](https://risserlabs.com)**
