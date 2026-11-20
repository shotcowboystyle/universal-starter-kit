/**
 * DataTableCell — per-field-type cell stories.
 *
 * Contract: every cell hosts any field; each field has a read (FieldDisplay)
 * and an edit rendering; edits too big for the cell open in a popover (option
 * groups) or modal editor (CellModalEditor) so the row never grows (LC-06).
 * DataTableCell is standalone — value/onChange, no DataTable context required.
 *
 * Each *Field story renders the SAME state in edit mode and read mode inside
 * real table-primitive cells, and echoes the committed value (testID
 * "committed-value") so edit persistence is verifiable.
 */

import { Table } from '@repo/table-primitives';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import React from 'react';
import { fn } from 'storybook/test';
import { Text, View, XStack, YStack } from 'tamagui';

import type { DataTableCellRenderContext, DataTableField, DataTableFieldProps } from '../../types';

import { DataTableCell } from './index';

// Custom renderers receive the cell's honest state as the 4th argument and
// must go non-interactive while read-only (commits are blocked there).
const customCellRender = (
  value: any,
  _row: any,
  onChange: (value: any) => void,
  context?: DataTableCellRenderContext,
) =>
  context?.readOnly || context?.disabled ? (
    <Text fontSize="$2">{String(value)}</Text>
  ) : (
    <Text
      fontSize="$2"
      color="$blue10"
      cursor="pointer"
      onPress={() => {
        onChange(`${value}!`);
      }}>
      {String(value)} (press to append !)
    </Text>
  );

const FIELD_TYPES: DataTableField[] = [
  'input',
  'textarea',
  'mentioninput',
  'stepper',
  'slider',
  'select',
  'combobox',
  'radiogroup',
  'togglegroup',
  'checkbox',
  'switch',
  'datepicker',
  'datetimepicker',
  'timepicker',
  'daterangepicker',
  'multidatepicker',
  'duration',
  'colorpicker',
  'phoneinput',
  'otp',
  'barcode',
  'rating',
  'progress',
  'fileupload',
  'image',
  'signature',
  'geolocation',
  'richtexteditor',
  'markdowneditor',
  'codeeditor',
  'custom',
];

const meta: Meta<typeof DataTableCell> = {
  title: 'Table/DataTableCell',
  component: DataTableCell,
  parameters: {
    status: { type: 'stable' },
  },
  args: {
    onChange: fn(),
  },
  argTypes: {
    field: { control: 'select', options: FIELD_TYPES },
    readOnly: { control: 'boolean' },
    disabled: { control: 'boolean' },
    compact: { control: 'boolean' },
    size: { control: 'text' },
  },
};

export default meta;
type Story = StoryObj<typeof DataTableCell>;

// ── Harness ───────────────────────────────────────────────────

