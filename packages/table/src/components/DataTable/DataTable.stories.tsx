import { Button } from '@repo/forms';
import { formatAbsoluteDate, formatCurrency } from '@repo/theme';
import type { GuardrailSpecimenParameter } from '@repo/theme';
import { Avatar } from '@repo/ui';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { createColumnHelper } from '@tanstack/react-table';
import React, { useMemo } from 'react';
import { fn } from 'storybook/test';
import { Text, View, YStack } from 'tamagui';

import { DataTableFilters, DataTablePagination, DataTableToolbar, formatMoney, sumMoneyByCurrency } from '../../index';
import type { DataTableColumn, DataTableData, RowAccumulator } from '../../index';

import { DataTable, useDataTableState } from './index';

const meta: Meta<typeof DataTable> = {
  title: 'Table/DataTable',
  component: DataTable,
  parameters: {
    layout: 'fullscreen',
  },
  // Storybook 10 errors when callback args are used implicitly during render.
  // Provide explicit spies for all on* callbacks the component fires.
  args: {
    onStateChange: fn(),
    onCellChange: fn(),
    onDataChange: fn(),
  },
  decorators: [
    (Story) => (
      <View
        flex={1}
        padding="$4"
        width="100%">
        <Story />
      </View>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof DataTable>;

const LAST_LOGIN_LABEL = 'Last Login';
const FIRST_NAME_LABEL = 'First Name';
const SAMPLE_PHONE = '+1234567890';

const statusBackground = { active: '$green5', inactive: '$red5', pending: '$yellow5' } as const;
const statusColor = { active: '$green11', inactive: '$red11', pending: '$yellow11' } as const;

// Mock Data Types
interface User extends DataTableData {
  id: string;
  avatar: string;
  firstName: string;
  lastName: string;
  email: string;
  age: number;
  department: string;
  role: string;
  salary: number;
  status: 'active' | 'inactive' | 'pending';
  joinDate: string;
  lastLogin: string;
}

// Generate mock data
const generateUsers = (count: number): User[] => {
  const departments = ['Engineering', 'Marketing', 'Sales', 'HR', 'Finance'];
  const roles = ['Developer', 'Manager', 'Analyst', 'Designer', 'Coordinator'];
  const statuses: User['status'][] = ['active', 'inactive', 'pending'];

  return Array.from({ length: count }, (_, i) => ({
    id: `user-${i + 1}`,
    avatar: `https://i.pravatar.cc/150?img=${(i % 70) + 1}`,
    firstName: `User${i + 1}`,
    lastName: `Last${i + 1}`,
    email: `user${i + 1}@company.com`,
    age: 20 + (i % 40),
    department: departments[i % departments.length],
    role: roles[i % roles.length],
    salary: 50_000 + (i % 100_000),
    status: statuses[i % statuses.length],
    joinDate: new Date(2020, i % 12, (i % 28) + 1).toISOString().split('T')[0],
    lastLogin: new Date(Date.now() - (i % 30) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  }));
};

// Column Definitions
const columnHelper = createColumnHelper<User>();

const columns: DataTableColumn<User>[] = [
  // Avatar Column
  columnHelper.accessor('avatar', {
    header: 'Avatar',
    cell: (info) => (
      <Avatar
        circular
        size="$3"
        backgroundColor="$gray6">
        <Avatar.Image
          alt="User avatar"
          src={info.getValue()}
        />
        <Avatar.Fallback backgroundColor="$gray6" />
      </Avatar>
    ),
    enableSorting: false,
    enableColumnFilter: false,
    size: 60,
  }) as DataTableColumn<User>,

  // Name Column
  columnHelper.accessor((row) => `${row.firstName} ${row.lastName}`, {
    id: 'fullName',
    header: 'Full Name',
    cell: (info) => {
      const user = info.row.original;
      return (
        <YStack gap="$1">
          <Text fontWeight="600">{`${user.firstName} ${user.lastName}`}</Text>
          <Text
            fontSize="$2"
            color="$gray11">
            {user.email}
          </Text>
        </YStack>
      );
    },
    filterFn: (row, _id, value) => {
      const fullName = `${row.original.firstName} ${row.original.lastName}`.toLowerCase();
      return fullName.includes(value.toLowerCase());
    },
  }) as DataTableColumn<User>,

  // Age Column
  columnHelper.accessor('age', {
    header: 'Age',
    cell: (info) => <Text>{info.getValue()}</Text>,
    filterFn: 'inNumberRange',
  }) as DataTableColumn<User>,

  // Department Column
  columnHelper.accessor('department', {
    header: 'Department',
    cell: (info) => (
      <View
        backgroundColor="$blue5"
        paddingHorizontal="$2"
        paddingVertical="$1"
        borderRadius="$2">
        <Text
          color="$blue11"
          fontSize="$2">
          {info.getValue()}
        </Text>
      </View>
    ),
  }) as DataTableColumn<User>,

  // Role Column
  columnHelper.accessor('role', {
    header: 'Role',
    cell: (info) => <Text>{info.getValue()}</Text>,
  }) as DataTableColumn<User>,

  // Salary Column
  columnHelper.accessor('salary', {
    header: 'Salary',
    cell: (info) => <Text>{formatCurrency(info.getValue(), { symbol: '$', fractionDigits: 'auto' })}</Text>,
    filterFn: 'inNumberRange',
  }) as DataTableColumn<User>,

  // Status Column
  columnHelper.accessor('status', {
    header: 'Status',
    cell: (info) => {
      const status = info.getValue();
      return (
        <View
          backgroundColor={statusBackground[status]}
          paddingHorizontal="$2"
          paddingVertical="$1"
          borderRadius="$2">
          <Text
            color={statusColor[status]}
            fontSize="$2"
            fontWeight="600"
            textTransform="capitalize">
            {status}
          </Text>
        </View>
      );
    },
  }) as DataTableColumn<User>,

  // Join Date Column
  columnHelper.accessor('joinDate', {
    header: 'Join Date',
    cell: (info) => <Text>{formatAbsoluteDate(info.getValue())}</Text>,
    filterFn: 'includesString',
  }) as DataTableColumn<User>,

  // Last Login Column
  columnHelper.accessor('lastLogin', {
    header: LAST_LOGIN_LABEL,
    cell: (info) => <Text>{formatAbsoluteDate(info.getValue())}</Text>,
    filterFn: 'includesString',
  }) as DataTableColumn<User>,

  // Actions Column
  columnHelper.display({
    id: 'actions',
    header: 'Actions',
    cell: (_info) => <Button size="$2">Edit</Button>,
    enableSorting: false,
    enableColumnFilter: false,
  }) as DataTableColumn<User>,
];

// Available Columns for Filtering
const availableColumns = [
  {
    id: 'fullName',
    label: 'Full Name',
    type: 'text' as const,
  },
  {
    id: 'age',
    label: 'Age',
    type: 'number' as const,
  },
  {
    id: 'department',
    label: 'Department',
    type: 'select' as const,
    options: [
      { label: 'Engineering', value: 'Engineering', count: 0 },
      { label: 'Marketing', value: 'Marketing', count: 0 },
      { label: 'Sales', value: 'Sales', count: 0 },
      { label: 'HR', value: 'HR', count: 0 },
      { label: 'Finance', value: 'Finance', count: 0 },
    ],
  },
  {
    id: 'role',
    label: 'Role',
    type: 'select' as const,
    options: [
      { label: 'Developer', value: 'Developer', count: 0 },
      { label: 'Manager', value: 'Manager', count: 0 },
      { label: 'Analyst', value: 'Analyst', count: 0 },
      { label: 'Designer', value: 'Designer', count: 0 },
      { label: 'Coordinator', value: 'Coordinator', count: 0 },
    ],
  },
  {
    id: 'salary',
    label: 'Salary',
    type: 'number' as const,
  },
  {
    id: 'status',
    label: 'Status',
    type: 'select' as const,
    options: [
      { label: 'Active', value: 'active', count: 0 },
      { label: 'Inactive', value: 'inactive', count: 0 },
      { label: 'Pending', value: 'pending', count: 0 },
    ],
  },
  {
    id: 'joinDate',
    label: 'Join Date',
    type: 'date' as const,
  },
  {
    id: 'lastLogin',
    label: LAST_LOGIN_LABEL,
    type: 'date' as const,
  },
];

const countMatching = (data: User[], key: keyof User, optionValue: string) =>
  data.filter((item) => String(item[key]).toLowerCase() === optionValue.toLowerCase()).length;

// Story Components
const AdvancedTableStory = () => {
  const data = useMemo(() => generateUsers(1000), []);

  const columnsWithCounts = useMemo(
    () =>
      availableColumns.map((column) => {
        if (column.options) {
          const counts = column.options.map((option) => ({
            ...option,
            count: countMatching(data, column.id as keyof User, option.value),
          }));
          return { ...column, options: counts };
        }
        return column;
      }),
    [data],
  );

  return (
    <View
      flex={1}
      padding="$4">
      <YStack gap="$6">
        <YStack gap="$2">
          <Text
            fontSize="$6"
            fontWeight="bold">
            Advanced User Management Table
          </Text>
          <Text
            fontSize="$4"
            color="$gray11">
            Powerful filtering, sorting, and pagination with URL state management
          </Text>
        </YStack>

        <DataTable
          data={data}
          columns={columns}
          syncWithUrl={true}
          enableFiltering={true}
          enableSorting={true}
          enablePagination={true}
          enableColumnVisibility={true}
          enableColumnResizing={true}
          enableGlobalSearch={true}
          enableViews={true}
          renderToolbar={(props) => (
            <DataTableToolbar
              {...props}
              customActions={<Button size="$3">Export CSV</Button>}
            />
          )}
          renderFilters={(props) => (
            <DataTableFilters
              {...props}
              availableColumns={columnsWithCounts}
              maxFilters={5}
            />
          )}
          renderPagination={(props) => (
            <DataTablePagination
              {...props}
              compact
            />
          )}
          size="md"
          aria-label="User management table"
        />
      </YStack>
    </View>
  );
};

const SimpleTableStory = () => {
  const data = useMemo(() => generateUsers(50), []);
  const simpleColumns = columns.slice(1, 6);

  return (
    <View
      flex={1}
      padding="$4">
      <DataTable
        data={data}
        columns={simpleColumns}
        enableFiltering={false}
        enableSorting={true}
        enablePagination={true}
        enableGlobalSearch={true}
        size="sm"
      />
    </View>
  );
};

// Basic Person data for simpler examples
interface Person {
  id: number;
  firstName: string;
  lastName: string;
  age: number;
  email: string;
  status: 'active' | 'inactive';
}

const sampleData: Person[] = [
  {
    id: 1,
    firstName: 'John',
    lastName: 'Doe',
    age: 28,
    email: 'john.doe@example.com',
    status: 'active',
  },
  {
    id: 2,
    firstName: 'Jane',
    lastName: 'Smith',
    age: 32,
    email: 'jane.smith@example.com',
    status: 'active',
  },
  {
    id: 3,
    firstName: 'Bob',
    lastName: 'Johnson',
    age: 45,
    email: 'bob.johnson@example.com',
    status: 'inactive',
  },
  {
    id: 4,
    firstName: 'Alice',
    lastName: 'Williams',
    age: 29,
    email: 'alice.williams@example.com',
    status: 'active',
  },
  {
    id: 5,
    firstName: 'Charlie',
    lastName: 'Brown',
    age: 35,
    email: 'charlie.brown@example.com',
    status: 'inactive',
  },
];

const personColumnHelper = createColumnHelper<Person>();

const basicColumns: DataTableColumn<Person>[] = [
  personColumnHelper.accessor('id', {
    header: 'ID',
    cell: (info) => info.getValue(),
  }) as DataTableColumn<Person>,
  personColumnHelper.accessor('firstName', {
    header: FIRST_NAME_LABEL,
    cell: (info) => info.getValue(),
  }) as DataTableColumn<Person>,
  personColumnHelper.accessor('lastName', {
    header: 'Last Name',
    cell: (info) => info.getValue(),
  }) as DataTableColumn<Person>,
  personColumnHelper.accessor('age', {
    header: 'Age',
    cell: (info) => info.getValue(),
  }) as DataTableColumn<Person>,
  personColumnHelper.accessor('email', {
    header: 'Email',
    cell: (info) => info.getValue(),
  }) as DataTableColumn<Person>,
  personColumnHelper.accessor('status', {
    header: 'Status',
    cell: (info) => {
      const status = info.getValue();
      // Sanctioned intent ramp values (UX-P15 / Axiom 12): the *11 rungs stay
      // AA on both schemes, unlike the raw CSS `green`/`red` they replace.
      return (
        <Text
          color={status === 'active' ? '$green11' : '$red11'}
          fontWeight="bold">
          {status}
        </Text>
      );
    },
  }) as DataTableColumn<Person>,
];

export const Advanced: Story = {
  name: 'Main',
  render: () => <AdvancedTableStory />,
};

export const Simple: Story = {
  render: () => <SimpleTableStory />,
};

export const Basic: Story = {
  args: {
    data: sampleData,
    columns: basicColumns as DataTableColumn[],
    // Rest on a middle page so every pagination control renders live —
    // a bare-disabled prev/next at rest trips the `[theme]` guardrail
    // (UX-P19 / DG-ST-03) and demos nothing.
    initialState: {
      pagination: { pageIndex: 1, pageSize: 2 },
    },
  },
};

export const Loading: Story = {
  args: {
    data: sampleData,
    columns: basicColumns as DataTableColumn[],
    initialState: {
      isLoading: true,
    },
    'aria-label': 'Loading table',
  },
};

export const WithPagination: Story = {
  args: {
    data: sampleData,
    columns: basicColumns as DataTableColumn[],
    enablePagination: true,
    // Middle page: prev AND next stay live at rest (no bare-disabled nav).
    initialState: {
      pagination: { pageIndex: 1, pageSize: 2 },
    },
  },
};

export const WithSorting: Story = {
  args: {
    data: sampleData,
    columns: basicColumns as DataTableColumn[],
    enableSorting: true,
  },
};

export const WithFiltering: Story = {
  args: {
    data: sampleData,
    columns: basicColumns as DataTableColumn[],
    enableFiltering: true,
  },
};

/**
 * Chrome-suppression contract (one outer filter authority): the host screen
 * owns filtering and injects tuples via `initialState.filters`; the table
 * renders NO filter entry points — no toolbar Filter button, no column
 * funnels, no chips row — while the injected filters keep applying (rows
 * below are pre-filtered to status=active). Search and header sort stay.
 */
export const ExternallyFiltered: Story = {
  args: {
    data: sampleData,
    columns: basicColumns as DataTableColumn[],
    enableFiltering: false,
    enableSorting: true,
    initialState: {
      filters: [
        {
          id: 'external-status',
          columnId: 'status',
          value: { operator: 'is', value: 'active' },
        },
      ],
    },
  },
};

export const FullFeatured: Story = {
  args: {
    data: sampleData,
    columns: basicColumns as DataTableColumn[],
    enableFiltering: true,
    enableSorting: true,
    enablePagination: true,
    // 3 pages, resting mid-page: every nav control live (no bare-disabled).
    initialState: {
      pagination: { pageIndex: 1, pageSize: 2 },
    },
  },
};

export const Compact: Story = {
  args: {
    data: sampleData,
    columns: basicColumns as DataTableColumn[],
    size: 'sm',
  },
};

export const Large: Story = {
  args: {
    data: sampleData,
    columns: basicColumns as DataTableColumn[],
    size: 'lg',
  },
};

export const WithColumnResizing: Story = {
  args: {
    data: sampleData,
    columns: basicColumns.map((col) => ({
      ...col,
      minSize: 80,
      maxSize: 300,
    })) as DataTableColumn[],
    enableColumnResizing: true,
  },
};

const largeData = Array.from({ length: 10_000 }, (_, i) => ({
  ...sampleData[i % sampleData.length],
  id: i + 1,
  firstName: `User${i + 1}`,
  lastName: `Last${i + 1}`,
  email: `user${i + 1}@example.com`,
}));

export const WithVirtualization: Story = {
  args: {
    data: largeData,
    columns: basicColumns as DataTableColumn[],
    enableVirtualization: true,
    virtualizationHeight: 400,
    virtualizationOverscan: 5,
  },
};

export const WithColumnPinning: Story = {
  args: {
    data: sampleData,
    columns: basicColumns.map((col) => ({
      ...col,
      minSize: 80,
      maxSize: 300,
    })) as DataTableColumn[],
    enableColumnPinning: true,
    maxPinnedColumns: 2,
    enableColumnResizing: true,
  },
};

const RtlDocument = ({ children }: { children: React.ReactElement }) => {
  React.useEffect(() => {
    const previous = document.documentElement.getAttribute('dir');
    document.documentElement.setAttribute('dir', 'rtl');
    return () => {
      if (previous === null) {
        document.documentElement.removeAttribute('dir');
      } else {
        document.documentElement.setAttribute('dir', previous);
      }
    };
  }, []);
  return children;
};

export const WithColumnPinningRTL: Story = {
  name: 'With Column Pinning RTL',
  args: WithColumnPinning.args,
  render: (args) => (
    <RtlDocument>
      <DataTable {...args} />
    </RtlDocument>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'WithColumnPinning under a right-to-left document. Pinned columns stick to the inline start and end, which are the right and left edges here, and each sticky inset is the summed width of the pinned cells before it (MPO-236).',
      },
    },
  },
};

export const WithKeyboardNavigation: Story = {
  args: {
    data: sampleData,
    columns: basicColumns as DataTableColumn[],
    enableKeyboardNavigation: true,
  },
};

interface ExpandablePerson extends Person {
  subRows?: ExpandablePerson[];
}
const expandableData: ExpandablePerson[] = sampleData.map((p, i) => ({
  ...p,
  subRows: i < 2 ? [{ ...p, id: -i - 1, firstName: `Detail ${i}` }] : undefined,
}));

export const WithRowExpansion: Story = {
  args: {
    data: expandableData,
    columns: basicColumns as DataTableColumn[],
    enableRowExpansion: true,
    renderSubComponent: (row) => (
      <View
        padding="$4"
        backgroundColor="$color2">
        <Text>
          Expanded: {row.original.firstName} {row.original.lastName}
        </Text>
      </View>
    ),
  },
};

export const Empty: Story = {
  args: {
    data: [],
    columns: basicColumns as DataTableColumn[],
  },
};

/**
 * Active filter matches nothing: "No results found" — distinct from the
 * unfiltered Empty state's "No data available" (DG-TBL-06 / Axiom 6).
 * Clearing the filter from the toolbar restores the rows.
 */
export const NoResults: Story = {
  args: {
    data: sampleData,
    columns: basicColumns as DataTableColumn[],
    enableFiltering: true,
    initialState: {
      filters: [
        {
          id: 'no-results-filter',
          columnId: 'name',
          value: { operator: 'contains', value: 'zzz-no-match' },
        },
      ],
    },
    'aria-label': 'Filtered table with no matching rows',
  },
};

/**
 * Failed load: error chrome with a Retry action replaces the rows — a failed
 * table must never masquerade as empty, and the retry affordance makes the
 * error state actionable (DG-ST-01 "error with retry" / Axiom 6). `onRetry`
 * wires the Retry button; `state.error` carries the message.
 */
export const ErrorWithRetry: Story = {
  args: {
    data: sampleData,
    columns: basicColumns as DataTableColumn[],
    initialState: {
      error: 'The rows could not be loaded.',
    },
    onRetry: fn(),
    'aria-label': 'Table with failed load',
  },
};

export const ReadOnly: Story = {
  args: {
    data: sampleData,
    columns: basicColumns as DataTableColumn[],
    readOnly: true,
    showRowNumbers: true,
  },
};

export const WithRowNumbers: Story = {
  args: {
    data: sampleData,
    columns: basicColumns as DataTableColumn[],
    showRowNumbers: true,
  },
};

const selectionBulkActions = [
  {
    id: 'export',
    label: 'Export',
    onExecute: (items: DataTableData[], clear: () => void) => {
      fn()(items);
      clear();
    },
  },
  {
    id: 'archive',
    label: 'Archive',
    onExecute: (items: DataTableData[], clear: () => void) => {
      fn()(items);
      clear();
    },
  },
  {
    id: 'tag',
    label: 'Tag',
    onExecute: (items: DataTableData[], clear: () => void) => {
      fn()(items);
      clear();
    },
  },
  {
    id: 'assign',
    label: 'Assign',
    onExecute: (items: DataTableData[], clear: () => void) => {
      fn()(items);
      clear();
    },
  },
  {
    id: 'notify',
    label: 'Notify',
    onExecute: (items: DataTableData[], clear: () => void) => {
      fn()(items);
      clear();
    },
  },
  {
    id: 'delete',
    label: 'Delete',
    variant: 'destructive' as const,
    requiresConfirmation: true,
    onExecute: (items: DataTableData[], clear: () => void) => {
      fn()(items);
      clear();
    },
  },
];

/** DG-TBL-02/03 — enableRowSelection + selectAllScope + auto bulk bar */
export const WithRowSelection: Story = {
  args: {
    data: sampleData,
    columns: basicColumns as DataTableColumn[],
    enableRowSelection: true,
    selectAllScope: 'page',
    bulkActions: selectionBulkActions,
    enablePagination: true,
    initialState: {
      pagination: { pageIndex: 1, pageSize: 2 },
    },
    'aria-label': 'Row selection data table',
  },
  argTypes: {
    selectAllScope: {
      control: 'radio',
      options: ['page', 'filtered'],
      description: 'Header select-all scope (DG-TBL-03)',
    },
    enableRowSelection: { control: 'boolean' },
  },
};

// Editable Table Data
interface EditablePerson {
  id: number;
  name: string;
  quantity: number;
  category: string;
  active: boolean;
}

const editableColumns: DataTableColumn<EditablePerson>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
    field: 'input',
  },
  {
    accessorKey: 'quantity',
    header: 'Quantity',
    field: 'stepper',
    fieldProps: { min: 0, max: 100 },
  },
  {
    accessorKey: 'category',
    header: 'Category',
    field: 'select',
    fieldProps: {
      // >5 options: shorter single-select lists trip `select-too-few-options` (DG-CTRL-01).
      options: [
        { label: 'Electronics', value: 'electronics' },
        { label: 'Clothing', value: 'clothing' },
        { label: 'Food', value: 'food' },
        { label: 'Books', value: 'books' },
        { label: 'Toys', value: 'toys' },
        { label: 'Garden', value: 'garden' },
      ],
    },
  },
  {
    accessorKey: 'active',
    header: 'Active',
    field: 'checkbox',
  },
];

