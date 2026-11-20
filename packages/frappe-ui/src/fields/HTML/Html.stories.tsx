import { DataTable } from '@repo/table';
import type { DataTableColumn } from '@repo/table';
import { YStack } from 'tamagui';

import { fieldtypeToTableField } from '../../field-registry';
import { FrappeStoryProvider } from '../../frappe-story-target';

import { Html } from '.';
import type { HtmlProps } from '.';

export default {
  title: 'FrappeUI/Html',
  component: Html,
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          'Frappe HTML field: read-only sanitized HTML display panel (scripts, event handlers, and dangerous URIs stripped).',
      },
    },
  },
  argTypes: {
    label: { control: 'text' },
    value: { control: 'text' },
  },
};

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Storybook args bag forwarded verbatim to the field
type StoryProps = HtmlProps & Record<string, unknown>;

export const Main = (args: StoryProps) => <Html {...(args as any)} />;
Main.args = {
  label: 'Rendered HTML',
  value:
    '<h3>Heading</h3><p>Paragraph with <strong>bold</strong>, <em>italic</em>, and <a href="https://example.com">a link</a>.</p><ul><li>Item one</li><li>Item two</li></ul>',
} as Partial<StoryProps>;
Main.storyName = 'Main';

export const Empty = (args: StoryProps) => <Html {...(args as any)} />;
Empty.args = { label: 'Empty', value: '' } as Partial<StoryProps>;

// Sanitizer probe: script body + img onerror must not execute; surrounding text stays.
export const UnsafeContent = (args: StoryProps) => <Html {...(args as any)} />;
UnsafeContent.args = {
  label: 'Unsafe content (script + onerror must be stripped)',
  value:
    '<p id="before-script">Visible text</p><script>window.__HTML_FIELD_XSS__ = true;</script><p>Text after script</p><img src="x" onerror="window.__HTML_FIELD_ONERROR__ = true" alt="broken" />',
} as Partial<StoryProps>;

export const RichContent = (args: StoryProps) => <Html {...(args as any)} />;
RichContent.args = {
  label: 'Tables, images, long content',
  value:
    `<table border='1'><tr><th>Col A</th><th>Col B</th></tr><tr><td>1</td><td>2</td></tr></table>` +
    `<p>${'Long unbroken content '.repeat(60)}</p>` +
    `<pre>preformatted    spacing</pre>`,
} as Partial<StoryProps>;

/**
 * Contract probe: Html surfaces error / required / helperText / skeleton /
 * compact (display-field chrome; readOnly is a no-op passthrough).
 */
export const ContractProbe = (args: StoryProps) => (
  <YStack
    gap="$4"
    maxWidth={640}>
    <Html
      {...(args as any)}
      label="error+required+helper probe"
      error="err"
      required
      helperText="help"
    />
    <Html
      {...(args as any)}
      label="skeleton probe"
      skeleton
    />
    <Html
      {...(args as any)}
      label="compact probe"
      compact
      value="<p>Compact</p>"
    />
  </YStack>
);
ContractProbe.args = { value: '<p>Probe content</p>' } as Partial<StoryProps>;

interface HtmlCellRow {
  id: string;
  label: string;
  value: string;
}

const htmlCellRows: HtmlCellRow[] = [
  { id: '1', label: 'Alpha', value: '<p><strong>In stock</strong></p>' },
  { id: '2', label: 'Beta', value: '<p>Backorder — <em>ETA Friday</em></p>' },
  { id: '3', label: 'Gamma', value: '' },
];

const htmlMapped = fieldtypeToTableField('HTML');

const htmlCellColumns: DataTableColumn<HtmlCellRow>[] = [
  { accessorKey: 'label', header: 'Row' },
  {
    accessorKey: 'value',
    header: 'HTML',
    ...htmlMapped,
  } as DataTableColumn<HtmlCellRow>,
];

const InTableStory = () => (
  <YStack
    width="100%"
    height={280}>
    <DataTable
      data={htmlCellRows}
      columns={htmlCellColumns}
      enablePagination={false}
      readOnly
      aria-label="HTML read-only cell table"
    />
  </YStack>
);

/**
 * HTML is TABLE_LAYOUT — never an editable child-table column. fieldtypeToTableField
 * falls through to a read-only input; the table is mounted readOnly.
 */
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
        'HTML is a layout-only fieldtype (TABLE_LAYOUT_TYPES). This story shows a 3-row read-only column from fieldtypeToTableField("HTML") — not an editable cell.',
    },
  },
};
