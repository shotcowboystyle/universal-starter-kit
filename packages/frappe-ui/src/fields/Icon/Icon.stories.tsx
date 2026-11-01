import { action } from '@repo/storybook';
import { DataTable } from '@repo/table';
import type { DataTableColumn } from '@repo/table';
import { useState } from 'react';
import { YStack } from 'tamagui';

import { fieldtypeToTableField, getFieldComponent, initDefaultRegistry } from '../../field-registry';
import { FrappeStoryProvider } from '../../frappe-story-target';

import { Icon } from '.';
import type { IconProps } from '.';

export default {
  title: 'FrappeUI/Icon',
  component: Icon,
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component:
          'Icon picker for the Frappe Icon field type. Options come from the DG-IDN-06 drawn set and open in a FloatingPanel; df.options narrows the catalog to a subset.',
      },
    },
  },
  argTypes: {
    label: { control: 'text', description: 'Field label' },
    value: { control: 'text', description: 'Selected drawn-icon name' },
    placeholder: { control: 'text', description: 'Placeholder text' },
    disabled: { control: 'boolean', description: 'Disable the field' },
    readOnly: { control: 'boolean', description: 'Render read-only' },
    required: { control: 'boolean', description: 'Mark as required' },
    compact: { control: 'boolean', description: 'Compact (table cell) presentation' },
    options: { control: 'text', description: 'df.options — newline list narrowing the catalog' },
    error: { control: 'text', description: 'Error message to display' },
  },
};

const ControlledIcon = (props: Omit<IconProps, 'onChange'>) => {
  const [value, setValue] = useState(props.value ?? '');
  return (
    <Icon
      {...props}
      value={value}
      onChange={(v) => {
        setValue(v);
        action('onChange')(v);
      }}
    />
  );
};

export const Default = (args: IconProps) => <ControlledIcon {...args} />;
Default.args = {
  label: 'Workspace icon',
  placeholder: 'Choose an icon',
} satisfies Partial<IconProps>;

Default.storyName = 'Main';

export const AllStates = () => (
  <YStack
    gap="$4"
    width={400}>
    <ControlledIcon
      label="Default"
      placeholder="Choose an icon"
    />
    <ControlledIcon
      label="With Value"
      value="mail"
    />
    <ControlledIcon
      label="Required"
      required
    />
    <ControlledIcon
      label="With Error"
      error="Pick an icon for this workspace"
    />
    <ControlledIcon
      label="Disabled"
      value="upload"
      disabled
    />
    <ControlledIcon
      label="Read Only"
      value="disk"
      readOnly
    />
    <ControlledIcon
      label="Narrowed by options"
      value="check"
      options={'check\nwarn\nx'}
    />
  </YStack>
);
AllStates.parameters = {
  docs: {
    description: {
      story: 'All possible states of the Icon field component.',
    },
  },
};

// MPO-51 AC-1. A DocField of fieldtype Icon has to reach this picker through
// the registry, not just through a direct import. MPO-60 (035867446) clobbered
// registerField("Icon", …) once already; this story renders whatever the
// registry hands back, so a repeat shows up as the "Unsupported field type"
// string on the board rather than only in union_vs_registry.py.
export const ViaRegistry = () => {
  initDefaultRegistry();
  const RegisteredIcon = getFieldComponent('Icon');
  const [value, setValue] = useState('mail');
  if (!RegisteredIcon) {
    throw new Error('fieldtype Icon is not registered — initDefaultRegistry() lost registerField');
  }
  return (
    <YStack
      gap="$4"
      width={400}>
      {/* oxlint-disable-next-line react/static-components -- resolved from the module-level field registry, not created during render */}
      <RegisteredIcon
        label="Workspace icon (through the registry)"
        value={value}
        onChange={(v: string) => {
          setValue(v);
          action('onChange')(v);
        }}
      />
    </YStack>
  );
};
ViaRegistry.storyName = 'Via registry';
ViaRegistry.parameters = {
  docs: {
    description: {
      story:
        "Resolves the component through getFieldComponent('Icon') the way a DocField-driven form does, so a lost registration is visible here and not only in the census script.",
    },
  },
};

interface IconRow {
  id: string;
  label: string;
  value: string;
}

export const InTable = () => {
  const [data, setData] = useState<IconRow[]>([
    { id: '1', label: 'Inbox', value: 'mail' },
    { id: '2', label: 'Uploads', value: 'upload' },
    { id: '3', label: 'Unset', value: '' },
  ]);
  const columns: DataTableColumn<IconRow>[] = [
    { accessorKey: 'label', header: 'Row' },
    {
      accessorKey: 'value',
      header: 'Icon',
      ...fieldtypeToTableField('Icon'),
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
