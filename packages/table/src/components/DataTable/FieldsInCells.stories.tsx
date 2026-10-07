/**
 * Visual harness for "fields in cells" — renders one column per field type
 * in both readOnly and editable modes so we can eyeball regressions when
 * the FieldDisplay dispatcher is expanded.
 */

import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import React from 'react';
import { fn } from 'storybook/test';
import { Text, View, YStack, H3 } from 'tamagui';

import type { DataTableColumn, DataTableData } from '../../types';

import { DataTable } from './index';

interface SampleRow extends DataTableData {
  id: string;
  name: string;
  count: number;
  price: number;
  status: string;
  framework: string;
  active: boolean;
  notify: boolean;
  joined: string;
  shipBy: string;
  range: string;
  rangeEnd: string;
  rating: number;
  progress: number;
  color: string;
  tags: string[];
}

const sampleData: SampleRow[] = [
  {
    id: '1',
    name: 'acme-website',
    count: 142,
    price: 29.99,
    status: 'live',
    framework: 'next',
    active: true,
    notify: true,
    joined: '2024-03-12',
    shipBy: '2024-11-20T14:30:00Z',
    range: '2024-11-07',
    rangeEnd: '2024-11-15',
    rating: 4,
    progress: 78,
    color: '#9747ff',
    tags: ['frontend', 'mobile'],
  },
  {
    id: '2',
    name: 'tamagui-docs',
    count: 89,
    price: 0,
    status: 'live',
    framework: 'tamagui',
    active: true,
    notify: false,
    joined: '2023-08-04',
    shipBy: '2024-12-01T09:00:00Z',
    range: '2024-10-01',
    rangeEnd: '2024-10-30',
    rating: 5,
    progress: 100,
    color: '#30a46c',
    tags: ['docs'],
  },
  {
    id: '3',
    name: 'mobile-app',
    count: 34,
    price: 1299,
    status: 'draft',
    framework: 'expo',
    active: false,
    notify: true,
    joined: '2024-06-21',
    shipBy: null as any,
    range: null as any,
    rangeEnd: null as any,
    rating: 3,
    progress: 42,
    color: '#ebbc00',
    tags: [],
  },
];

// DG-CTRL-01: keep Select/Combobox fixtures >5 options — shorter lists trip
// the `select-too-few-options` guardrail (UX-P19).
const statusOptions = [
  { label: 'Live', value: 'live' },
  { label: 'Building', value: 'building' },
  { label: 'Draft', value: 'draft' },
  { label: 'Failed', value: 'failed' },
  { label: 'Paused', value: 'paused' },
  { label: 'Archived', value: 'archived' },
];

const frameworkOptions = [
  { label: 'Next.js', value: 'next' },
  { label: 'Tamagui', value: 'tamagui' },
  { label: 'Expo', value: 'expo' },
  { label: 'Astro', value: 'astro' },
  { label: 'Hono', value: 'hono' },
  { label: 'Vite', value: 'vite' },
];

const columns: DataTableColumn<SampleRow>[] = [
  {
    accessorKey: 'name',
    header: 'Name (input)',
    field: 'input',
  },
  {
    accessorKey: 'count',
    header: 'Count (stepper)',
    field: 'stepper',
    fieldProps: { min: 0, max: 9999 },
  },
  {
    accessorKey: 'price',
    header: 'Price (currency)',
    field: 'stepper',
    fieldProps: { precision: 2, currency: 'USD' },
  },
  {
    accessorKey: 'status',
    header: 'Status (select)',
    field: 'select',
    fieldProps: { options: statusOptions },
  },
  {
    accessorKey: 'framework',
    header: 'Framework (combobox)',
    field: 'combobox',
    fieldProps: { options: frameworkOptions },
  },
  {
    accessorKey: 'active',
    header: 'Active (checkbox)',
    field: 'checkbox',
  },
  {
    accessorKey: 'notify',
    header: 'Notify (switch)',
    field: 'switch',
  },
  {
    accessorKey: 'joined',
    header: 'Joined (date)',
    field: 'datepicker',
  },
  {
    accessorKey: 'shipBy',
    header: 'Ship by (datetime)',
    field: 'datetimepicker',
  },
  {
    accessorKey: 'rating',
    header: 'Rating',
    field: 'rating',
    fieldProps: { maxRating: 5 },
  },
  {
    accessorKey: 'progress',
    header: 'Progress',
    field: 'progress',
    fieldProps: { min: 0, max: 100 },
  },
  {
    accessorKey: 'color',
    header: 'Color',
    field: 'colorpicker',
  },
];