const editableData: EditablePerson[] = [
  { id: 1, name: 'Product A', quantity: 10, category: 'electronics', active: true },
  { id: 2, name: 'Product B', quantity: 5, category: 'clothing', active: false },
  { id: 3, name: 'Product C', quantity: 20, category: 'food', active: true },
];

const EditableTableStory = () => {
  const [data, setData] = React.useState(editableData);

  return (
    <View
      flex={1}
      padding="$4">
      <DataTable
        data={data}
        columns={editableColumns as DataTableColumn[]}
        onDataChange={setData as (data: DataTableData[]) => void}
        showAddRow={true}
        showDeleteRow={true}
        showRowNumbers={true}
        defaultRow={{
          // oxlint-disable-next-line react/purity -- story fixture: each render stamps a fresh id for the next added row
          id: Date.now(),
          name: '',
          quantity: 0,
          category: 'electronics',
          active: false,
        }}
      />
    </View>
  );
};

export const EditableTable: Story = {
  render: () => <EditableTableStory />,
};

/**
 * UX-011 / Axiom 6 HONEST STATE: `disabled` renders the whole table inert —
 * search, sorting, selection, cell editing, and pagination do nothing — and
 * visibly disabled (LC-40): chrome dims, cell editors wash, the root carries
 * `aria-disabled` and (web) `inert`. Read-only is the different, never-dimmed
 * state (see ReadOnly).
 */
export const Disabled: Story = {
  parameters: {
    // LC-57 allowlist: this story IS the whole-table disabled-dial demo — every
    // piece of chrome rests disabled by design, and per-control reasons would
    // say nothing beyond what the story title already does.
    guardrailSpecimen: {
      warns: ['bare-disabled'],
      reason: 'Disabled-dial specimen: the entire table (all chrome) rests disabled by design.',
    } satisfies GuardrailSpecimenParameter,
  },
  args: {
    data: editableData as unknown as DataTableData[],
    columns: editableColumns as DataTableColumn[],
    disabled: true,
    enableRowSelection: true,
    enableSorting: true,
    enableGlobalSearch: true,
    enableFiltering: true,
    enablePagination: true,
  },
};

export const WithFieldTypes: Story = {
  render: () => <EditableTableStory />,
};

// ============================================================================
// ALL FIELD TYPES STORIES
// ============================================================================

/**
 * Comprehensive field type data for testing ALL 17 DataTable field types
 */
interface AllFieldsRow {
  id: number;
  textField: string;
  numberField: number;
  selectField: string;
  comboboxField: string;
  checkboxField: boolean;
  switchField: boolean;
  dateField: string;
  datetimeField: string;
  timeField: string;
  durationField: number;
  colorField: string;
  ratingField: number;
  phoneField: string;
  currencyField: number;
  percentField: number;
  linkField: string;
}

