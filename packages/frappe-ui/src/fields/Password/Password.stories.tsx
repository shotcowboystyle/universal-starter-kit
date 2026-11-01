import { action } from '@repo/storybook';
import { DataTable } from '@repo/table';
import type { DataTableColumn } from '@repo/table';
import { SIZE_RECIPE_TOKENS } from '@repo/theme';
import { useState } from 'react';
import { YStack } from 'tamagui';

import { fieldtypeToTableField } from '../../field-registry';
import { FrappeStoryProvider } from '../../frappe-story-target';

import { Password } from '.';
import type { PasswordProps } from '.';

export default {
  title: 'FrappeUI/Password',
  component: Password,
  parameters: {
    status: { type: 'beta' },
    docs: { description: { component: 'Frappe Password field (secure text entry adapter).' } },
  },
  argTypes: {
    label: { control: 'text' },
    value: { control: 'text' },
    disabled: { control: 'boolean' },
    required: { control: 'boolean' },
    error: { control: 'text' },
    helperText: { control: 'text' },
    placeholder: { control: 'text' },
  },
};

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Storybook args bag forwarded verbatim to the field; controls own the values
type StoryProps = PasswordProps & Record<string, unknown>;

const Controlled = (props: StoryProps) => {
  const [value, setValue] = useState(props.value);
  return (
    <Password
      {...(props as any)}
      value={value as any}
      onChange={(v: any) => {
        setValue(v);
        action('onChange')(v);
      }}
    />
  );
};

const STORY_PLACEHOLDER = 'Enter password';

export const Main = (args: StoryProps) => <Controlled {...args} />;
Main.args = {
  label: 'Password',
  value: 'hunter2',
  placeholder: STORY_PLACEHOLDER,
} as Partial<StoryProps>;
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
States.args = {
  label: 'Password',
  value: 'hunter2',
  placeholder: STORY_PLACEHOLDER,
} as Partial<StoryProps>;

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
ContractProbe.args = {
  label: 'Password',
  value: 'hunter2',
  placeholder: STORY_PLACEHOLDER,
} as Partial<StoryProps>;

interface PasswordCellRow {
  id: string;
  label: string;
  value: string;
}

const passwordCellRows: PasswordCellRow[] = [
  { id: '1', label: 'Alpha', value: 'hunter2' },
  { id: '2', label: 'Beta', value: 'correct-horse' },
  { id: '3', label: 'Gamma', value: '' },
];

const passwordCellColumns: DataTableColumn<PasswordCellRow>[] = [
  { accessorKey: 'label', header: 'Row' },
  {
    accessorKey: 'value',
    header: 'Password',
    ...fieldtypeToTableField('Password'),
  } as DataTableColumn<PasswordCellRow>,
];

const InTableStory = () => {
  const [data, setData] = useState(passwordCellRows);
  return (
    <YStack
      width="100%"
      height={280}>
      <DataTable
        data={data}
        columns={passwordCellColumns}
        enablePagination={false}
        onDataChange={(next) => {
          setData(next);
          action('onDataChange')(next);
        }}
        aria-label="Password cell editor table"
      />
    </YStack>
  );
};

/** 3-row DataTable mapped through fieldtypeToTableField("Password") — masked in-cell input. */
export const InTable = () => (
  <FrappeStoryProvider>
    <InTableStory />
  </FrappeStoryProvider>
);
InTable.storyName = 'In table';
InTable.parameters = {
  docs: {
    description: {
      story:
        'Password inside a table cell: the registry maps the fieldtype to a masked in-cell input (secureTextEntry). Three rows of mock DocType data; edits commit through onDataChange.',
    },
  },
};

/**
 * Every size step, so AC1 ("a reveal toggle in the end-cap slot at every
 * size step, generated from the size recipe rather than hardcoded") is
 * measurable rather than argued. The end cap stamps `data-end-cap` with the
 * square it took from `sizeRecipeForToken`, so the probe reads the recipe
 * off the DOM instead of trusting the source.
 */
export const Sizes = (args: StoryProps) => (
  <YStack
    gap="$4"
    maxWidth={420}>
    {SIZE_RECIPE_TOKENS.map((token) => (
      <Controlled
        {...args}
        key={token}
        label={`size ${token}`}
        size={token as any}
      />
    ))}
  </YStack>
);
Sizes.args = {
  value: 'hunter2',
  placeholder: STORY_PLACEHOLDER,
} as Partial<StoryProps>;
Sizes.storyName = 'Sizes';