const meta: Meta<typeof DataTable> = {
  title: 'Table/Fields in Cells',
  component: DataTable,
  parameters: { layout: 'fullscreen' },
  args: {
    onStateChange: fn(),
    onCellChange: fn(),
    onDataChange: fn(),
  },
  argTypes: {
    readOnly: { control: 'boolean' },
    compact: { control: 'boolean' },
    disabled: { control: 'boolean' },
    // compact is not pinned — density rides the Preset / Storybook control.
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

/**
 * Stateful harness so controlled fields (select, checkbox, switch, rating,
 * colorpicker, …) actually persist edits in-story. Committed data is echoed
 * below the table (testID "fields-in-cells-data") for verification.
 */
function WiredTable<TData extends DataTableData>({
  data: initialData,
  columns: tableColumns,
  onDataChange,
  onCellChange,
  ...rest
}: {
  data: TData[];
  columns: DataTableColumn<TData>[];
  [key: string]: any;
}) {
  const [data, setData] = React.useState<TData[]>(initialData);
  return (
    <YStack
      flex={1}
      minHeight={0}
      gap="$3">
      <YStack
        flex={1}
        minHeight={0}>
        <DataTable<TData>
          data={data}
          columns={tableColumns}
          onDataChange={(next: TData[]) => {
            setData(next);
            onDataChange?.(next);
          }}
          onCellChange={onCellChange}
          {...rest}
        />
      </YStack>
      <Text
        testID="fields-in-cells-data"
        fontSize="$1"
        color="$placeholderColor"
        fontFamily="$mono">
        committed: {JSON.stringify(data)}
      </Text>
    </YStack>
  );
}

// These stories demo cell FIELDS on a 3-row single-page fixture; pagination
// chrome is off so the footer never rests on bare-disabled nav (UX-P19).
export const ReadOnly: Story = {
  render: (args) => (
    <YStack
      gap="$4"
      flex={1}
      minHeight={0}>
      <YStack gap="$2">
        <H3 fontWeight="400">Read-only — every cell routes through FieldDisplay</H3>
        <Text color="$placeholderColor">Lightweight view-only render per field type. No edit UI mounted.</Text>
      </YStack>
      <YStack
        flex={1}
        minHeight={0}>
        <DataTable<SampleRow>
          data={sampleData}
          columns={columns}
          enablePagination={false}
          {...(args as any)}
          readOnly
        />
      </YStack>
    </YStack>
  ),
};

export const Editable: Story = {
  render: (args) => (
    <YStack
      gap="$4"
      flex={1}
      minHeight={0}>
      <YStack gap="$2">
        <H3 fontWeight="400">Editable — cells mount the full Edit field component</H3>
        <Text color="$placeholderColor">
          Same column set, edit mode, wired: onDataChange commits edits to story state. Use this view to compare field
          heights and spot popover-clipping issues against the read-only baseline above.
        </Text>
      </YStack>
      <WiredTable<SampleRow>
        columns={columns}
        enablePagination={false}
        {...(args as any)}
        data={sampleData}
      />
    </YStack>
  ),
};

// ── Extended coverage: field types missing from the core harness ──

interface ExtendedRow extends DataTableData {
  id: string;
  summary: string;
  volume: number;
  priority: string;
  format: string;
  standup: string;
  sprint: { start: Date | null; end: Date | null };
  holidays: Date[];
  runtime: number;
  phone: string;
  pin: string;
}

const extendedData: ExtendedRow[] = [
  {
    id: '1',
    summary: 'Refactor auth flow\nacross web + native',
    volume: 65,
    priority: 'high',
    format: 'bold',
    standup: '09:30',
    sprint: { start: new Date('2024-11-04'), end: new Date('2024-11-15') },
    holidays: [new Date('2024-11-28'), new Date('2024-11-29')],
    runtime: 5400,
    phone: '+15125551234',
    pin: '1234',
  },
  {
    id: '2',
    summary: 'Ship the table field matrix',
    volume: 30,
    priority: 'medium',
    format: 'italic',
    standup: '14:00',
    sprint: { start: new Date('2024-12-02'), end: new Date('2024-12-13') },
    holidays: [new Date('2024-12-25')],
    runtime: 900,
    phone: '+918074052136',
    pin: '9876',
  },
];

const priorityOptions = [
  { label: 'Low', value: 'low' },
  { label: 'Medium', value: 'medium' },
  { label: 'High', value: 'high' },
];

const formatOptions = [
  { label: 'Bold', value: 'bold' },
  { label: 'Italic', value: 'italic' },
  { label: 'Underline', value: 'underline' },
];

const extendedColumns: DataTableColumn<ExtendedRow>[] = [
  { accessorKey: 'summary', header: 'Summary (textarea)', field: 'textarea' },
  {
    accessorKey: 'volume',
    header: 'Volume (slider)',
    field: 'slider',
    fieldProps: { min: 0, max: 100, step: 5 },
  },
  {
    accessorKey: 'priority',
    header: 'Priority (radiogroup)',
    field: 'radiogroup',
    fieldProps: { options: priorityOptions },
  },
  {
    accessorKey: 'format',
    header: 'Format (togglegroup)',
    field: 'togglegroup',
    fieldProps: { options: formatOptions },
  },
  {
    accessorKey: 'standup',
    header: 'Standup (timepicker)',
    field: 'timepicker',
    fieldProps: { timeFormat: '24h' },
  },
  { accessorKey: 'sprint', header: 'Sprint (daterange)', field: 'daterangepicker' },
  { accessorKey: 'holidays', header: 'Holidays (multidate)', field: 'multidatepicker' },
  { accessorKey: 'runtime', header: 'Runtime (duration)', field: 'duration' },
  {
    accessorKey: 'phone',
    header: 'Phone',
    field: 'phoneinput',
    fieldProps: { defaultCountry: 'US' },
  },
  { accessorKey: 'pin', header: 'PIN (otp)', field: 'otp', fieldProps: { otpLength: 4 } },
];

export const EditableExtended: Story = {
  render: (args) => (
    <YStack
      gap="$4"
      flex={1}
      minHeight={0}>
      <YStack gap="$2">
        <H3 fontWeight="400">Extended field types — textarea, slider, radio, toggle, time, ranges, otp</H3>
        <Text color="$placeholderColor">
          The field types the core harness omits: textarea, slider, radiogroup, togglegroup, timepicker,
          daterangepicker, multidatepicker, duration, phoneinput, otp. All wired through onDataChange.
        </Text>
      </YStack>
      <WiredTable<ExtendedRow>
        columns={extendedColumns}
        enablePagination={false}
        {...(args as any)}
        data={extendedData}
      />
    </YStack>
  ),
};

export const ReadOnlyExtended: Story = {
  render: (args) => (
    <YStack
      gap="$4"
      flex={1}
      minHeight={0}>
      <YStack gap="$2">
        <H3 fontWeight="400">Extended field types — read-only</H3>
      </YStack>
      <YStack
        flex={1}
        minHeight={0}>
        <DataTable<ExtendedRow>
          data={extendedData}
          columns={extendedColumns}
          enablePagination={false}
          {...(args as any)}
          readOnly
        />
      </YStack>
    </YStack>
  ),
};

// ── Heavy editors: cell shows a summary, click opens the modal editor ──

interface HeavyRow extends DataTableData {
  id: string;
  note: string;
  sku: string;
  attachment: string;
  photo: string;
  signature: string;
  site: { lat: number; lng: number };
  brief: string;
  readme: string;
  snippet: string;
}

const heavyData: HeavyRow[] = [
  {
    id: '1',
    note: 'Ping @alice when the build is green',
    sku: '0123456789012',
    attachment: 'report.pdf',
    photo: 'https://i.pravatar.cc/100?img=12',
    signature: '',
    site: { lat: 30.2672, lng: -97.7431 },
    brief: '<p>Launch plan for <strong>Q4</strong></p>',
    readme: '# Setup\n\nRun `make prepare`.',
    snippet: 'function add(a, b) {\n  return a + b;\n}',
  },
  {
    id: '2',
    note: 'Waiting on @bob for the API keys',
    sku: '9780201379624',
    attachment: '',
    photo: '',
    signature: '',
    site: { lat: 12.9716, lng: 77.5946 },
    brief: '',
    readme: '',
    snippet: '',
  },
];

const mentionUsers = [
  { id: 'alice', display: 'Alice' },
  { id: 'bob', display: 'Bob' },
];

const heavyColumns: DataTableColumn<HeavyRow>[] = [
  {
    accessorKey: 'note',
    header: 'Note (mention)',
    field: 'mentioninput',
    fieldProps: { mentions: mentionUsers },
  },
  { accessorKey: 'sku', header: 'SKU (barcode)', field: 'barcode' },
  { accessorKey: 'attachment', header: 'File', field: 'fileupload' },
  { accessorKey: 'photo', header: 'Photo (image)', field: 'image' },
  { accessorKey: 'signature', header: 'Signature', field: 'signature' },
  { accessorKey: 'site', header: 'Site (geo)', field: 'geolocation' },
  { accessorKey: 'brief', header: 'Brief (richtext)', field: 'richtexteditor' },
  { accessorKey: 'readme', header: 'Readme (markdown)', field: 'markdowneditor' },
  { accessorKey: 'snippet', header: 'Snippet (code)', field: 'codeeditor' },
];

export const EditableHeavy: Story = {
  render: (args) => (
    <YStack
      gap="$4"
      flex={1}
      minHeight={0}>
      <YStack gap="$2">
        <H3 fontWeight="400">Heavy editors — mention, barcode, file, image, signature, geo, rich text, code</H3>
        <Text color="$placeholderColor">
          Edits too big for the cell: the cell shows a compact FieldDisplay summary and clicking opens the modal editor
          (CellModalEditor). All wired through onDataChange.
        </Text>
      </YStack>
      <WiredTable<HeavyRow>
        columns={heavyColumns}
        enablePagination={false}
        {...(args as any)}
        data={heavyData}
      />
    </YStack>
  ),
};