const allFieldsData: AllFieldsRow[] = [
  {
    id: 1,
    textField: 'Hello World',
    numberField: 42,
    selectField: 'option1',
    comboboxField: 'choice1',
    checkboxField: true,
    switchField: false,
    dateField: '2024-03-15',
    datetimeField: '2024-03-15 14:30',
    timeField: '14:30',
    durationField: 3600,
    colorField: '#FF5733',
    ratingField: 4,
    phoneField: SAMPLE_PHONE,
    currencyField: 1250.5,
    percentField: 75.5,
    linkField: 'DOC-001',
  },
  {
    id: 2,
    textField: 'Test Row',
    numberField: 100,
    selectField: 'option2',
    comboboxField: 'choice2',
    checkboxField: false,
    switchField: true,
    dateField: '2024-06-20',
    datetimeField: '2024-06-20 09:00',
    timeField: '09:00',
    durationField: 7200,
    colorField: '#33FF57',
    ratingField: 5,
    phoneField: '+0987654321',
    currencyField: 2500,
    percentField: 100,
    linkField: 'DOC-002',
  },
  {
    id: 3,
    textField: 'Another Entry',
    numberField: 0,
    selectField: 'option3',
    comboboxField: 'choice3',
    checkboxField: true,
    switchField: true,
    dateField: '2024-01-01',
    datetimeField: '2024-01-01 00:00',
    timeField: '00:00',
    durationField: 0,
    colorField: '#3357FF',
    ratingField: 1,
    phoneField: '+1111111111',
    currencyField: 0,
    percentField: 0,
    linkField: 'DOC-003',
  },
];

const selectOptions = [
  { label: 'Option 1', value: 'option1' },
  { label: 'Option 2', value: 'option2' },
  { label: 'Option 3', value: 'option3' },
];

const comboboxOptions = [
  { label: 'Choice 1', value: 'choice1' },
  { label: 'Choice 2', value: 'choice2' },
  { label: 'Choice 3', value: 'choice3' },
  { label: 'Choice 4', value: 'choice4' },
];

const linkOptions = [
  { label: 'Document 001', value: 'DOC-001' },
  { label: 'Document 002', value: 'DOC-002' },
  { label: 'Document 003', value: 'DOC-003' },
];

const allFieldsColumns: DataTableColumn<AllFieldsRow>[] = [
  {
    accessorKey: 'textField',
    header: 'Text',
    field: 'input',
    fieldProps: { placeholder: 'Enter text...' },
  },
  {
    accessorKey: 'numberField',
    header: 'Number',
    field: 'stepper',
    fieldProps: { min: 0, max: 1000, placeholder: '0' },
  },
  {
    accessorKey: 'selectField',
    header: 'Select',
    field: 'select',
    fieldProps: { options: selectOptions, placeholder: 'Select...' },
  },
  {
    accessorKey: 'comboboxField',
    header: 'Combobox',
    field: 'combobox',
    fieldProps: { options: comboboxOptions, placeholder: 'Search...' },
  },
  {
    accessorKey: 'checkboxField',
    header: 'Checkbox',
    field: 'checkbox',
  },
  {
    accessorKey: 'switchField',
    header: 'Switch',
    field: 'switch',
  },
  {
    accessorKey: 'dateField',
    header: 'Date',
    field: 'datepicker',
    fieldProps: { placeholder: 'YYYY-MM-DD' },
  },
  {
    accessorKey: 'datetimeField',
    header: 'DateTime',
    field: 'datetimepicker',
    fieldProps: { placeholder: 'YYYY-MM-DD HH:MM' },
  },
  {
    accessorKey: 'timeField',
    header: 'Time',
    field: 'timepicker',
    fieldProps: { placeholder: 'HH:MM' },
  },
  {
    accessorKey: 'durationField',
    header: 'Duration',
    field: 'duration',
    fieldProps: { placeholder: 'Seconds' },
  },
  {
    accessorKey: 'colorField',
    header: 'Color',
    field: 'colorpicker',
    fieldProps: { placeholder: '#000000' },
  },
  {
    accessorKey: 'ratingField',
    header: 'Rating',
    field: 'rating',
  },
  {
    accessorKey: 'phoneField',
    header: 'Phone',
    field: 'phoneinput',
    fieldProps: { placeholder: SAMPLE_PHONE },
  },
  {
    accessorKey: 'currencyField',
    header: 'Currency',
    field: 'stepper',
    fieldProps: { currency: '$', placeholder: '0.00' },
  },
  {
    accessorKey: 'percentField',
    header: 'Percent',
    field: 'stepper',
    fieldProps: { placeholder: '0' },
  },
  {
    accessorKey: 'linkField',
    header: 'Link',
    field: 'combobox',
    fieldProps: { options: linkOptions, placeholder: 'Search document...' },
  },
];

// Story: All Field Types Editable
const AllFieldTypesEditableStory = () => {
  const [data, setData] = React.useState(allFieldsData);

  return (
    <YStack
      gap="$4"
      flex={1}
      padding="$4">
      <YStack gap="$2">
        <Text
          fontSize="$6"
          fontWeight="bold">
          All Field Types - Editable
        </Text>
        <Text
          fontSize="$3"
          color="$gray11">
          Testing all 17 DataTable field types in editable mode
        </Text>
      </YStack>
      <DataTable
        data={data}
        columns={allFieldsColumns as DataTableColumn[]}
        onDataChange={setData as (data: DataTableData[]) => void}
        showRowNumbers={true}
        showAddRow={true}
        showDeleteRow={true}
        defaultRow={{
          // oxlint-disable-next-line react/purity -- story fixture: each render stamps a fresh id for the next added row
          id: Date.now(),
          textField: '',
          numberField: 0,
          selectField: '',
          comboboxField: '',
          checkboxField: false,
          switchField: false,
          dateField: '',
          datetimeField: '',
          timeField: '',
          durationField: 0,
          colorField: '',
          ratingField: 0,
          phoneField: '',
          currencyField: 0,
          percentField: 0,
          linkField: '',
        }}
        aria-label="All field types editable table"
      />
    </YStack>
  );
};

export const AllFieldTypesEditable: Story = {
  render: () => <AllFieldTypesEditableStory />,
};

// Story: All Field Types Read-Only
const AllFieldTypesReadOnlyStory = () => (
  <YStack
    gap="$4"
    flex={1}
    padding="$4">
    <YStack gap="$2">
      <Text
        fontSize="$6"
        fontWeight="bold">
        All Field Types - Read Only
      </Text>
      <Text
        fontSize="$3"
        color="$gray11">
        Testing all 17 DataTable field types in read-only mode
      </Text>
    </YStack>
    <DataTable
      data={allFieldsData}
      columns={allFieldsColumns as DataTableColumn[]}
      readOnly={true}
      showRowNumbers={true}
      aria-label="All field types read-only table"
    />
  </YStack>
);

export const AllFieldTypesReadOnly: Story = {
  render: () => <AllFieldTypesReadOnlyStory />,
};

// ============================================================================
// INDIVIDUAL FIELD TYPE STORIES
// ============================================================================

// Text Field Story
interface TextFieldRow {
  id: number;
  title: string;
  description: string;
  notes: string;
}

const textFieldData: TextFieldRow[] = [
  { id: 1, title: 'First Item', description: 'Description for first item', notes: 'Some notes' },
  { id: 2, title: 'Second Item', description: 'Another description', notes: 'More notes here' },
  { id: 3, title: 'Third Item', description: 'Final description', notes: 'Final notes' },
];

const textFieldColumns: DataTableColumn<TextFieldRow>[] = [
  { accessorKey: 'title', header: 'Title', field: 'input' },
  { accessorKey: 'description', header: 'Description', field: 'input' },
  { accessorKey: 'notes', header: 'Notes', field: 'input' },
];

const TextFieldStory = () => {
  const [data, setData] = React.useState(textFieldData);
  return (
    <YStack
      gap="$4"
      flex={1}
      padding="$4">
      <Text
        fontSize="$5"
        fontWeight="bold">
        Text Field Type
      </Text>
      <DataTable
        data={data}
        columns={textFieldColumns as DataTableColumn[]}
        onDataChange={setData as (data: DataTableData[]) => void}
        showRowNumbers={true}
        aria-label="Text field type table"
      />
    </YStack>
  );
};

export const TextField: Story = {
  render: () => <TextFieldStory />,
};

export const TextFieldReadOnly: Story = {
  args: {
    data: textFieldData,
    columns: textFieldColumns as DataTableColumn[],
    readOnly: true,
    showRowNumbers: true,
  },
};

// Number Field Story
interface NumberFieldRow {
  id: number;
  quantity: number;
  price: number;
  weight: number;
}

const numberFieldData: NumberFieldRow[] = [
  { id: 1, quantity: 10, price: 99.99, weight: 2.5 },
  { id: 2, quantity: 25, price: 149.99, weight: 5 },
  { id: 3, quantity: 100, price: 9.99, weight: 0.1 },
];

const numberFieldColumns: DataTableColumn<NumberFieldRow>[] = [
  { accessorKey: 'quantity', header: 'Quantity', field: 'stepper', fieldProps: { min: 0 } },
  {
    accessorKey: 'price',
    header: 'Price',
    field: 'stepper',
    fieldProps: { min: 0, step: 0.01 },
  },
  { accessorKey: 'weight', header: 'Weight (kg)', field: 'stepper', fieldProps: { min: 0 } },
];

const NumberFieldStory = () => {
  const [data, setData] = React.useState(numberFieldData);
  return (
    <YStack
      gap="$4"
      flex={1}
      padding="$4">
      <Text
        fontSize="$5"
        fontWeight="bold">
        Number Field Type
      </Text>
      <DataTable
        data={data}
        columns={numberFieldColumns as DataTableColumn[]}
        onDataChange={setData as (data: DataTableData[]) => void}
        showRowNumbers={true}
        aria-label="Number field type table"
      />
    </YStack>
  );
};

export const NumberField: Story = {
  render: () => <NumberFieldStory />,
};

export const NumberFieldReadOnly: Story = {
  args: {
    data: numberFieldData,
    columns: numberFieldColumns as DataTableColumn[],
    readOnly: true,
    showRowNumbers: true,
  },
};

// Select Field Story
interface SelectFieldRow {
  id: number;
  category: string;
  priority: string;
  status: string;
}

const selectFieldData: SelectFieldRow[] = [
  { id: 1, category: 'electronics', priority: 'high', status: 'active' },
  { id: 2, category: 'clothing', priority: 'medium', status: 'pending' },
  { id: 3, category: 'food', priority: 'low', status: 'inactive' },
];

// >5 options per list: shorter single-select lists trip `select-too-few-options` (DG-CTRL-01).
const selectFieldColumns: DataTableColumn<SelectFieldRow>[] = [
  {
    accessorKey: 'category',
    header: 'Category',
    field: 'select',
    fieldProps: {
      options: [
        { label: 'Electronics', value: 'electronics' },
        { label: 'Clothing', value: 'clothing' },
        { label: 'Food', value: 'food' },
        { label: 'Books', value: 'books' },
        { label: 'Toys', value: 'toys' },
        { label: 'Garden', value: 'garden' },
      ],
    },
  },
  {
    accessorKey: 'priority',
    header: 'Priority',
    field: 'select',
    fieldProps: {
      options: [
        { label: 'Highest', value: 'highest' },
        { label: 'High', value: 'high' },
        { label: 'Medium', value: 'medium' },
        { label: 'Low', value: 'low' },
        { label: 'Lowest', value: 'lowest' },
        { label: 'Deferred', value: 'deferred' },
      ],
    },
  },
  {
    accessorKey: 'status',
    header: 'Status',
    field: 'select',
    fieldProps: {
      options: [
        { label: 'Active', value: 'active' },
        { label: 'Pending', value: 'pending' },
        { label: 'Inactive', value: 'inactive' },
        { label: 'Draft', value: 'draft' },
        { label: 'Archived', value: 'archived' },
        { label: 'Blocked', value: 'blocked' },
      ],
    },
  },
];

const SelectFieldStory = () => {
  const [data, setData] = React.useState(selectFieldData);
  return (
    <YStack
      gap="$4"
      flex={1}
      padding="$4">
      <Text
        fontSize="$5"
        fontWeight="bold">
        Select Field Type
      </Text>
      <DataTable
        data={data}
        columns={selectFieldColumns as DataTableColumn[]}
        onDataChange={setData as (data: DataTableData[]) => void}
        showRowNumbers={true}
        aria-label="Select field type table"
      />
    </YStack>
  );
};

