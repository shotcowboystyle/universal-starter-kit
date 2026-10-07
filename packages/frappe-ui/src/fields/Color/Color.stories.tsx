import { action } from '@repo/storybook';
import { DataTable } from '@repo/table';
import type { DataTableColumn } from '@repo/table';
import { useState } from 'react';
import { YStack } from 'tamagui';

import { fieldtypeToTableField } from '../../fieldRegistry';
import { FrappeStoryProvider } from '../../frappeStoryTarget';

import { Color } from '.';
import type { ColorProps } from '.';

// hex-escape: Color field values are hex strings: specimen data, not paint

export default {
  title: 'FrappeUI/Color',
  component: Color,
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component: 'A color picker field with preset colors and hex input for Frappe Color field type.',
      },
    },
  },
  argTypes: {
    label: { control: 'text', description: 'Field label' },
    value: { control: 'color', description: 'Current color value (hex)' },
    placeholder: { control: 'text', description: 'Placeholder text' },
    disabled: { control: 'boolean', description: 'Disable the field' },
    required: { control: 'boolean', description: 'Mark as required' },
    showPresets: { control: 'boolean', description: 'Show preset color swatches' },
    error: { control: 'text', description: 'Error message to display' },
  },
};

function ControlledColor(props: Omit<ColorProps, 'onChange'>) {
  const [value, setValue] = useState(props.value ?? '');
  return (
    <Color
      {...props}
      value={value}
      onChange={(v) => {
        setValue(v);
        action('onChange')(v);
      }}
    />
  );
}

export const Default = (args: ColorProps) => <ControlledColor {...args} />;
Default.args = {
  label: 'Brand Color',
  placeholder: '#000000',
} satisfies Partial<ColorProps>;

Default.storyName = 'Main';
export const AllStates = () => (
  <YStack
    gap="$4"
    width={400}>
    <ControlledColor label="Default" />
    <ControlledColor
      label="With Value"
      value="#10B981"
    />
    <ControlledColor
      label="Required"
      required
    />
    <ControlledColor
      label="With Error"
      value="invalid"
      error="Color must be a recognized value"
    />
    <ControlledColor
      label="Disabled"
      value="#F59E0B"
      disabled
    />
    <ControlledColor
      label="No Presets"
      showPresets={false}
    />
    <ControlledColor
      label="Custom Presets"
      presetColors={['#FF0000', '#00FF00', '#0000FF', '#FFFF00']}
    />
  </YStack>
);
AllStates.parameters = {
  docs: {
    description: {
      story: 'All possible states of the ColorField component.',
    },
  },
};

interface ColorRow {
  id: string;
  label: string;
  value: string;
}

export const InTable = () => {
  const [data, setData] = useState<ColorRow[]>([
    { id: '1', label: 'Alpha', value: '#10B981' },
    { id: '2', label: 'Beta', value: '#F59E0B' },
    { id: '3', label: 'Gamma', value: '' },
  ]);
  const columns: DataTableColumn<ColorRow>[] = [
    { accessorKey: 'label', header: 'Row' },
    {
      accessorKey: 'value',
      header: 'Color',
      ...fieldtypeToTableField('Color'),
    },
  ];
  return (
    <FrappeStoryProvider>
      <YStack
        width="100%"
        height={280}>
        <DataTable
          data={data}
          columns={columns}
          enablePagination={false}
          onDataChange={setData}
        />
      </YStack>
    </FrappeStoryProvider>
  );
};
InTable.storyName = 'In table';