interface CellSpec {
  field: DataTableField;
  initialValue: unknown;
  fieldProps?: DataTableFieldProps;
  /** Human column header — feeds the chromeless cell trigger's accessible name. */
  columnLabel?: string;
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- display boundary: renders whatever a field committed, of any field type
const serialize = (value: unknown): string => {
  const json = JSON.stringify(value);
  return json ?? 'undefined';
};

/** One field type: edit cell and read cell share the same committed state. */
const CellHarness = ({ field, initialValue, fieldProps, columnLabel }: CellSpec) => {
  const [value, setValue] = React.useState<unknown>(initialValue);
  return (
    <YStack
      gap="$4"
      padding="$4"
      maxWidth={640}>
      <YStack gap="$2">
        <Text
          fontSize="$3"
          fontWeight="600">
          Edit mode
        </Text>
        <Table aria-label={`${field} cell (edit)`}>
          <Table.Body>
            <Table.Row>
              <Table.Cell>
                <DataTableCell
                  field={field}
                  value={value}
                  onChange={setValue}
                  fieldProps={fieldProps}
                  columnId={field}
                  columnLabel={columnLabel}
                  rowIndex={0}
                />
              </Table.Cell>
            </Table.Row>
          </Table.Body>
        </Table>
      </YStack>
      <YStack gap="$2">
        <Text
          fontSize="$3"
          fontWeight="600">
          Read mode (same value)
        </Text>
        <Table aria-label={`${field} cell (read)`}>
          <Table.Body>
            <Table.Row>
              <Table.Cell>
                <DataTableCell
                  field={field}
                  value={value}
                  onChange={setValue}
                  fieldProps={fieldProps}
                  readOnly
                  columnId={field}
                  columnLabel={columnLabel}
                  rowIndex={0}
                />
              </Table.Cell>
            </Table.Row>
          </Table.Body>
        </Table>
      </YStack>
      <Text
        testID="committed-value"
        fontSize="$2"
        color="$color10"
        fontFamily="$mono">
        committed: {serialize(value)}
      </Text>
    </YStack>
  );
};

const makeCellStory = (spec: CellSpec): Story => ({
  render: () => <CellHarness {...spec} />,
});

// ── Shared fixtures ───────────────────────────────────────────

const RANGE_START = '2024-11-07';

// DG-CTRL-01: >5 options so select-family cell fixtures don't trip the
// `select-too-few-options` guardrail (UX-P19).
const statusOptions = [
  { label: 'Live', value: 'live' },
  { label: 'Building', value: 'building' },
  { label: 'Draft', value: 'draft' },
  { label: 'Failed', value: 'failed' },
  { label: 'Paused', value: 'paused' },
  { label: 'Archived', value: 'archived' },
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

const mentionUsers = [
  { id: 'alice', display: 'Alice' },
  { id: 'bob', display: 'Bob' },
];

// ── Overview: all 31 field types, read vs edit, one screen ────

const OverviewRow = ({ field, initialValue, fieldProps }: CellSpec) => {
  const [value, setValue] = React.useState<unknown>(initialValue);
  return (
    <XStack
      gap="$3"
      alignItems="center"
      borderBottomWidth={1}
      borderColor="$borderColor">
      <View width={130}>
        <Text
          fontSize="$2"
          fontFamily="$mono">
          {field}
        </Text>
      </View>
      <View
        width={260}
        paddingVertical="$1.5">
        <DataTableCell
          field={field}
          value={value}
          onChange={setValue}
          fieldProps={fieldProps}
          columnId={field}
          rowIndex={0}
        />
      </View>
      <View
        width={200}
        paddingVertical="$1.5">
        <DataTableCell
          field={field}
          value={value}
          onChange={setValue}
          fieldProps={fieldProps}
          readOnly
          columnId={field}
          rowIndex={1}
        />
      </View>
    </XStack>
  );
};

const overviewSpecs: CellSpec[] = [
  { field: 'input', initialValue: 'acme-website' },
  { field: 'textarea', initialValue: 'Multi-line\ndescription text' },
  {
    field: 'mentioninput',
    initialValue: 'Ping @alice about the launch',
    fieldProps: { mentions: mentionUsers },
  },
  { field: 'stepper', initialValue: 42, fieldProps: { min: 0, max: 100 } },
  { field: 'slider', initialValue: 60, fieldProps: { min: 0, max: 100, step: 5 } },
  { field: 'select', initialValue: 'live', fieldProps: { options: statusOptions } },
  { field: 'combobox', initialValue: 'building', fieldProps: { options: statusOptions } },
  { field: 'radiogroup', initialValue: 'medium', fieldProps: { options: priorityOptions } },
  { field: 'togglegroup', initialValue: 'bold', fieldProps: { options: formatOptions } },
  { field: 'checkbox', initialValue: true },
  { field: 'switch', initialValue: false },
  { field: 'datepicker', initialValue: '2024-03-12' },
  { field: 'datetimepicker', initialValue: '2024-11-20T14:30:00Z' },
  { field: 'timepicker', initialValue: '14:30' },
  {
    field: 'daterangepicker',
    initialValue: { start: new Date(RANGE_START), end: new Date('2024-11-15') },
  },
  {
    field: 'multidatepicker',
    initialValue: [new Date(RANGE_START), new Date('2024-11-12')],
  },
  { field: 'duration', initialValue: 5400 },
  { field: 'colorpicker', initialValue: '#9747ff' },
  { field: 'phoneinput', initialValue: '+15125551234', fieldProps: { defaultCountry: 'US' } },
  { field: 'otp', initialValue: '1234', fieldProps: { otpLength: 4 } },
  { field: 'barcode', initialValue: '0123456789012' },
  { field: 'rating', initialValue: 4, fieldProps: { maxRating: 5 } },
  { field: 'progress', initialValue: 78, fieldProps: { min: 0, max: 100 } },
  { field: 'fileupload', initialValue: 'report.pdf' },
  { field: 'image', initialValue: 'https://i.pravatar.cc/100?img=12' },
  { field: 'signature', initialValue: '' },
  { field: 'geolocation', initialValue: { lat: 30.2672, lng: -97.7431 } },
  { field: 'richtexteditor', initialValue: '<p>Hello <strong>world</strong></p>' },
  { field: 'markdowneditor', initialValue: '# Heading\n\nSome **markdown**.' },
  { field: 'codeeditor', initialValue: 'function add(a, b) {\n  return a + b;\n}' },
  {
    field: 'custom',
    initialValue: 'custom-value',
    fieldProps: { render: customCellRender },
  },
];

/** All 31 field types at once: edit cell on the left, read cell on the right. */
export const Default: Story = {
  name: 'Main',
  render: () => (
    <YStack
      padding="$4"
      gap="$1">
      <XStack
        gap="$3"
        paddingBottom="$2">
        <View width={130}>
          <Text
            fontSize="$2"
            fontWeight="600">
            field
          </Text>
        </View>
        <View width={260}>
          <Text
            fontSize="$2"
            fontWeight="600">
            edit
          </Text>
        </View>
        <View width={200}>
          <Text
            fontSize="$2"
            fontWeight="600">
            read
          </Text>
        </View>
      </XStack>
      {overviewSpecs.map((spec) => (
        <OverviewRow
          key={spec.field}
          {...spec}
        />
      ))}
    </YStack>
  ),
};

// ── Args-driven playground ────────────────────────────────────

const PlaygroundHarness = (args: any) => {
  const [value, setValue] = React.useState<unknown>(args.value);
  return (
    <YStack
      gap="$3"
      padding="$4"
      maxWidth={520}>
      <Table aria-label="Playground cell">
        <Table.Body>
          <Table.Row>
            <Table.Cell>
              <DataTableCell
                {...args}
                value={value}
                onChange={(next) => {
                  setValue(next);
                  args.onChange?.(next);
                }}
              />
            </Table.Cell>
          </Table.Row>
        </Table.Body>
      </Table>
      <Text
        testID="committed-value"
        fontSize="$2"
        color="$color10"
        fontFamily="$mono">
        committed: {serialize(value)}
      </Text>
    </YStack>
  );
};

/** Drive field/readOnly/disabled/compact/size from controls. */
export const Playground: Story = {
  args: {
    field: 'input',
    value: 'hello',
    readOnly: false,
    disabled: false,
    compact: true,
    columnId: 'playground',
    rowIndex: 0,
    fieldProps: { options: statusOptions, placeholder: 'Type here' },
  },
  render: (args) => <PlaygroundHarness {...args} />,
};

// ── Per-field-type stories (read + edit each) ─────────────────

export const InputField = makeCellStory({ field: 'input', initialValue: 'acme-website' });

export const TextareaField = makeCellStory({
  field: 'textarea',
  initialValue: 'Multi-line\ndescription text',
});

export const MentionInputField = makeCellStory({
  field: 'mentioninput',
  initialValue: 'Ping @alice about the launch',
  fieldProps: { mentions: mentionUsers },
});

export const StepperField = makeCellStory({
  field: 'stepper',
  initialValue: 42,
  fieldProps: { min: 0, max: 100, step: 1 },
  columnLabel: 'Quantity',
});

export const SliderField = makeCellStory({
  field: 'slider',
  initialValue: 60,
  fieldProps: { min: 0, max: 100, step: 5 },
  columnLabel: 'Progress',
});

export const SelectField = makeCellStory({
  field: 'select',
  initialValue: 'live',
  fieldProps: { options: statusOptions },
  columnLabel: 'Status',
});

export const ComboboxField = makeCellStory({
  field: 'combobox',
  initialValue: 'building',
  fieldProps: { options: statusOptions },
  columnLabel: 'Status',
});

export const RadioGroupField = makeCellStory({
  field: 'radiogroup',
  initialValue: 'medium',
  fieldProps: { options: priorityOptions },
  columnLabel: 'Priority',
});

export const ToggleGroupField = makeCellStory({
  field: 'togglegroup',
  initialValue: 'bold',
  fieldProps: { options: formatOptions },
});

export const ToggleGroupMultipleField = makeCellStory({
  field: 'togglegroup',
  initialValue: ['bold', 'italic'],
  fieldProps: { options: formatOptions, allowMultiple: true },
});

export const CheckboxField = makeCellStory({
  field: 'checkbox',
  initialValue: true,
  // DG-A11Y-06: cells announce columnLabel ?? columnId — model real usage
  // where columns carry human labels (was announcing the raw id "checkbox").
  columnLabel: 'Active',
});

export const SwitchField = makeCellStory({
  field: 'switch',
  initialValue: false,
  columnLabel: 'Enabled',
});

export const DatePickerField = makeCellStory({
  field: 'datepicker',
  initialValue: '2024-03-12',
});

export const DatetimePickerField = makeCellStory({
  field: 'datetimepicker',
  initialValue: '2024-11-20T14:30:00Z',
});

export const TimePickerField = makeCellStory({
  field: 'timepicker',
  initialValue: '14:30',
  fieldProps: { timeFormat: '24h' },
});

export const DateRangePickerField = makeCellStory({
  field: 'daterangepicker',
  initialValue: { start: new Date(RANGE_START), end: new Date('2024-11-15') },
});

export const MultiDatePickerField = makeCellStory({
  field: 'multidatepicker',
  initialValue: [new Date(RANGE_START), new Date('2024-11-12')],
});

export const DurationField = makeCellStory({ field: 'duration', initialValue: 5400 });

export const ColorPickerField = makeCellStory({
  field: 'colorpicker',
  initialValue: '#9747ff',
});

export const PhoneInputField = makeCellStory({
  field: 'phoneinput',
  initialValue: '+15125551234',
  fieldProps: { defaultCountry: 'US' },
});

export const OtpField = makeCellStory({
  field: 'otp',
  initialValue: '1234',
  fieldProps: { otpLength: 4 },
});

export const BarcodeField = makeCellStory({ field: 'barcode', initialValue: '0123456789012' });

export const RatingField = makeCellStory({
  field: 'rating',
  initialValue: 4,
  fieldProps: { maxRating: 5 },
});

export const ProgressField = makeCellStory({
  field: 'progress',
  initialValue: 78,
  fieldProps: { min: 0, max: 100 },
});

export const FileUploadField = makeCellStory({ field: 'fileupload', initialValue: 'report.pdf' });

export const ImageField = makeCellStory({
  field: 'image',
  initialValue: 'https://i.pravatar.cc/100?img=12',
});

export const SignatureField = makeCellStory({ field: 'signature', initialValue: '' });

export const GeolocationField = makeCellStory({
  field: 'geolocation',
  initialValue: { lat: 30.2672, lng: -97.7431 },
});

export const RichTextEditorField = makeCellStory({
  field: 'richtexteditor',
  initialValue: '<p>Hello <strong>world</strong></p>',
});

export const MarkdownEditorField = makeCellStory({
  field: 'markdowneditor',
  initialValue: '# Heading\n\nSome **markdown**.',
});

export const CodeEditorField = makeCellStory({
  field: 'codeeditor',
  initialValue: 'function add(a, b) {\n  return a + b;\n}',
});

export const CustomField = makeCellStory({
  field: 'custom',
  initialValue: 'custom-value',
  fieldProps: { render: customCellRender },
});