export const SelectField: Story = {
  render: () => <SelectFieldStory />,
};

export const SelectFieldReadOnly: Story = {
  args: {
    data: selectFieldData,
    columns: selectFieldColumns as DataTableColumn[],
    readOnly: true,
    showRowNumbers: true,
  },
};

// Checkbox Field Story
interface CheckboxFieldRow {
  id: number;
  isActive: boolean;
  isVerified: boolean;
  hasSubscription: boolean;
}

const checkboxFieldData: CheckboxFieldRow[] = [
  { id: 1, isActive: true, isVerified: true, hasSubscription: false },
  { id: 2, isActive: false, isVerified: true, hasSubscription: true },
  { id: 3, isActive: true, isVerified: false, hasSubscription: true },
];

const checkboxFieldColumns: DataTableColumn<CheckboxFieldRow>[] = [
  { accessorKey: 'isActive', header: 'Active', field: 'checkbox' },
  { accessorKey: 'isVerified', header: 'Verified', field: 'checkbox' },
  { accessorKey: 'hasSubscription', header: 'Subscription', field: 'checkbox' },
];

const CheckboxFieldStory = () => {
  const [data, setData] = React.useState(checkboxFieldData);
  return (
    <YStack
      gap="$4"
      flex={1}
      padding="$4">
      <Text
        fontSize="$5"
        fontWeight="bold">
        Checkbox Field Type
      </Text>
      <DataTable
        data={data}
        columns={checkboxFieldColumns as DataTableColumn[]}
        onDataChange={setData as (data: DataTableData[]) => void}
        showRowNumbers={true}
        aria-label="Checkbox field type table"
      />
    </YStack>
  );
};

export const CheckboxField: Story = {
  render: () => <CheckboxFieldStory />,
};

export const CheckboxFieldReadOnly: Story = {
  args: {
    data: checkboxFieldData,
    columns: checkboxFieldColumns as DataTableColumn[],
    readOnly: true,
    showRowNumbers: true,
  },
};

// Switch Field Story
interface SwitchFieldRow {
  id: number;
  enabled: boolean;
  notifications: boolean;
  darkMode: boolean;
}

const switchFieldData: SwitchFieldRow[] = [
  { id: 1, enabled: true, notifications: false, darkMode: true },
  { id: 2, enabled: false, notifications: true, darkMode: false },
  { id: 3, enabled: true, notifications: true, darkMode: true },
];

const switchFieldColumns: DataTableColumn<SwitchFieldRow>[] = [
  { accessorKey: 'enabled', header: 'Enabled', field: 'switch' },
  { accessorKey: 'notifications', header: 'Notifications', field: 'switch' },
  { accessorKey: 'darkMode', header: 'Dark Mode', field: 'switch' },
];

const SwitchFieldStory = () => {
  const [data, setData] = React.useState(switchFieldData);
  return (
    <YStack
      gap="$4"
      flex={1}
      padding="$4">
      <Text
        fontSize="$5"
        fontWeight="bold">
        Switch Field Type
      </Text>
      <DataTable
        data={data}
        columns={switchFieldColumns as DataTableColumn[]}
        onDataChange={setData as (data: DataTableData[]) => void}
        showRowNumbers={true}
        aria-label="Switch field type table"
      />
    </YStack>
  );
};

export const SwitchField: Story = {
  render: () => <SwitchFieldStory />,
};

export const SwitchFieldReadOnly: Story = {
  args: {
    data: switchFieldData,
    columns: switchFieldColumns as DataTableColumn[],
    readOnly: true,
    showRowNumbers: true,
  },
};

// Date/Time Field Story
interface DateTimeFieldRow {
  id: number;
  date: string;
  datetime: string;
  time: string;
}

const dateTimeFieldData: DateTimeFieldRow[] = [
  { id: 1, date: '2024-03-15', datetime: '2024-03-15 14:30', time: '14:30' },
  { id: 2, date: '2024-06-20', datetime: '2024-06-20 09:00', time: '09:00' },
  { id: 3, date: '2024-12-25', datetime: '2024-12-25 00:00', time: '00:00' },
];

const dateTimeFieldColumns: DataTableColumn<DateTimeFieldRow>[] = [
  { accessorKey: 'date', header: 'Date', field: 'datepicker' },
  { accessorKey: 'datetime', header: 'DateTime', field: 'datetimepicker' },
  { accessorKey: 'time', header: 'Time', field: 'timepicker' },
];

const DateTimeFieldStory = () => {
  const [data, setData] = React.useState(dateTimeFieldData);
  return (
    <YStack
      gap="$4"
      flex={1}
      padding="$4">
      <Text
        fontSize="$5"
        fontWeight="bold">
        Date/Time Field Types
      </Text>
      <DataTable
        data={data}
        columns={dateTimeFieldColumns as DataTableColumn[]}
        onDataChange={setData as (data: DataTableData[]) => void}
        showRowNumbers={true}
        aria-label="Date time field types table"
      />
    </YStack>
  );
};

export const DateTimeField: Story = {
  render: () => <DateTimeFieldStory />,
};

export const DateTimeFieldReadOnly: Story = {
  args: {
    data: dateTimeFieldData,
    columns: dateTimeFieldColumns as DataTableColumn[],
    readOnly: true,
    showRowNumbers: true,
  },
};

// Duration Field Story
interface DurationFieldRow {
  id: number;
  taskDuration: number;
  breakTime: number;
  totalTime: number;
}

const durationFieldData: DurationFieldRow[] = [
  { id: 1, taskDuration: 3600, breakTime: 900, totalTime: 4500 },
  { id: 2, taskDuration: 7200, breakTime: 1800, totalTime: 9000 },
  { id: 3, taskDuration: 1800, breakTime: 300, totalTime: 2100 },
];

const durationFieldColumns: DataTableColumn<DurationFieldRow>[] = [
  { accessorKey: 'taskDuration', header: 'Task Duration (s)', field: 'duration' },
  { accessorKey: 'breakTime', header: 'Break Time (s)', field: 'duration' },
  { accessorKey: 'totalTime', header: 'Total Time (s)', field: 'duration' },
];

const DurationFieldStory = () => {
  const [data, setData] = React.useState(durationFieldData);
  return (
    <YStack
      gap="$4"
      flex={1}
      padding="$4">
      <Text
        fontSize="$5"
        fontWeight="bold">
        Duration Field Type
      </Text>
      <DataTable
        data={data}
        columns={durationFieldColumns as DataTableColumn[]}
        onDataChange={setData as (data: DataTableData[]) => void}
        showRowNumbers={true}
        aria-label="Duration field type table"
      />
    </YStack>
  );
};

export const DurationField: Story = {
  render: () => <DurationFieldStory />,
};

export const DurationFieldReadOnly: Story = {
  args: {
    data: durationFieldData,
    columns: durationFieldColumns as DataTableColumn[],
    readOnly: true,
    showRowNumbers: true,
  },
};

// Color Field Story
interface ColorFieldRow {
  id: number;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
}

const colorFieldData: ColorFieldRow[] = [
  { id: 1, primaryColor: '#FF5733', secondaryColor: '#33FF57', accentColor: '#3357FF' },
  { id: 2, primaryColor: '#E91E63', secondaryColor: '#9C27B0', accentColor: '#673AB7' },
  { id: 3, primaryColor: '#00BCD4', secondaryColor: '#009688', accentColor: '#4CAF50' },
];

const colorFieldColumns: DataTableColumn<ColorFieldRow>[] = [
  { accessorKey: 'primaryColor', header: 'Primary Color', field: 'colorpicker' },
  { accessorKey: 'secondaryColor', header: 'Secondary Color', field: 'colorpicker' },
  { accessorKey: 'accentColor', header: 'Accent Color', field: 'colorpicker' },
];

const ColorFieldStory = () => {
  const [data, setData] = React.useState(colorFieldData);
  return (
    <YStack
      gap="$4"
      flex={1}
      padding="$4">
      <Text
        fontSize="$5"
        fontWeight="bold">
        Color Field Type
      </Text>
      <DataTable
        data={data}
        columns={colorFieldColumns as DataTableColumn[]}
        onDataChange={setData as (data: DataTableData[]) => void}
        showRowNumbers={true}
        aria-label="Color field type table"
      />
    </YStack>
  );
};

export const ColorField: Story = {
  render: () => <ColorFieldStory />,
};

export const ColorFieldReadOnly: Story = {
  args: {
    data: colorFieldData,
    columns: colorFieldColumns as DataTableColumn[],
    readOnly: true,
    showRowNumbers: true,
  },
};

// Rating Field Story
interface RatingFieldRow {
  id: number;
  productRating: number;
  serviceRating: number;
  overallRating: number;
}

const ratingFieldData: RatingFieldRow[] = [
  { id: 1, productRating: 5, serviceRating: 4, overallRating: 5 },
  { id: 2, productRating: 3, serviceRating: 5, overallRating: 4 },
  { id: 3, productRating: 4, serviceRating: 3, overallRating: 3 },
];

const ratingFieldColumns: DataTableColumn<RatingFieldRow>[] = [
  { accessorKey: 'productRating', header: 'Product', field: 'rating' },
  { accessorKey: 'serviceRating', header: 'Service', field: 'rating' },
  { accessorKey: 'overallRating', header: 'Overall', field: 'rating' },
];

const RatingFieldStory = () => {
  const [data, setData] = React.useState(ratingFieldData);
  return (
    <YStack
      gap="$4"
      flex={1}
      padding="$4">
      <Text
        fontSize="$5"
        fontWeight="bold">
        Rating Field Type
      </Text>
      <DataTable
        data={data}
        columns={ratingFieldColumns as DataTableColumn[]}
        onDataChange={setData as (data: DataTableData[]) => void}
        showRowNumbers={true}
        aria-label="Rating field type table"
      />
    </YStack>
  );
};

export const RatingField: Story = {
  render: () => <RatingFieldStory />,
};

export const RatingFieldReadOnly: Story = {
  args: {
    data: ratingFieldData,
    columns: ratingFieldColumns as DataTableColumn[],
    readOnly: true,
    showRowNumbers: true,
  },
};

// Phone Field Story
interface PhoneFieldRow {
  id: number;
  mobile: string;
  work: string;
  home: string;
}

const phoneFieldData: PhoneFieldRow[] = [
  { id: 1, mobile: SAMPLE_PHONE, work: '+0987654321', home: '+1111111111' },
  { id: 2, mobile: '+4455667788', work: '+9988776655', home: '+2233445566' },
  { id: 3, mobile: '+1122334455', work: '+6677889900', home: '+3344556677' },
];

const phoneFieldColumns: DataTableColumn<PhoneFieldRow>[] = [
  { accessorKey: 'mobile', header: 'Mobile', field: 'phoneinput' },
  { accessorKey: 'work', header: 'Work', field: 'phoneinput' },
  { accessorKey: 'home', header: 'Home', field: 'phoneinput' },
];

const PhoneFieldStory = () => {
  const [data, setData] = React.useState(phoneFieldData);
  return (
    <YStack
      gap="$4"
      flex={1}
      padding="$4">
      <Text
        fontSize="$5"
        fontWeight="bold">
        Phone Field Type
      </Text>
      <DataTable
        data={data}
        columns={phoneFieldColumns as DataTableColumn[]}
        onDataChange={setData as (data: DataTableData[]) => void}
        showRowNumbers={true}
        aria-label="Phone field type table"
      />
    </YStack>
  );
};

export const PhoneField: Story = {
  render: () => <PhoneFieldStory />,
};

export const PhoneFieldReadOnly: Story = {
  args: {
    data: phoneFieldData,
    columns: phoneFieldColumns as DataTableColumn[],
    readOnly: true,
    showRowNumbers: true,
  },
};

// Currency Field Story
interface CurrencyFieldRow {
  id: number;
  priceUSD: number;
  priceEUR: number;
  priceGBP: number;
}

const currencyFieldData: CurrencyFieldRow[] = [
  { id: 1, priceUSD: 99.99, priceEUR: 89.99, priceGBP: 79.99 },
  { id: 2, priceUSD: 199.5, priceEUR: 179.5, priceGBP: 159.5 },
  { id: 3, priceUSD: 49, priceEUR: 44, priceGBP: 39 },
];

const currencyFieldColumns: DataTableColumn<CurrencyFieldRow>[] = [
  {
    accessorKey: 'priceUSD',
    header: 'Price (USD)',
    field: 'stepper',
    fieldProps: { currency: '$' },
  },
  {
    accessorKey: 'priceEUR',
    header: 'Price (EUR)',
    field: 'stepper',
    fieldProps: { currency: '€' },
  },
  {
    accessorKey: 'priceGBP',
    header: 'Price (GBP)',
    field: 'stepper',
    fieldProps: { currency: '£' },
  },
];

