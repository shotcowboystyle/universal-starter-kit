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

import { CodeEditorField, frappeCodeLanguage } from '.';
import type { CodeEditorFieldProps } from '.';

const PYTHON_FIXTURE = `import frappe


def validate(doc, method=None):
    """Server script fixture for the Code field."""
    if not doc.title:
        frappe.throw("Title is required")
    doc.slug = doc.title.lower().replace(" ", "-")
`;

const JSON_FIXTURE = `{
  "fieldtype": "Code",
  "options": "Python",
  "read_only": 0,
  "columns": [1, 2, 3]
}
`;

export default {
  title: 'FrappeUI/CodeEditorField',
  component: CodeEditorField,
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component:
          'Frappe `Code` / `JSON` fieldtypes: monospace source pane + shiki-highlighted preview (unified components Highlighter). Language follows the stock df.options convention via `frappeCodeLanguage()`. Source textarea honors knob `containerRadius` (F14).',
      },
    },
  },
  argTypes: {
    label: { control: 'text' },
    value: { control: 'text' },
    language: {
      control: 'select',
      options: ['text', 'python', 'javascript', 'json', 'html', 'css', 'go', 'jinja'],
    },
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

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Storybook args bag forwarded verbatim to the field; controls own the values
type StoryProps = CodeEditorFieldProps & Record<string, unknown>;

const Controlled = (props: Omit<StoryProps, 'onChange'>) => {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Omit over the args index signature widens value to unknown; only a string seeds the editor
  const [value, setValue] = useState<string>(typeof props.value === 'string' ? props.value : '');
  return (
    <CodeEditorField
      {...(props as CodeEditorFieldProps)}
      value={value}
      onChange={(v) => {
        setValue(v);
        action('onChange')(v);
      }}
    />
  );
};

// CSF3 objects (not `export const Main = (args) => …; Main.args = …`).
// Native Kitchen Sink `storyIndex.ts` treats a function export as
// `{ render: fn }` and drops `fn.args`, so CSF2 Main/Json/ReadOnly
// painted an empty Code pane on OTA (value/readOnly never arrived).
export const Main = {
  name: 'Main',
  args: {
    label: 'Server script',
    helperText: 'Language from df.options ("Python")',
    value: PYTHON_FIXTURE,
    language: frappeCodeLanguage('Python'),
  } as Partial<StoryProps>,
  render: (args: StoryProps) => <Controlled {...args} />,
};

export const Json = {
  args: {
    label: 'Filters (JSON fieldtype)',
    value: JSON_FIXTURE,
    language: 'json',
  } as Partial<StoryProps>,
  render: (args: StoryProps) => <Controlled {...args} />,
};

export const FormIntegrated = {
  name: 'Form Integrated',
  // oxlint-disable-next-line eslint/func-name-matching -- a capitalized name lets React treat this render function as a component so it may call hooks
  render: function FormIntegratedRender() {
    const form = useForm({
      defaultValues: { script: PYTHON_FIXTURE },
      onSubmit: async ({ value }) => action('onSubmit')(value),
    });
    return (
      <Form form={form}>
        <YStack gap="$4">
          <CodeEditorField
            form={form as unknown as AnyFormApi}
            name="script"
            label="Script (form-integrated)"
            language="python"
            required
            helperText="Bound to TanStack Form field state"
          />
        </YStack>
      </Form>
    );
  },
};

export const ReadOnly = {
  args: {
    label: 'Read-only script',
    value: PYTHON_FIXTURE,
    language: 'python',
    readOnly: true,
  } as Partial<StoryProps>,
  render: (args: StoryProps) => <Controlled {...args} />,
};

export const States = {
  args: {
    value: 'const answer = 42;\nconsole.log("state fixtures");',
    language: 'javascript',
  } as Partial<StoryProps>,
  render: (args: StoryProps) => (
    <YStack gap="$5">
      <Controlled
        {...args}
        label="Error"
        error="Script fails to parse at line 3"
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
      <CodeEditorField
        label="Skeleton"
        skeleton
        onChange={action('onChange')}
      />
    </YStack>
  ),
};

export const DarkScheme = {
  args: {
    label: 'Server script (dark)',
    value: PYTHON_FIXTURE,
    language: 'python',
  } as Partial<StoryProps>,
  render: (args: StoryProps) => (
    <Theme name="dark">
      <YStack
        backgroundColor="$background"
        padding="$4">
        <Controlled {...args} />
      </YStack>
    </Theme>
  ),
};

interface CodeRow {
  id: string;
  label: string;
  value: string;
}

export const InTable = {
  name: 'In table',
  // oxlint-disable-next-line eslint/func-name-matching -- a capitalized name lets React treat this render function as a component so it may call hooks
  render: function InTableRender() {
    const [data, setData] = useState<CodeRow[]>([
      { id: '1', label: 'Alpha', value: PYTHON_FIXTURE },
      { id: '2', label: 'Beta', value: JSON_FIXTURE },
      { id: '3', label: 'Gamma', value: '' },
    ]);
    const columns: DataTableColumn<CodeRow>[] = [
      { accessorKey: 'label', header: 'Row' },
      { accessorKey: 'value', header: 'Script', ...fieldtypeToTableField('Code') },
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
