import { Form } from '@repo/forms';
import type { AnyFormApi } from '@repo/forms';
import { action } from '@repo/storybook';
import { DataTable } from '@repo/table';
import type { DataTableColumn } from '@repo/table';
import { useForm } from '@tanstack/react-form';
import { useState } from 'react';
import { Theme, YStack } from 'tamagui';

import { fieldtypeToTableField } from '../../field-registry';
import { FrappeStoryProvider } from '../../frappe-story-target';

import { MarkdownEditorField } from '.';
import type { MarkdownEditorFieldProps } from '.';

const FIXTURE = `# Release notes

Dedicated **Markdown Editor** field for the Frappe \`Markdown Editor\` fieldtype.

- WYSIWYG editing via the canonical rich text editor
- Constrained to what ~~HTML~~ *markdown* can express (LC-52)
- Full field contract: label / hint / error / readOnly / skeleton

> Serializes to and from a GFM markdown string.

\`\`\`python
print("fenced code works too")
\`\`\`
`;

export default {
  title: 'FrappeUI/MarkdownEditorField',
  component: MarkdownEditorField,
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          'Frappe `Markdown Editor` fieldtype: the canonical rich text editor in markdown capabilities (LC-52) — WYSIWYG constrained to GFM-expressible features (no highlight/underline/color/alignment), serializing to and from a markdown string. Native falls back to markdown source editing.',
      },
    },
  },
  argTypes: {
    label: { control: 'text' },
    value: { control: 'text' },
    helperText: { control: 'text' },
    error: { control: 'text' },
    placeholder: { control: 'text' },
    required: { control: 'boolean' },
    disabled: { control: 'boolean' },
    readOnly: { control: 'boolean' },
    skeleton: { control: 'boolean' },
    compact: { control: 'boolean' },
    minRows: { control: 'number' },
    maxRows: { control: 'number' },
  },
};

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Storybook args bag forwarded verbatim to the field
type StoryProps = MarkdownEditorFieldProps & Record<string, unknown>;

const Controlled = (props: Omit<StoryProps, 'onChange'>) => {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Storybook args are untyped here; only a string seeds the editor
  const [value, setValue] = useState<string>(typeof props.value === 'string' ? props.value : '');
  return (
    <MarkdownEditorField
      {...(props as MarkdownEditorFieldProps)}
      value={value}
      onChange={(v) => {
        setValue(v);
        action('onChange')(v);
      }}
    />
  );
};

export const Main = (args: StoryProps) => <Controlled {...args} />;
Main.args = {
  label: 'Release notes',
  helperText: 'GitHub-flavored markdown',
  value: FIXTURE,
} as Partial<StoryProps>;
Main.storyName = 'Main';

export const Empty = (args: StoryProps) => <Controlled {...args} />;
Empty.args = {
  label: 'Notes',
  value: '',
  placeholder: 'Write some markdown…',
} as Partial<StoryProps>;

export const FormIntegrated = () => {
  const form = useForm({
    defaultValues: { body: FIXTURE },
    onSubmit: async ({ value }) => action('onSubmit')(value),
  });
  return (
    <Form form={form}>
      <YStack gap="$4">
        <MarkdownEditorField
          form={form as unknown as AnyFormApi}
          name="body"
          label="Body (form-integrated)"
          required
          helperText="Bound to TanStack Form field state"
        />
      </YStack>
    </Form>
  );
};

export const ReadOnly = (args: StoryProps) => <Controlled {...args} />;
ReadOnly.args = {
  label: 'Read-only notes',
  value: FIXTURE,
  readOnly: true,
} as Partial<StoryProps>;

export const States = (args: StoryProps) => (
  <YStack gap="$5">
    <Controlled
      {...args}
      label="Error"
      error="Markdown body is required"
    />
    <Controlled
      {...args}
      label="Disabled"
      disabled
    />
    <Controlled
      {...args}
      label="Compact"
      compact
    />
    <MarkdownEditorField
      label="Skeleton"
      skeleton
      onChange={action('onChange')}
    />
  </YStack>
);
States.args = {
  value: '# Stateful\n\nSame fixture across states.',
} as Partial<StoryProps>;

export const DarkScheme = (args: StoryProps) => (
  <Theme name="dark">
    <YStack
      backgroundColor="$background"
      padding="$4">
      <Controlled {...args} />
    </YStack>
  </Theme>
);
DarkScheme.args = {
  label: 'Release notes (dark)',
  value: FIXTURE,
} as Partial<StoryProps>;

interface MarkdownRow {
  id: string;
  label: string;
  value: string;
}

export const InTable = {
  name: 'In table',
  // oxlint-disable-next-line eslint/func-name-matching -- a capitalized name lets React treat this render function as a component so it may call hooks
  render: function InTableRender() {
    const [data, setData] = useState<MarkdownRow[]>([
      { id: '1', label: 'Alpha', value: '# Setup\n\nRun `make prepare`.' },
      { id: '2', label: 'Beta', value: '## Notes\n\n- Ship the release\n- Ping reviewers' },
      { id: '3', label: 'Gamma', value: '' },
    ]);
    const columns: DataTableColumn<MarkdownRow>[] = [
      { accessorKey: 'label', header: 'Row' },
      {
        accessorKey: 'value',
        header: 'Notes',
        ...fieldtypeToTableField('Markdown Editor'),
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