const CurrencyFieldStory = () => {
  const [data, setData] = React.useState(currencyFieldData);
  return (
    <YStack
      gap="$4"
      flex={1}
      padding="$4">
      <Text
        fontSize="$5"
        fontWeight="bold">
        Currency Field Type
      </Text>
      <DataTable
        data={data}
        columns={currencyFieldColumns as DataTableColumn[]}
        onDataChange={setData as (data: DataTableData[]) => void}
        showRowNumbers={true}
        aria-label="Currency field type table"
      />
    </YStack>
  );
};

export const CurrencyField: Story = {
  render: () => <CurrencyFieldStory />,
};

export const CurrencyFieldReadOnly: Story = {
  args: {
    data: currencyFieldData,
    columns: currencyFieldColumns as DataTableColumn[],
    readOnly: true,
    showRowNumbers: true,
  },
};

// Percent Field Story
interface PercentFieldRow {
  id: number;
  progress: number;
  completion: number;
  discount: number;
}

const percentFieldData: PercentFieldRow[] = [
  { id: 1, progress: 75, completion: 100, discount: 10 },
  { id: 2, progress: 50, completion: 80, discount: 25 },
  { id: 3, progress: 25, completion: 60, discount: 5 },
];

const percentFieldColumns: DataTableColumn<PercentFieldRow>[] = [
  { accessorKey: 'progress', header: 'Progress', field: 'stepper' },
  { accessorKey: 'completion', header: 'Completion', field: 'stepper' },
  { accessorKey: 'discount', header: 'Discount', field: 'stepper' },
];

const PercentFieldStory = () => {
  const [data, setData] = React.useState(percentFieldData);
  return (
    <YStack
      gap="$4"
      flex={1}
      padding="$4">
      <Text
        fontSize="$5"
        fontWeight="bold">
        Percent Field Type
      </Text>
      <DataTable
        data={data}
        columns={percentFieldColumns as DataTableColumn[]}
        onDataChange={setData as (data: DataTableData[]) => void}
        showRowNumbers={true}
        aria-label="Percent field type table"
      />
    </YStack>
  );
};

export const PercentField: Story = {
  render: () => <PercentFieldStory />,
};

export const PercentFieldReadOnly: Story = {
  args: {
    data: percentFieldData,
    columns: percentFieldColumns as DataTableColumn[],
    readOnly: true,
    showRowNumbers: true,
  },
};

// Combobox Field Story
interface ComboboxFieldRow {
  id: number;
  country: string;
  city: string;
  language: string;
}

const countryOptions = [
  { label: 'United States', value: 'us' },
  { label: 'United Kingdom', value: 'uk' },
  { label: 'Germany', value: 'de' },
  { label: 'France', value: 'fr' },
  { label: 'Japan', value: 'jp' },
];

const cityOptions = [
  { label: 'New York', value: 'nyc' },
  { label: 'London', value: 'london' },
  { label: 'Berlin', value: 'berlin' },
  { label: 'Paris', value: 'paris' },
  { label: 'Tokyo', value: 'tokyo' },
];

const languageOptions = [
  { label: 'English', value: 'en' },
  { label: 'German', value: 'de' },
  { label: 'French', value: 'fr' },
  { label: 'Japanese', value: 'ja' },
  { label: 'Spanish', value: 'es' },
];

const comboboxFieldData: ComboboxFieldRow[] = [
  { id: 1, country: 'us', city: 'nyc', language: 'en' },
  { id: 2, country: 'uk', city: 'london', language: 'en' },
  { id: 3, country: 'de', city: 'berlin', language: 'de' },
];

const comboboxFieldColumns: DataTableColumn<ComboboxFieldRow>[] = [
  {
    accessorKey: 'country',
    header: 'Country',
    field: 'combobox',
    fieldProps: { options: countryOptions },
  },
  {
    accessorKey: 'city',
    header: 'City',
    field: 'combobox',
    fieldProps: { options: cityOptions },
  },
  {
    accessorKey: 'language',
    header: 'Language',
    field: 'combobox',
    fieldProps: { options: languageOptions },
  },
];

const ComboboxFieldStory = () => {
  const [data, setData] = React.useState(comboboxFieldData);
  return (
    <YStack
      gap="$4"
      flex={1}
      padding="$4">
      <Text
        fontSize="$5"
        fontWeight="bold">
        Combobox Field Type
      </Text>
      <DataTable
        data={data}
        columns={comboboxFieldColumns as DataTableColumn[]}
        onDataChange={setData as (data: DataTableData[]) => void}
        showRowNumbers={true}
        aria-label="Combobox field type table"
      />
    </YStack>
  );
};

export const ComboboxField: Story = {
  render: () => <ComboboxFieldStory />,
};

export const ComboboxFieldReadOnly: Story = {
  args: {
    data: comboboxFieldData,
    columns: comboboxFieldColumns as DataTableColumn[],
    readOnly: true,
    showRowNumbers: true,
  },
};

// Link Field Story
interface LinkFieldRow {
  id: number;
  customer: string;
  product: string;
  order: string;
}

const customerOptions = [
  { label: 'CUST-001: John Doe', value: 'CUST-001' },
  { label: 'CUST-002: Jane Smith', value: 'CUST-002' },
  { label: 'CUST-003: Bob Johnson', value: 'CUST-003' },
];

const productOptions = [
  { label: 'PROD-001: Widget A', value: 'PROD-001' },
  { label: 'PROD-002: Widget B', value: 'PROD-002' },
  { label: 'PROD-003: Widget C', value: 'PROD-003' },
];

const orderOptions = [
  { label: 'ORD-001', value: 'ORD-001' },
  { label: 'ORD-002', value: 'ORD-002' },
  { label: 'ORD-003', value: 'ORD-003' },
];

const linkFieldData: LinkFieldRow[] = [
  { id: 1, customer: 'CUST-001', product: 'PROD-001', order: 'ORD-001' },
  { id: 2, customer: 'CUST-002', product: 'PROD-002', order: 'ORD-002' },
  { id: 3, customer: 'CUST-003', product: 'PROD-003', order: 'ORD-003' },
];

const linkFieldColumns: DataTableColumn<LinkFieldRow>[] = [
  {
    accessorKey: 'customer',
    header: 'Customer',
    field: 'combobox',
    fieldProps: { options: customerOptions },
  },
  {
    accessorKey: 'product',
    header: 'Product',
    field: 'combobox',
    fieldProps: { options: productOptions },
  },
  {
    accessorKey: 'order',
    header: 'Order',
    field: 'combobox',
    fieldProps: { options: orderOptions },
  },
];

const LinkFieldStory = () => {
  const [data, setData] = React.useState(linkFieldData);
  return (
    <YStack
      gap="$4"
      flex={1}
      padding="$4">
      <Text
        fontSize="$5"
        fontWeight="bold">
        Link Field Type
      </Text>
      <DataTable
        data={data}
        columns={linkFieldColumns as DataTableColumn[]}
        onDataChange={setData as (data: DataTableData[]) => void}
        showRowNumbers={true}
        aria-label="Link field type table"
      />
    </YStack>
  );
};

export const LinkField: Story = {
  render: () => <LinkFieldStory />,
};

export const LinkFieldReadOnly: Story = {
  args: {
    data: linkFieldData,
    columns: linkFieldColumns as DataTableColumn[],
    readOnly: true,
    showRowNumbers: true,
  },
};

// Custom Field Story
interface CustomFieldRow {
  id: number;
  customRender: any;
  customBadge: string;
}

const customFieldData: CustomFieldRow[] = [
  { id: 1, customRender: { name: 'John', role: 'Admin' }, customBadge: 'premium' },
  { id: 2, customRender: { name: 'Jane', role: 'User' }, customBadge: 'standard' },
  { id: 3, customRender: { name: 'Bob', role: 'Guest' }, customBadge: 'trial' },
];

const customFieldColumns: DataTableColumn<CustomFieldRow>[] = [
  {
    accessorKey: 'customRender',
    header: 'Custom User',
    field: 'custom',
    fieldProps: {
      render: (value: { name: string; role: string }) => (
        <View
          flexDirection="row"
          alignItems="center"
          gap="$2">
          <View
            backgroundColor="$blue5"
            padding="$1"
            borderRadius="$2">
            <Text
              fontSize="$2"
              color="$blue11">
              {value?.role || 'N/A'}
            </Text>
          </View>
          <Text>{value?.name || 'Unknown'}</Text>
        </View>
      ),
    },
  },
  {
    accessorKey: 'customBadge',
    header: 'Badge',
    field: 'custom',
    fieldProps: {
      render: (value: string, _row: any, onChange: (v: string) => void) => (
        <View
          flexDirection="row"
          gap="$1">
          {['premium', 'standard', 'trial'].map((badge) => (
            <View
              key={badge}
              backgroundColor={value === badge ? '$green5' : '$gray3'}
              padding="$1"
              borderRadius="$2"
              onPress={() => {
                onChange(badge);
              }}
              cursor="pointer">
              <Text
                fontSize="$2"
                color={value === badge ? '$green11' : '$gray11'}>
                {badge}
              </Text>
            </View>
          ))}
        </View>
      ),
    },
  },
];

const CustomFieldStory = () => {
  const [data, setData] = React.useState(customFieldData);
  return (
    <YStack
      gap="$4"
      flex={1}
      padding="$4">
      <Text
        fontSize="$5"
        fontWeight="bold">
        Custom Field Type
      </Text>
      <DataTable
        data={data}
        columns={customFieldColumns as DataTableColumn[]}
        onDataChange={setData as (data: DataTableData[]) => void}
        showRowNumbers={true}
        aria-label="Custom field type table"
      />
    </YStack>
  );
};

export const CustomField: Story = {
  render: () => <CustomFieldStory />,
};

// ============================================================================
// FILTERING & SEARCH STORIES
// ============================================================================

// Search with callback story (for DB-connected tables)
interface SearchableRow {
  id: number;
  name: string;
  email: string;
  department: string;
}

const searchableData: SearchableRow[] = [
  { id: 1, name: 'John Doe', email: 'john@example.com', department: 'Engineering' },
  { id: 2, name: 'Jane Smith', email: 'jane@example.com', department: 'Marketing' },
  { id: 3, name: 'Bob Johnson', email: 'bob@example.com', department: 'Sales' },
  { id: 4, name: 'Alice Williams', email: 'alice@example.com', department: 'HR' },
  { id: 5, name: 'Charlie Brown', email: 'charlie@example.com', department: 'Finance' },
];

const searchableColumns: DataTableColumn<SearchableRow>[] = [
  { accessorKey: 'id', header: 'ID', field: 'stepper' },
  { accessorKey: 'name', header: 'Name', field: 'input' },
  { accessorKey: 'email', header: 'Email', field: 'input' },
  {
    accessorKey: 'department',
    header: 'Department',
    field: 'select',
    fieldProps: {
      // >5 options: shorter single-select lists trip `select-too-few-options` (DG-CTRL-01).
      options: [
        { label: 'Engineering', value: 'Engineering' },
        { label: 'Marketing', value: 'Marketing' },
        { label: 'Sales', value: 'Sales' },
        { label: 'HR', value: 'HR' },
        { label: 'Finance', value: 'Finance' },
        { label: 'Legal', value: 'Legal' },
      ],
    },
  },
];

const GlobalSearchStory = () => {
  const data = searchableData;

  return (
    <YStack
      gap="$4"
      flex={1}
      padding="$4">
      <YStack gap="$2">
        <Text
          fontSize="$5"
          fontWeight="bold">
          Global Search
        </Text>
        <Text
          fontSize="$3"
          color="$gray11">
          Search across all visible columns
        </Text>
      </YStack>
      <DataTable
        data={data}
        columns={searchableColumns as DataTableColumn[]}
        enableGlobalSearch={true}
        enableFiltering={true}
        enableSorting={true}
        showRowNumbers={true}
        aria-label="Global search table"
      />
    </YStack>
  );
};

export const GlobalSearch: Story = {
  render: () => <GlobalSearchStory />,
};

