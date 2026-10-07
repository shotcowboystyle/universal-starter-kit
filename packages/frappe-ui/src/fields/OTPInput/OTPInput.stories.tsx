import { action } from '@repo/storybook';
import { DataTable } from '@repo/table';
import type { DataTableColumn } from '@repo/table';
import { useState } from 'react';
import { YStack } from 'tamagui';

import { fieldtypeToTableField } from '../../fieldRegistry';
import { FrappeStoryProvider } from '../../frappeStoryTarget';

import { OTPInputField } from '.';
import type { OTPInputFieldProps } from '.';

export default {
  title: 'FrappeUI/OTPInput',
  component: OTPInputField,
  parameters: {
    status: { type: 'beta' },
    docs: { description: { component: 'Frappe OTP field backed by forms OTPInput.' } },
  },
  argTypes: {
    label: { control: 'text' },
    value: { control: 'text' },
    disabled: { control: 'boolean' },
    required: { control: 'boolean' },
    error: { control: 'text' },
    helperText: { control: 'text' },
    length: { control: 'number' },
    type: { control: 'select', options: ['numeric', 'alphanumeric', 'password'] },
    secureTextEntry: { control: 'boolean' },
  },
};

type StoryProps = OTPInputFieldProps & Record<string, unknown>;

function Controlled(props: StoryProps) {
  const [value, setValue] = useState(props.value);
  return (
    <OTPInputField
      {...(props as any)}
      value={value as any}
      onChange={(v: any) => {
        setValue(v);
        action('onChange')(v);
      }}
    />
  );
}

export const Main = (args: StoryProps) => <Controlled {...args} />;
Main.args = { label: 'One-time code', length: 6, type: 'numeric' } as Partial<StoryProps>;
Main.storyName = 'Main';

export const States = (args: StoryProps) => (
  <YStack
    gap="$4"
    maxWidth={420}>
    <Controlled
      {...args}
      label="Disabled"
      disabled
    />
    <Controlled
      {...args}
      label="Disabled + error"
      disabled
      error="Broken while disabled"
    />
    <Controlled
      {...args}
      label="Required"
      required
    />
    <Controlled
      {...args}
      label="Error"
      error="Value does not match the required format"
    />
    <Controlled
      {...args}
      label="Helper text"
      helperText="Some helpful context"
    />
  </YStack>
);
States.args = { label: 'One-time code', length: 6, type: 'numeric' } as Partial<StoryProps>;

/**
 * Thin-adapter contract probe: forwards readOnly / skeleton / compact through
 * the adapter. The underlying forms field supports all three; if the adapter
 * drops them these three render identically to Main.
 */
export const ContractProbe = (args: StoryProps) => (
  <YStack
    gap="$4"
    maxWidth={420}>
    <Controlled
      {...args}
      label="readOnly probe"
      {...({ readOnly: true } as any)}
    />
    <Controlled
      {...args}
      label="skeleton probe"
      {...({ skeleton: true } as any)}
    />
    <Controlled
      {...args}
      label="compact probe"
      {...({ compact: true } as any)}
    />
  </YStack>
);
ContractProbe.args = { label: 'One-time code', length: 6, type: 'numeric' } as Partial<StoryProps>;

interface OtpRow {
  id: string;
  label: string;
  value: string;
}

export const InTable = () => {
  const [data, setData] = useState<OtpRow[]>([
    { id: '1', label: 'Alpha', value: '123456' },
    { id: '2', label: 'Beta', value: '000000' },
    { id: '3', label: 'Gamma', value: '' },
  ]);
  const columns: DataTableColumn<OtpRow>[] = [
    { accessorKey: 'label', header: 'Row' },
    {
      accessorKey: 'value',
      header: 'OTP',
      ...fieldtypeToTableField('OTP', '6'),
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
