import { Button } from '@repo/forms';
import { action } from '@repo/storybook';
import { DataTable } from '@repo/table';
import type { DataTableColumn } from '@repo/table';
import { useState } from 'react';
import { Text, YStack } from 'tamagui';

import { fieldtypeToTableField } from '../../fieldRegistry';
import { FrappeStoryProvider } from '../../frappeStoryTarget';

import { TextEditor } from '.';
import type { TextEditorProps } from '.';

export default {
  title: 'FrappeUI/TextEditor',
  component: TextEditor,
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component: 'Frappe Text Editor / HTML Editor field (tiptap-based rich text adapter).',
      },
    },
  },
  argTypes: {
    label: { control: 'text' },
    value: { control: 'text' },
    disabled: { control: 'boolean' },
    required: { control: 'boolean' },
    error: { control: 'text' },
    placeholder: { control: 'text' },
    minHeight: { control: 'number' },
  },
};

type StoryProps = TextEditorProps & Record<string, unknown>;

function Controlled(props: Omit<StoryProps, 'onChange'>) {
  const [value, setValue] = useState(props.value ?? '');
  return (
    <TextEditor
      {...(props as any)}
      value={value}
      onChange={(v: string) => {
        setValue(v);
        action('onChange')(v);
      }}
    />
  );
}

export const Main = (args: StoryProps) => <Controlled {...args} />;
Main.args = {
  label: 'Description',
  value: '<p>Hello <strong>world</strong>. This is <em>rich</em> text.</p>',
} as Partial<StoryProps>;
Main.storyName = 'Main';

export const ExternalValueUpdates = {
  name: 'External value updates',
  render: function ExternalValueUpdatesStory() {
    const [value, setValue] = useState('<p>Original note</p>');
    const [edits, setEdits] = useState(0);
    return (
      <YStack
        gap="$3"
        maxWidth={640}>
        <TextEditor
          label="Note"
          value={value}
          onChange={(next) => {
            setValue(next);
            setEdits((count) => count + 1);
          }}
        />
        <Button
          onPress={() => {
            setEdits(0);
            setValue('<p>Saved note</p>');
          }}>
          Load saved note
        </Button>
        <Text testID="editor-user-edits">User edits: {edits}</Text>
      </YStack>
    );
  },
};

export const Empty = (args: StoryProps) => <Controlled {...args} />;
Empty.args = {
  label: 'Empty editor',
  value: '',
  placeholder: 'Start writing...',
} as Partial<StoryProps>;

export const LargeContent = (args: StoryProps) => <Controlled {...args} />;
LargeContent.args = {
  label: 'Large content',
  value: Array.from(
    { length: 20 },
    (_, i) =>
      `<h2>Section ${i + 1}</h2><p>Paragraph with <a href="https://example.com">a link</a>, a <code>code span</code>, and more prose to scroll.</p><blockquote>Quote ${i + 1}</blockquote>`,
  ).join(''),
  minHeight: 200,
} as Partial<StoryProps>;

export const States = (args: StoryProps) => (
  <YStack
    gap="$4"
    maxWidth={640}>
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
  </YStack>
);
States.args = {
  value: '<p>Stateful content</p>',
} as Partial<StoryProps>;

/**
 * Thin-adapter contract probe: TextEditorProps has no readOnly / skeleton /
 * compact / helperText at all — these spreads land on the YStack wrapper.
 */
export const ContractProbe = (args: StoryProps) => (
  <YStack
    gap="$4"
    maxWidth={640}>
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
  value: '<p>Probe content</p>',
} as Partial<StoryProps>;

interface TextEditorCellRow {
  id: string;
  label: string;
  value: string;
}

const textEditorCellRows: TextEditorCellRow[] = [
  {
    id: '1',
    label: 'Alpha',
    value: '<p>Hello <strong>world</strong>. This is <em>rich</em> text.</p>',
  },
  {
    id: '2',
    label: 'Beta',
    value: '<p>See the <a href="https://example.com">release notes</a>.</p>',
  },
  { id: '3', label: 'Gamma', value: '' },
];

const textEditorCellColumns: DataTableColumn<TextEditorCellRow>[] = [
  { accessorKey: 'label', header: 'Row' },
  {
    accessorKey: 'value',
    header: 'Text Editor',
    ...fieldtypeToTableField('Text Editor'),
  } as DataTableColumn<TextEditorCellRow>,
];

function InTableStory() {
  const [data, setData] = useState(textEditorCellRows);
  return (
    <YStack
      width="100%"
      height={280}>
      <DataTable
        data={data}
        columns={textEditorCellColumns as DataTableColumn<Record<string, any>>[]}
        enablePagination={false}
        onDataChange={(next: Record<string, any>[]) => {
          setData(next as TextEditorCellRow[]);
          action('onDataChange')(next);
        }}
        aria-label="Text Editor cell editor table"
      />
    </YStack>
  );
}

/** 3-row DataTable mapped through fieldtypeToTableField("Text Editor") — richtext cell. */
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
        'Text Editor inside a table cell: the registry maps the fieldtype to a richtexteditor cell (popover over the anchor, LC-06). Three rows of mock DocType data; edits commit through onDataChange.',
    },
  },
};
