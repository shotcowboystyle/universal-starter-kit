import { action } from '@repo/storybook';
import { DataTable } from '@repo/table';
import type { DataTableColumn } from '@repo/table';
import { useState } from 'react';
import { YStack } from 'tamagui';

import { fieldtypeToTableField } from '../../fieldRegistry';
import { FrappeStoryProvider } from '../../frappeStoryTarget';

import { MentionInputField } from '.';
import type { MentionInputFieldProps, MentionValue } from '.';

const users = [
  { id: 'u1', display: 'John Doe', description: 'Engineering' },
  { id: 'u2', display: 'Jane Smith', description: 'Design' },
  { id: 'u3', display: 'Ravi Kumar', description: 'Support' },
];
const tags = [
  { id: 't1', display: 'urgent' },
  { id: 't2', display: 'backlog' },
];

const mentionFixtures = [
  { trigger: '@', data: users },
  { trigger: '#', data: tags },
];

export default {
  title: 'FrappeUI/MentionInput',
  component: MentionInputField,
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component: 'Frappe Mention field backed by forms MentionInput; type @ or # to trigger the mention menu.',
      },
    },
  },
  argTypes: {
    label: { control: 'text' },
    disabled: { control: 'boolean' },
    required: { control: 'boolean' },
    error: { control: 'text' },
    helperText: { control: 'text' },
    placeholder: { control: 'text' },
  },
};

type StoryProps = MentionInputFieldProps & Record<string, unknown>;

function Controlled(props: Omit<StoryProps, 'onChange'>) {
  const [value, setValue] = useState<MentionValue | undefined>(props.value as MentionValue | undefined);
  return (
    <MentionInputField
      {...(props as any)}
      mentions={props.mentions ?? mentionFixtures}
      value={value}
      onChange={(v: MentionValue) => {
        setValue(v);
        action('onChange')(v);
      }}
    />
  );
}

export const Main = (args: StoryProps) => <Controlled {...args} />;
Main.args = {
  label: 'Comment',
  placeholder: 'Type @ to mention someone',
} as Partial<StoryProps>;
Main.storyName = 'Main';

export const NoResults = (args: StoryProps) => <Controlled {...args} />;
NoResults.args = {
  label: 'Empty mention data (registry default)',
  mentions: [],
  placeholder: 'Type @ — no data configured',
} as Partial<StoryProps>;

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
States.args = {} as Partial<StoryProps>;

/** Thin-adapter contract probe: readOnly / skeleton / compact forwarding. */
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
ContractProbe.args = {} as Partial<StoryProps>;

const mentionUsers = [
  { id: 'u1', display: 'John Doe' },
  { id: 'u2', display: 'Jane Smith' },
  { id: 'u3', display: 'Ravi Kumar' },
];

interface MentionRow {
  id: string;
  label: string;
  value: string;
}

export const InTable = {
  name: 'In table',
  render: function InTableRender() {
    const [data, setData] = useState<MentionRow[]>([
      { id: '1', label: 'Alpha', value: 'Ping @John Doe when the build is green' },
      { id: '2', label: 'Beta', value: 'Waiting on @Jane Smith for the API keys' },
      { id: '3', label: 'Gamma', value: '' },
    ]);
    const mapped = fieldtypeToTableField('Mention');
    const columns: DataTableColumn<MentionRow>[] = [
      { accessorKey: 'label', header: 'Row' },
      {
        accessorKey: 'value',
        header: 'Comment',
        ...mapped,
        fieldProps: { ...mapped.fieldProps, mentions: mentionUsers },
      },
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
