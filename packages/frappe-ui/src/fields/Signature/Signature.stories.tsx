import { action } from '@repo/storybook';
import { DataTable } from '@repo/table';
import type { DataTableColumn } from '@repo/table';
import { useState } from 'react';
import { YStack } from 'tamagui';

import { fieldtypeToTableField } from '../../field-registry';
import { FrappeStoryProvider } from '../../frappe-story-target';

import { Signature } from '.';
import type { SignatureProps } from '.';

export default {
  title: 'FrappeUI/Signature',
  component: Signature,
  parameters: {
    status: { type: 'beta' },
    docs: { description: { component: 'Frappe Signature field supplying the eraser clear icon.' } },
  },
  argTypes: {
    label: { control: 'text' },
    value: { control: 'text' },
    disabled: { control: 'boolean' },
    required: { control: 'boolean' },
    error: { control: 'text' },
    helperText: { control: 'text' },
    width: { control: 'number' },
    height: { control: 'number' },
    penColor: { control: 'color' },
  },
};

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Storybook args bag forwarded verbatim to the field
type StoryProps = SignatureProps & Record<string, unknown>;

const Controlled = (props: StoryProps) => {
  const [value, setValue] = useState(props.value);
  return (
    <Signature
      {...(props as any)}
      value={value as any}
      onChange={(v: any) => {
        setValue(v);
        action('onChange')(v);
      }}
    />
  );
};

export const Main = (args: StoryProps) => <Controlled {...args} />;
Main.args = { label: 'Signature', width: 320, height: 140 } as Partial<StoryProps>;
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
States.args = { label: 'Signature', width: 320, height: 140 } as Partial<StoryProps>;

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
ContractProbe.args = { label: 'Signature', width: 320, height: 140 } as Partial<StoryProps>;

interface SignatureRow {
  id: string;
  label: string;
  value: string;
}

export const InTable = {
  name: 'In table',
  // oxlint-disable-next-line eslint/func-name-matching -- a capitalized name lets React treat this render function as a component so it may call hooks
  render: function InTableRender() {
    const [data, setData] = useState<SignatureRow[]>([
      { id: '1', label: 'Alpha', value: '' },
      { id: '2', label: 'Beta', value: '' },
      { id: '3', label: 'Gamma', value: '' },
    ]);
    const columns: DataTableColumn<SignatureRow>[] = [
      { accessorKey: 'label', header: 'Row' },
      { accessorKey: 'value', header: 'Signature', ...fieldtypeToTableField('Signature') },
    ];
    return (
      <FrappeStoryProvider>
        <YStack
          width="100%"
          height={320}>
          <DataTable
            data={data}
            columns={columns}
            enablePagination={false}
            onDataChange={setData}
          />
        </YStack>
      </FrappeStoryProvider>
    );
  },
};
