/**
 * FilterOperatorValueEditor — the ONE fieldtype-aware operator/value editor
 * (LC-16). Both filter surfaces render it: the ColumnHeaderFilter funnel and
 * the DataTableFilterButton toolbar panel. The surface owns commit semantics,
 * so these stories exercise only what the editor owns: the operator
 * vocabulary per field type, and the value editor each type gets.
 */

import { action } from '@repo/storybook';
import type { Meta } from '@storybook/react-native-web-vite';
import React, { useState } from 'react';
import { Card, Text, XStack, YStack } from 'tamagui';

import type { DataTableColumnType, FilterOperator } from '../../types';
import { defaultOperatorForFilterType, filterOperatorLabel, operatorNeedsNoValue } from '../../utils/filterFields';

import { FilterOperatorValueEditor } from './index';

const meta: Meta<typeof FilterOperatorValueEditor> = {
  title: 'Table/FilterOperatorValueEditor',
  component: FilterOperatorValueEditor,
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component:
          'The shared operator + value editor behind every DataTable filter surface. ' +
          'The operator list and the value editor both follow the field type.',
      },
    },
  },
};

export default meta;

const statusOptions = [
  { label: 'Open', value: 'open' },
  { label: 'In progress', value: 'in-progress' },
  { label: 'Done', value: 'done' },
];

const fieldTypeLabels: Record<DataTableColumnType, string> = {
  text: 'Text',
  number: 'Number',
  money: 'Money',
  date: 'Date',
  boolean: 'Boolean',
  select: 'Select',
};

interface HarnessProps {
  fieldType: DataTableColumnType;
  options?: { label: string; value: any }[];
  initialOperator?: FilterOperator;
  initialValue?: string;
  /** Show the field-type heading (the all-types board needs it). */
  heading?: boolean;
}

/**
 * Drives the editor the way both surfaces do: operator and value live in the
 * caller's state, and the editor only reports changes. The card below is the
 * filter the surface would commit.
 */
function EditorHarness({ fieldType, options, initialOperator, initialValue = '', heading = false }: HarnessProps) {
  const [operator, setOperator] = useState<FilterOperator>(initialOperator ?? defaultOperatorForFilterType(fieldType));
  const [value, setValue] = useState(initialValue);

  const handleOperatorChange = (next: FilterOperator) => {
    setOperator(next);
    action('onOperatorChange')(next);
  };
  const handleValueChange = (next: string) => {
    setValue(next);
    action('onValueChange')(next);
  };

  const shownValue =
    fieldType === 'select' && options ? (options.find((opt) => String(opt.value) === value)?.label ?? value) : value;
  const summary = operatorNeedsNoValue(operator)
    ? filterOperatorLabel(operator)
    : `${filterOperatorLabel(operator)} ${shownValue || '(no value)'}`;

  return (
    <YStack
      gap="$3"
      width={280}>
      {heading && (
        <Text
          fontSize="$3"
          fontWeight="600">
          {fieldTypeLabels[fieldType]}
        </Text>
      )}
      {/* Same vertical rhythm the funnel popover gives the editor. */}
      <YStack gap="$2">
        <FilterOperatorValueEditor
          fieldType={fieldType}
          operator={operator}
          value={value}
          onOperatorChange={handleOperatorChange}
          onValueChange={handleValueChange}
          options={options}
        />
      </YStack>
      <Card
        padding="$3"
        borderRadius="$4">
        <YStack gap="$1">
          <Text
            fontSize="$2"
            color="$color10">
            Filter the surface would commit
          </Text>
          <Text fontSize="$3">{summary}</Text>
        </YStack>
      </Card>
    </YStack>
  );
}

export const Default = () => (
  <YStack padding="$4">
    <EditorHarness fieldType="text" />
  </YStack>
);
Default.storyName = 'Main';

/** Text fields: contains / starts with / ends with plus the empty checks. */
export const TextField = () => (
  <YStack padding="$4">
    <EditorHarness
      fieldType="text"
      initialValue="ada"
    />
  </YStack>
);

/** Number fields: comparison operators and a numeric keyboard on the value. */
export const NumberField = () => (
  <YStack padding="$4">
    <EditorHarness
      fieldType="number"
      initialOperator="isGreaterThan"
      initialValue="42"
    />
  </YStack>
);

/** Date fields: before / after / on-or-before / on-or-after, typed as YYYY-MM-DD. */
export const DateField = () => (
  <YStack padding="$4">
    <EditorHarness
      fieldType="date"
      initialOperator="isAfter"
      initialValue="2026-01-01"
    />
  </YStack>
);

/** Boolean fields: the value is a True / False select, not free text. */
export const BooleanField = () => (
  <YStack padding="$4">
    <EditorHarness
      fieldType="boolean"
      initialValue="true"
    />
  </YStack>
);

/** Select fields: the value picks from the field's own options. */
export const SelectField = () => (
  <YStack padding="$4">
    <EditorHarness
      fieldType="select"
      options={statusOptions}
      initialValue="open"
    />
  </YStack>
);

/** isEmpty / isNotEmpty carry no value, so the value editor is not rendered. */
export const NoValueOperator = () => (
  <YStack padding="$4">
    <EditorHarness
      fieldType="text"
      initialOperator="isEmpty"
    />
  </YStack>
);

/** Every field type on one board, for theme-state verification. */
export const AllFieldTypes = () => (
  <XStack
    padding="$4"
    gap="$6"
    flexWrap="wrap">
    <EditorHarness
      fieldType="text"
      heading
    />
    <EditorHarness
      fieldType="number"
      heading
    />
    <EditorHarness
      fieldType="date"
      heading
    />
    <EditorHarness
      fieldType="boolean"
      heading
    />
    <EditorHarness
      fieldType="select"
      options={statusOptions}
      heading
    />
  </XStack>
);