// Server-side search simulation
const ServerSideSearchStory = () => {
  const [data, setData] = React.useState<SearchableRow[]>(searchableData);
  const [isLoading, setIsLoading] = React.useState(false);

  // Simulate server-side search
  const handleSearch = React.useCallback((searchTerm: string) => {
    setIsLoading(true);

    // Simulate API call delay
    setTimeout(() => {
      if (searchTerm) {
        const filtered = searchableData.filter(
          (row) =>
            row.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            row.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
            row.department.toLowerCase().includes(searchTerm.toLowerCase()),
        );
        setData(filtered);
      } else {
        setData(searchableData);
      }
      setIsLoading(false);
    }, 500);
  }, []);

  return (
    <YStack
      gap="$4"
      flex={1}
      padding="$4">
      <YStack gap="$2">
        <Text
          fontSize="$5"
          fontWeight="bold">
          Server-Side Search (Simulated)
        </Text>
        <Text
          fontSize="$3"
          color="$gray11">
          Search triggers server callback with debouncing
        </Text>
      </YStack>
      <DataTable
        data={data}
        columns={searchableColumns as DataTableColumn[]}
        enableGlobalSearch={true}
        manualFiltering={true}
        renderToolbar={(props) => (
          <DataTableToolbar
            {...props}
            onGlobalFilterChange={(value) => {
              props.onGlobalFilterChange(value);
              handleSearch(value);
            }}
          />
        )}
        initialState={{
          isLoading,
        }}
        showRowNumbers={true}
        aria-label="Server-side search table"
      />
    </YStack>
  );
};

export const ServerSideSearch: Story = {
  render: () => <ServerSideSearchStory />,
};

// ============================================================================
// ADVANCED FIELD TYPES STORIES
// ============================================================================

// Textarea Field Story
interface TextareaFieldRow {
  id: number;
  description: string;
  notes: string;
  comments: string;
}

const textareaFieldData: TextareaFieldRow[] = [
  {
    id: 1,
    description: 'This is a longer description that spans multiple lines.',
    notes: 'Important notes here',
    comments: 'User feedback',
  },
  {
    id: 2,
    description: 'Another description with more details about the item.',
    notes: 'Additional notes',
    comments: 'More comments',
  },
];

const textareaFieldColumns: DataTableColumn<TextareaFieldRow>[] = [
  { accessorKey: 'description', header: 'Description', field: 'textarea' },
  { accessorKey: 'notes', header: 'Notes', field: 'textarea' },
  { accessorKey: 'comments', header: 'Comments', field: 'textarea' },
];

const TextareaFieldStory = () => {
  const [data, setData] = React.useState(textareaFieldData);
  return (
    <YStack
      gap="$4"
      flex={1}
      padding="$4">
      <Text
        fontSize="$5"
        fontWeight="bold">
        Textarea Field Type
      </Text>
      <DataTable
        data={data}
        columns={textareaFieldColumns as DataTableColumn[]}
        onDataChange={setData as (data: DataTableData[]) => void}
        showRowNumbers={true}
        aria-label="Textarea field type table"
      />
    </YStack>
  );
};

export const TextareaField: Story = {
  render: () => <TextareaFieldStory />,
};

export const TextareaFieldReadOnly: Story = {
  args: {
    data: textareaFieldData,
    columns: textareaFieldColumns as DataTableColumn[],
    readOnly: true,
    showRowNumbers: true,
  },
};

// Signature Field Story
interface SignatureFieldRow {
  id: number;
  customerSignature: string | null;
  managerSignature: string | null;
  witnessSignature: string | null;
}

const signatureFieldData: SignatureFieldRow[] = [
  {
    id: 1,
    customerSignature: 'sig_data_1',
    managerSignature: null,
    witnessSignature: 'sig_data_3',
  },
  { id: 2, customerSignature: null, managerSignature: 'sig_data_2', witnessSignature: null },
  {
    id: 3,
    customerSignature: 'sig_data_4',
    managerSignature: 'sig_data_5',
    witnessSignature: 'sig_data_6',
  },
];

const signatureFieldColumns: DataTableColumn<SignatureFieldRow>[] = [
  { accessorKey: 'customerSignature', header: 'Customer', field: 'signature' },
  { accessorKey: 'managerSignature', header: 'Manager', field: 'signature' },
  { accessorKey: 'witnessSignature', header: 'Witness', field: 'signature' },
];

const SignatureFieldStory = () => {
  const [data, setData] = React.useState(signatureFieldData);
  return (
    <YStack
      gap="$4"
      flex={1}
      padding="$4">
      <Text
        fontSize="$5"
        fontWeight="bold">
        Signature Field Type
      </Text>
      <DataTable
        data={data}
        columns={signatureFieldColumns as DataTableColumn[]}
        onDataChange={setData as (data: DataTableData[]) => void}
        showRowNumbers={true}
        aria-label="Signature field type table"
      />
    </YStack>
  );
};

export const SignatureField: Story = {
  render: () => <SignatureFieldStory />,
};

export const SignatureFieldReadOnly: Story = {
  args: {
    data: signatureFieldData,
    columns: signatureFieldColumns as DataTableColumn[],
    readOnly: true,
    showRowNumbers: true,
  },
};

// File Field Story
interface FileFieldRow {
  id: number;
  document: string | null;
  attachment: string | null;
  report: string | null;
}

const fileFieldData: FileFieldRow[] = [
  { id: 1, document: 'report_2024.pdf', attachment: null, report: 'analysis.docx' },
  { id: 2, document: null, attachment: 'invoice.pdf', report: null },
  { id: 3, document: 'contract.pdf', attachment: 'receipt.jpg', report: 'summary.xlsx' },
];

const fileFieldColumns: DataTableColumn<FileFieldRow>[] = [
  { accessorKey: 'document', header: 'Document', field: 'fileupload' },
  { accessorKey: 'attachment', header: 'Attachment', field: 'fileupload' },
  { accessorKey: 'report', header: 'Report', field: 'fileupload' },
];

const FileFieldStory = () => {
  const [data, setData] = React.useState(fileFieldData);
  return (
    <YStack
      gap="$4"
      flex={1}
      padding="$4">
      <Text
        fontSize="$5"
        fontWeight="bold">
        File Field Type
      </Text>
      <DataTable
        data={data}
        columns={fileFieldColumns as DataTableColumn[]}
        onDataChange={setData as (data: DataTableData[]) => void}
        showRowNumbers={true}
        aria-label="File field type table"
      />
    </YStack>
  );
};

export const FileField: Story = {
  render: () => <FileFieldStory />,
};

export const FileFieldReadOnly: Story = {
  args: {
    data: fileFieldData,
    columns: fileFieldColumns as DataTableColumn[],
    readOnly: true,
    showRowNumbers: true,
  },
};

// Image Field Story
interface ImageFieldRow {
  id: number;
  avatar: string | null;
  productImage: string | null;
  thumbnail: string | null;
}

const imageFieldData: ImageFieldRow[] = [
  { id: 1, avatar: 'user1.jpg', productImage: 'product1.png', thumbnail: null },
  { id: 2, avatar: null, productImage: 'product2.png', thumbnail: 'thumb2.jpg' },
  { id: 3, avatar: 'user3.jpg', productImage: null, thumbnail: 'thumb3.jpg' },
];

const imageFieldColumns: DataTableColumn<ImageFieldRow>[] = [
  { accessorKey: 'avatar', header: 'Avatar', field: 'image' },
  { accessorKey: 'productImage', header: 'Product Image', field: 'image' },
  { accessorKey: 'thumbnail', header: 'Thumbnail', field: 'image' },
];

const ImageFieldStory = () => {
  const [data, setData] = React.useState(imageFieldData);
  return (
    <YStack
      gap="$4"
      flex={1}
      padding="$4">
      <Text
        fontSize="$5"
        fontWeight="bold">
        Image Field Type
      </Text>
      <DataTable
        data={data}
        columns={imageFieldColumns as DataTableColumn[]}
        onDataChange={setData as (data: DataTableData[]) => void}
        showRowNumbers={true}
        aria-label="Image field type table"
      />
    </YStack>
  );
};

export const ImageField: Story = {
  render: () => <ImageFieldStory />,
};

export const ImageFieldReadOnly: Story = {
  args: {
    data: imageFieldData,
    columns: imageFieldColumns as DataTableColumn[],
    readOnly: true,
    showRowNumbers: true,
  },
};

// Geolocation Field Story
interface GeolocationFieldRow {
  id: number;
  storeLocation: { lat: number; lng: number } | null;
  deliveryAddress: string | null;
  pickupPoint: { lat: number; lng: number } | null;
}

const geolocationFieldData: GeolocationFieldRow[] = [
  {
    id: 1,
    storeLocation: { lat: 40.7128, lng: -74.006 },
    deliveryAddress: '123 Main St, NYC',
    pickupPoint: null,
  },
  {
    id: 2,
    storeLocation: null,
    deliveryAddress: null,
    pickupPoint: { lat: 34.0522, lng: -118.2437 },
  },
  {
    id: 3,
    storeLocation: { lat: 51.5074, lng: -0.1278 },
    deliveryAddress: '456 High St, London',
    pickupPoint: { lat: 48.8566, lng: 2.3522 },
  },
];

const geolocationFieldColumns: DataTableColumn<GeolocationFieldRow>[] = [
  { accessorKey: 'storeLocation', header: 'Store Location', field: 'geolocation' },
  { accessorKey: 'deliveryAddress', header: 'Delivery Address', field: 'geolocation' },
  { accessorKey: 'pickupPoint', header: 'Pickup Point', field: 'geolocation' },
];

const GeolocationFieldStory = () => {
  const [data, setData] = React.useState(geolocationFieldData);
  return (
    <YStack
      gap="$4"
      flex={1}
      padding="$4">
      <Text
        fontSize="$5"
        fontWeight="bold">
        Geolocation Field Type
      </Text>
      <DataTable
        data={data}
        columns={geolocationFieldColumns as DataTableColumn[]}
        onDataChange={setData as (data: DataTableData[]) => void}
        showRowNumbers={true}
        aria-label="Geolocation field type table"
      />
    </YStack>
  );
};

export const GeolocationField: Story = {
  render: () => <GeolocationFieldStory />,
};

export const GeolocationFieldReadOnly: Story = {
  args: {
    data: geolocationFieldData,
    columns: geolocationFieldColumns as DataTableColumn[],
    readOnly: true,
    showRowNumbers: true,
  },
};

// Barcode Field Story
interface BarcodeFieldRow {
  id: number;
  sku: string;
  upc: string;
  serialNumber: string;
}

const barcodeFieldData: BarcodeFieldRow[] = [
  { id: 1, sku: 'SKU-001234', upc: '012345678901', serialNumber: 'SN-ABC123' },
  { id: 2, sku: 'SKU-005678', upc: '098765432109', serialNumber: 'SN-DEF456' },
  { id: 3, sku: 'SKU-009012', upc: '111222333444', serialNumber: 'SN-GHI789' },
];

const barcodeFieldColumns: DataTableColumn<BarcodeFieldRow>[] = [
  { accessorKey: 'sku', header: 'SKU', field: 'barcode' },
  { accessorKey: 'upc', header: 'UPC', field: 'barcode' },
  { accessorKey: 'serialNumber', header: 'Serial Number', field: 'barcode' },
];

const BarcodeFieldStory = () => {
  const [data, setData] = React.useState(barcodeFieldData);
  return (
    <YStack
      gap="$4"
      flex={1}
      padding="$4">
      <Text
        fontSize="$5"
        fontWeight="bold">
        Barcode Field Type
      </Text>
      <DataTable
        data={data}
        columns={barcodeFieldColumns as DataTableColumn[]}
        onDataChange={setData as (data: DataTableData[]) => void}
        showRowNumbers={true}
        aria-label="Barcode field type table"
      />
    </YStack>
  );
};

export const BarcodeField: Story = {
  render: () => <BarcodeFieldStory />,
};

export const BarcodeFieldReadOnly: Story = {
  args: {
    data: barcodeFieldData,
    columns: barcodeFieldColumns as DataTableColumn[],
    readOnly: true,
    showRowNumbers: true,
  },
};

// Slider Field Story
interface SliderFieldRow {
  id: number;
  volume: number;
  brightness: number;
  opacity: number;
}

const sliderFieldData: SliderFieldRow[] = [
  { id: 1, volume: 75, brightness: 100, opacity: 50 },
  { id: 2, volume: 30, brightness: 60, opacity: 80 },
  { id: 3, volume: 100, brightness: 25, opacity: 100 },
];

const sliderFieldColumns: DataTableColumn<SliderFieldRow>[] = [
  { accessorKey: 'volume', header: 'Volume', field: 'slider', fieldProps: { max: 100 } },
  {
    accessorKey: 'brightness',
    header: 'Brightness',
    field: 'slider',
    fieldProps: { max: 100 },
  },
  { accessorKey: 'opacity', header: 'Opacity', field: 'slider', fieldProps: { max: 100 } },
];

const SliderFieldStory = () => {
  const [data, setData] = React.useState(sliderFieldData);
  return (
    <YStack
      gap="$4"
      flex={1}
      padding="$4">
      <Text
        fontSize="$5"
        fontWeight="bold">
        Slider Field Type
      </Text>
      <DataTable
        data={data}
        columns={sliderFieldColumns as DataTableColumn[]}
        onDataChange={setData as (data: DataTableData[]) => void}
        showRowNumbers={true}
        aria-label="Slider field type table"
      />
    </YStack>
  );
};

export const SliderField: Story = {
  render: () => <SliderFieldStory />,
};

export const SliderFieldReadOnly: Story = {
  args: {
    data: sliderFieldData,
    columns: sliderFieldColumns as DataTableColumn[],
    readOnly: true,
    showRowNumbers: true,
  },
};

// Progress Field Story
interface ProgressFieldRow {
  id: number;
  taskProgress: number;
  downloadProgress: number;
  completionRate: number;
}

const progressFieldData: ProgressFieldRow[] = [
  { id: 1, taskProgress: 75, downloadProgress: 100, completionRate: 50 },
  { id: 2, taskProgress: 30, downloadProgress: 60, completionRate: 80 },
  { id: 3, taskProgress: 100, downloadProgress: 25, completionRate: 100 },
];

const progressFieldColumns: DataTableColumn<ProgressFieldRow>[] = [
  { accessorKey: 'taskProgress', header: 'Task Progress', field: 'progress' },
  { accessorKey: 'downloadProgress', header: 'Download', field: 'progress' },
  { accessorKey: 'completionRate', header: 'Completion', field: 'progress' },
];

const ProgressFieldStory = () => {
  const [data, setData] = React.useState(progressFieldData);
  return (
    <YStack
      gap="$4"
      flex={1}
      padding="$4">
      <Text
        fontSize="$5"
        fontWeight="bold">
        Progress Field Type
      </Text>
      <DataTable
        data={data}
        columns={progressFieldColumns as DataTableColumn[]}
        onDataChange={setData as (data: DataTableData[]) => void}
        showRowNumbers={true}
        aria-label="Progress field type table"
      />
    </YStack>
  );
};

export const ProgressField: Story = {
  render: () => <ProgressFieldStory />,
};

export const ProgressFieldReadOnly: Story = {
  args: {
    data: progressFieldData,
    columns: progressFieldColumns as DataTableColumn[],
    readOnly: true,
    showRowNumbers: true,
  },
};

// ============================================================================
// COLUMN LAYOUT STORIES
// ============================================================================

export const ColumnLayoutEqual: Story = {
  args: {
    data: sampleData,
    columns: basicColumns as DataTableColumn[],
    columnLayout: 'equal',
    enablePagination: true,
  },
};

export const ColumnLayoutAuto: Story = {
  args: {
    data: sampleData,
    columns: basicColumns as DataTableColumn[],
    columnLayout: 'auto',
    enablePagination: true,
  },
};

const ScrollLayoutStory = () => {
  const data = useMemo(() => generateUsers(20), []);
  return (
    <View padding="$4">
      <DataTable
        data={data}
        columns={columns}
        columnLayout="scroll"
        enablePagination={true}
        aria-label="Scroll layout table"
      />
    </View>
  );
};

export const ColumnLayoutScroll: Story = {
  render: () => <ScrollLayoutStory />,
};

// ============================================================================
// RESPONSIVE CARD LAYOUT STORIES
// ============================================================================

/**
 * Full-chrome card layout: search, filters, sorting, selection, and
 * pagination all operate on the card list. `layout="cards"` pins the
 * card list at any viewport so the story is inspectable at desktop
 * width; `layout="auto"` (the default) switches automatically below
 * the `$sm` breakpoint.
 */
const CardLayoutStory = () => {
  const data = useMemo(() => generateUsers(25), []);
  return (
    <View
      padding="$4"
      maxWidth={480}
      width="100%">
      <DataTable
        data={data}
        columns={columns}
        layout="cards"
        enableGlobalSearch={true}
        enableFiltering={true}
        enableSorting={true}
        enableRowSelection={true}
        enablePagination={true}
        initialState={{ pagination: { pageIndex: 1, pageSize: 10 } }}
        bulkActions={[
          {
            id: 'archive',
            label: 'Archive',
            onExecute: (_items: any[], clear: () => void) => {
              clear();
            },
          },
        ]}
        aria-label="Card layout table"
      />
    </View>
  );
};

export const CardLayout: Story = {
  render: () => <CardLayoutStory />,
};

/**
 * Subject-led document rows (Polaris Index): checkbox, title
 * with stacked meta, trailing status. Not a column grid.
 */
const documentListColumns: DataTableColumn<Person>[] = [
  { accessorKey: 'firstName', header: 'Name', meta: { role: 'title' } },
  { accessorKey: 'lastName', header: 'Last Name' },
  { accessorKey: 'email', header: 'Email' },
  { accessorKey: 'status', header: 'Status' },
];

export const DocumentList: Story = {
  render: () => (
    <View
      padding="$4"
      maxWidth={720}
      width="100%">
      <DataTable
        data={sampleData}
        columns={documentListColumns}
        layout="list"
        enableGlobalSearch
        enableSorting
        enableRowSelection
        enablePagination
        enableFiltering={false}
        initialState={{ pagination: { pageIndex: 0, pageSize: 8 } }}
        aria-label="Document list"
      />
    </View>
  ),
};

/** Default responsive behavior: grid at desktop width, cards below `$sm`. */
export const CardLayoutAuto: Story = {
  args: {
    data: sampleData,
    columns: basicColumns as DataTableColumn[],
    layout: 'auto',
    enableGlobalSearch: true,
    enableFiltering: true,
    enableSorting: true,
    enablePagination: true,
    initialState: {
      pagination: { pageIndex: 1, pageSize: 2 },
    },
  },
};

// ============================================================================
// HIDDEN-FIELD FILTERING (toolbar Filter surface)
// ============================================================================

/** Only 3 of the 11 user fields are visible columns. */
const hiddenFilterColumns: DataTableColumn<User>[] = [
  { accessorKey: 'firstName', header: FIRST_NAME_LABEL },
  { accessorKey: 'age', header: 'Age', field: 'stepper' },
  {
    accessorKey: 'status',
    header: 'Status',
    field: 'select',
    fieldProps: {
      // >5 options: shorter single-select lists trip `select-too-few-options` (DG-CTRL-01).
      options: [
        { label: 'Active', value: 'active' },
        { label: 'Inactive', value: 'inactive' },
        { label: 'Pending', value: 'pending' },
        { label: 'Draft', value: 'draft' },
        { label: 'Archived', value: 'archived' },
        { label: 'Blocked', value: 'blocked' },
      ],
    },
  },
];

/**
 * The rest of the record filters through the toolbar "Filter" surface:
 * searchable field list (visible columns grouped first, then "More
 * fields"), live-commit operator/value editor, and removable chips for
 * every active filter — the honest-state surface for filters on fields
 * with no visible column.
 */
const hiddenFilterFields = [
  { id: 'email', label: 'Email', type: 'text' as const },
  {
    id: 'department',
    label: 'Department',
    type: 'select' as const,
    options: [
      { label: 'Engineering', value: 'Engineering' },
      { label: 'Marketing', value: 'Marketing' },
      { label: 'Sales', value: 'Sales' },
      { label: 'HR', value: 'HR' },
      { label: 'Finance', value: 'Finance' },
    ],
  },
  { id: 'role', label: 'Role', type: 'text' as const },
  { id: 'salary', label: 'Salary', type: 'number' as const },
  { id: 'joinDate', label: 'Join Date', type: 'date' as const },
  { id: 'lastLogin', label: LAST_LOGIN_LABEL, type: 'date' as const },
];

const HiddenFieldFiltersStory = ({ syncWithUrl = false }: { syncWithUrl?: boolean }) => {
  const data = useMemo(() => generateUsers(40), []);
  return (
    <DataTable
      data={data}
      columns={hiddenFilterColumns}
      filterableFields={hiddenFilterFields}
      enableGlobalSearch
      enableFiltering
      enableSorting
      enablePagination
      syncWithUrl={syncWithUrl}
      initialState={{ pagination: { pageIndex: 1, pageSize: 10 } }}
      aria-label="Hidden field filters table"
    />
  );
};

export const HiddenFieldFilters: Story = {
  render: () => <HiddenFieldFiltersStory />,
};

/** Same table with URL sync — hidden-field filters serialize like column filters. */
export const HiddenFieldFiltersUrlSync: Story = {
  render: () => <HiddenFieldFiltersStory syncWithUrl />,
};

const CompoundCompositionStory = () => {
  const data = useMemo(() => generateUsers(30), []);
  return (
    <DataTable
      data={data}
      columns={columns}
      enableGlobalSearch={false}
      enableFiltering={false}
      enablePagination={false}
      initialState={{ pagination: { pageIndex: 1, pageSize: 10 } }}
      aria-label="Compound composition table">
      <DataTable.Toolbar enableFiltering={false} />
      <DataTable.Filters
        availableColumns={[
          { id: 'age', label: 'Age', type: 'number' },
          {
            id: 'department',
            label: 'Department',
            type: 'select',
            options: [
              { label: 'Engineering', value: 'Engineering', count: 12 },
              { label: 'Marketing', value: 'Marketing', count: 8 },
              { label: 'Sales', value: 'Sales', count: 6 },
              { label: 'HR', value: 'HR', count: 4 },
              { label: 'Finance', value: 'Finance', count: 3 },
            ],
          },
          { id: 'role', label: 'Role', type: 'text' },
        ]}
      />
      <DataTable.Pagination />
    </DataTable>
  );
};

export const CompoundComposition: Story = {
  render: () => <CompoundCompositionStory />,
};

// ============================================================================
// ROW PRESS (onRowPress — first-class row activation)
// ============================================================================

const rowPressColumns: DataTableColumn<User>[] = [
  { accessorKey: 'firstName', header: FIRST_NAME_LABEL },
  { accessorKey: 'department', header: 'Department' },
  {
    accessorKey: 'salary',
    header: 'Salary',
    align: 'right',
    cell: (info) => (
      <Text fontWeight="600">{formatCurrency(info.getValue() as number, { symbol: '$', fractionDigits: 'auto' })}</Text>
    ),
  },
  {
    id: 'row_actions',
    header: 'Actions',
    cell: () => (
      <Button
        size="$2"
        onPress={fn()}>
        Edit
      </Button>
    ),
  },
];

/**
 * onRowPress makes each row ONE pressable unit (LC-49/LC-50): click/tap
 * anywhere in the row activates, the row set exposes a single roving tab
 * stop (ArrowUp/Down + Home/End move it, Enter AND Space activate), and
 * `rowLabel` names each row for AT. Inner interactive controls — the
 * selection checkboxes and the per-row Edit button here — stay isolated:
 * pressing them never fires the row press.
 */
const RowPressStory = ({ body }: { body?: 'virtual' | 'list' }) => {
  const data = useMemo(() => generateUsers(8), []);
  return (
    <DataTable
      data={data}
      columns={rowPressColumns as DataTableColumn[]}
      enableRowSelection
      enableFiltering={false}
      enableGlobalSearch={false}
      enablePagination={false}
      onRowPress={fn()}
      rowLabel={(row) => (row as User).firstName}
      aria-label="Row press table"
      {...(body === 'list' ? { layout: 'list' as const } : {})}
      {...(body === 'virtual' ? { enableVirtualization: true, virtualizationHeight: 400 } : {})}
    />
  );
};

export const RowPress: Story = {
  render: () => <RowPressStory />,
  parameters: {
    docs: {
      description: {
        story:
          'First-class row activation: `onRowPress(row, index)` fires on click/tap anywhere in a row and on Enter/Space while the row is focused. One roving tab stop per row set (LC-49), arrow keys move it, and inner controls (selection checkboxes, buttons) never trigger the row press. `rowLabel` names rows and their selection checkboxes ("Select row User3").',
      },
    },
  },
};

export const RowPressVirtualized: Story = {
  render: () => <RowPressStory body="virtual" />,
  parameters: {
    docs: {
      description: {
        story:
          'The RowPress contract on virtual rows. A selected row hovers and presses off the fill it rests on, as in the grid (MPO-408).',
      },
    },
  },
};

export const RowPressList: Story = {
  render: () => <RowPressStory body="list" />,
  parameters: {
    docs: {
      description: {
        story:
          'The RowPress contract on the document list. A selected row hovers and presses off the fill it rests on, as in the grid (MPO-408).',
      },
    },
  },
};

// ============================================================================
// CUSTOM-CELL ALIGNMENT (DG-TBL-01 for custom renderers)
// ============================================================================

const alignColumns: DataTableColumn<User>[] = [
  {
    id: 'firstName',
    accessorKey: 'firstName',
    header: 'Name (left)',
    cell: (info) => <Text fontWeight="600">{String(info.getValue())}</Text>,
  },
  {
    id: 'age',
    accessorKey: 'age',
    header: 'Age (right)',
    align: 'right',
    cell: (info) => <Text>{String(info.getValue())}</Text>,
  },
  {
    id: 'salary',
    accessorKey: 'salary',
    header: 'Salary (right)',
    align: 'right',
    cell: (info) => (
      <Text fontWeight="600">{formatCurrency(info.getValue() as number, { symbol: '$', fractionDigits: 'auto' })}</Text>
    ),
  },
  {
    id: 'status',
    accessorKey: 'status',
    header: 'Status (center)',
    align: 'center',
    cell: (info) => <Text>{String(info.getValue())}</Text>,
  },
];

/**
 * Custom `cell` renderers inherit the column `align` through the table's
 * alignment container — no self-alignment. In the semantic-table
 * displayMode (columnLayout="auto") the cell box is display:table-cell
 * where flex justifyContent is a no-op; the wrapper restores the column
 * line for custom content (numerics share one right edge, LC-44).
 */
const CustomCellAlignmentStory = () => {
  const data = useMemo(() => generateUsers(6), []);
  return (
    <DataTable
      data={data}
      columns={alignColumns as DataTableColumn[]}
      columnLayout="auto"
      enableFiltering={false}
      enableGlobalSearch={false}
      enablePagination={false}
      readOnly
      aria-label="Custom cell alignment table"
    />
  );
};

export const CustomCellAlignment: Story = {
  render: () => <CustomCellAlignmentStory />,
  parameters: {
    docs: {
      description: {
        story:
          'Column `align` applies to CUSTOM cell renderers exactly like built-in field cells: the table wraps flexRender output in an alignment container (`data-cell-align`), so numeric custom cells right-align to one shared edge without any consumer alignment code.',
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Running balance (MPO-250) — a column that is a function of every row before
// it. The fold runs BEFORE pagination, so page two continues instead of
// restarting at zero, and its final value paints a footer total.
// ---------------------------------------------------------------------------

interface Posting extends DataTableData {
  id: string;
  date: string;
  payee: string;
  /** Cents. Integers here; a real ledger uses the "money" column type. */
  amount: number;
  /** Derived by the accumulator — declared so a column can name it. */
  running?: number;
}

const registerPostings: Posting[] = [
  { id: 'P-01', date: '2026-01-02', payee: 'Opening deposit', amount: 250_000 },
  { id: 'P-02', date: '2026-01-04', payee: 'Rent', amount: -180_000 },
  { id: 'P-03', date: '2026-01-05', payee: 'Grocers', amount: -8450 },
  { id: 'P-04', date: '2026-01-07', payee: 'Payroll', amount: 412_300 },
  { id: 'P-05', date: '2026-01-09', payee: 'Utilities', amount: -14_600 },
  { id: 'P-06', date: '2026-01-11', payee: 'Coffee roaster', amount: -1875 },
  { id: 'P-07', date: '2026-01-14', payee: 'Refund', amount: 3200 },
  { id: 'P-08', date: '2026-01-16', payee: 'Insurance', amount: -62_000 },
  { id: 'P-09', date: '2026-01-19', payee: 'Consulting', amount: 150_000 },
  { id: 'P-10', date: '2026-01-21', payee: 'Hardware', amount: -47_990 },
  { id: 'P-11', date: '2026-01-24', payee: 'Payroll', amount: 412_300 },
  { id: 'P-12', date: '2026-01-27', payee: 'Taxes', amount: -305_000 },
];

const cents = (value: number | undefined) =>
  value == null ? '' : formatCurrency(value / 100, { symbol: '$', fractionDigits: 'auto' });

/**
 * The fold. A module constant, not an inline literal — the table refolds
 * whenever this identity changes.
 */
const registerBalance: RowAccumulator<Posting, number> = {
  initial: 0,
  reduce: (carried, row) => carried + row.amount,
  derive: (carried) => ({ running: carried }),
  order: (a, b) => {
    if (a.date < b.date) {
      return -1;
    }
    return a.date > b.date ? 1 : 0;
  },
  total: (carried) => carried,
};

/** Reads the fold's end value off the table state — the total row. */
const RegisterTotal = () => {
  const context = useDataTableState();
  return <Text fontWeight="700">{cents(context?.computed.foldTotal as number | undefined)}</Text>;
};

const registerColumns: DataTableColumn<Posting>[] = [
  { id: 'date', accessorKey: 'date', header: 'Date', width: 120 },
  { id: 'payee', accessorKey: 'payee', header: 'Payee', sortable: true },
  {
    id: 'amount',
    accessorKey: 'amount',
    header: 'Amount',
    align: 'right',
    cell: (info) => <Text>{cents(info.getValue() as number)}</Text>,
    footer: () => <Text fontWeight="700">Total</Text>,
  },
  {
    id: 'running',
    accessorKey: 'running',
    header: 'Balance',
    align: 'right',
    // Not sortable on purpose: sorting a fold column reorders it WITHOUT
    // refolding, so the figures stop reading down the column as a
    // progression. The contract is on RowAccumulator.
    sortable: false,
    cell: (info) => <Text fontWeight="600">{cents(info.getValue() as number)}</Text>,
    footer: () => <RegisterTotal />,
  },
];

export const RunningBalance: Story = {
  render: () => (
    <DataTable
      data={registerPostings}
      columns={registerColumns as DataTableColumn[]}
      rowAccumulator={registerBalance as RowAccumulator}
      layout="table"
      columnLayout="auto"
      enableFiltering={false}
      enableGlobalSearch={false}
      initialState={{ pagination: { pageIndex: 0, pageSize: 5 } }}
      aria-label="Account register with a running balance"
    />
  ),
  parameters: {
    docs: {
      description: {
        story:
          'A running balance is a FOLD over the rows in a total order, so it has to be computed before the table paginates. Page through this table: the Balance column continues onto page two rather than restarting, because `rowAccumulator` runs once over the whole row set before the row model. Its `total` is read once at the end and painted in the footer through `useDataTableState().computed.foldTotal`. Sorting on Payee reorders rows for display and does NOT refold — the balance stays attached to its own row.',
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Money column (MPO-252) — a Currency field is a decimal STRING. It sorts
// numerically, filters with the numeric operators, formats from the ROW's own
// currency, and totals per currency because two currencies never convert.
// ---------------------------------------------------------------------------

interface Charge extends DataTableData {
  id: string;
  vendor: string;
  amount: string;
  currency: string;
}

const charges: Charge[] = [
  { id: 'C-1', vendor: 'Coffee roaster', amount: '9.00', currency: 'USD' },
  { id: 'C-2', vendor: 'Bookshop', amount: '10.00', currency: 'USD' },
  { id: 'C-3', vendor: 'Chai stall', amount: '250.75', currency: 'INR' },
  { id: 'C-4', vendor: 'Refund', amount: '-455.87', currency: 'USD' },
  { id: 'C-5', vendor: 'Hosting', amount: '1200.00', currency: 'INR' },
  { id: 'C-6', vendor: 'Domain', amount: '9.99', currency: 'USD' },
];

/** One figure per currency — the mixed-currency rule, rendered. */
const ChargeTotals = () => {
  const totals = sumMoneyByCurrency(
    charges,
    (row) => row.amount,
    (row) => row.currency,
  );
  return (
    <YStack>
      {Object.entries(totals).map(([code, total]) => (
        <Text
          key={code}
          fontWeight="700">
          {formatMoney(total, code)}
        </Text>
      ))}
    </YStack>
  );
};

const chargeColumns: DataTableColumn<Charge>[] = [
  { id: 'vendor', accessorKey: 'vendor', header: 'Vendor' },
  { id: 'currency', accessorKey: 'currency', header: 'Currency' },
  {
    id: 'amount',
    accessorKey: 'amount',
    header: 'Amount',
    field: 'money',
    // Safe now: the money type carries an exact decimal comparator, so
    // "9.00" sorts BELOW "10.00". As a "text" column this was silently wrong.
    sortable: true,
    filterable: true,
    fieldProps: { currencyField: 'currency' },
    footer: () => <ChargeTotals />,
  },
];

export const MoneyColumn: Story = {
  render: () => (
    <DataTable
      data={charges}
      columns={chargeColumns as DataTableColumn[]}
      layout="table"
      columnLayout="auto"
      enablePagination={false}
      readOnly
      aria-label="Charges with a money column"
    />
  ),
  parameters: {
    docs: {
      description: {
        story:
          '`field: "money"` types a column as a decimal STRING rather than as text. Sort on Amount: `9.00` orders below `10.00`, which the text fallback got backwards in silence. The column filter offers `is less than` / `is greater than` / `between` instead of `contains`. Each row formats in its OWN currency (`fieldProps.currencyField`), and the footer totals PER currency — two currencies are two figures and neither converts, because there is no rate in the table.',
      },
    },
  },
};

const widthRows = [
  { id: '1', rank: 1, label: 'A long account label to inspect clipping', score: 92 },
  { id: '2', rank: 2, label: 'Another account', score: 85 },
];
const declaredWidthColumns: DataTableColumn<(typeof widthRows)[number]>[] = [
  { accessorKey: 'rank', header: 'Rank', width: 48, footer: '2' },
  {
    accessorKey: 'label',
    header: 'Account',
    width: 320,
    minWidth: 200,
    maxWidth: 400,
    footer: 'Two accounts',
  },
  { accessorKey: 'score', header: 'Score', width: 80, footer: '177' },
];

export const ColumnWidthContract: Story = {
  // oxlint-disable-next-line eslint/func-name-matching -- a capitalized name lets React treat this render function as a component so it may call hooks
  render: function ColumnWidthExample(args) {
    const [columnLayout, setColumnLayout] = React.useState<'equal' | 'scroll' | 'auto'>('scroll');
    const [resizing, setResizing] = React.useState(false);
    return (
      <YStack
        gap="$3"
        width="100%">
        <Text>Declared widths: Rank 48px, Account 320px (200–400px), Score 80px.</Text>
        <View
          flexDirection="row"
          flexWrap="wrap"
          gap="$2">
          {(['equal', 'scroll', 'auto'] as const).map((mode) => (
            <Button
              key={mode}
              aria-pressed={columnLayout === mode}
              onPress={() => {
                setColumnLayout(mode);
              }}>
              {mode}
            </Button>
          ))}
          <Button
            aria-pressed={resizing}
            onPress={() => {
              setResizing((enabled) => !enabled);
            }}>
            Resizing {resizing ? 'on' : 'off'}
          </Button>
        </View>
        <Text>
          Pin Rank then Account with their header controls to inspect offsets. Switch to equal with resizing off to
          compare pinned fixed widths and unpinned equal widths. In scroll, narrow the viewport to inspect horizontal
          overflow and footer alignment.
        </Text>
        <DataTable
          {...args}
          data={widthRows}
          columns={declaredWidthColumns as DataTableColumn[]}
          layout="table"
          columnLayout={columnLayout}
          enableColumnResizing={resizing}
          enableColumnPinning
          enablePagination={false}
          readOnly
        />
      </YStack>
    );
  },
};

const narrowHeaderRows = [
  { id: '1', account: 'acme-website', quantity: 142, status: 'Live', owner: 'Rivera' },
  { id: '2', account: 'tamagui-docs', quantity: 89, status: 'Draft', owner: 'Okafor' },
  { id: '3', account: 'mobile-app', quantity: 34, status: 'Live', owner: 'Lindqvist' },
];

const narrowHeaderColumns: DataTableColumn<(typeof narrowHeaderRows)[number]>[] = [
  { id: 'account', accessorKey: 'account', header: 'Customer account (input)', width: 104 },
  {
    id: 'quantity',
    accessorKey: 'quantity',
    header: 'Quantity (stepper)',
    align: 'right',
    width: 104,
  },
  { id: 'status', accessorKey: 'status', header: 'Status (select)', width: 104 },
  { id: 'owner', accessorKey: 'owner', header: 'Responsibilities', width: 104 },
];

/**
 * MPO-336 / LC-10: every column is narrower than its header label plus the
 * sort and filter glyphs. Each label wraps inside its own header cell, a
 * single long word breaks rather than overflowing, and the glyphs stay in
 * their column. Quantity is right-aligned (numbers, DG-TBL-01), the case
 * that used to spill left over the previous column.
 */
export const NarrowHeaders: Story = {
  args: {
    data: narrowHeaderRows,
    columns: narrowHeaderColumns as DataTableColumn[],
    layout: 'table',
    columnLayout: 'scroll',
    enableSorting: true,
    enableFiltering: true,
    enablePagination: false,
    readOnly: true,
  },
};
