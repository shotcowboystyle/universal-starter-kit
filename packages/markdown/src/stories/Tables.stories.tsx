import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { Paragraph, YStack } from 'tamagui';

import { MarkdownTable, MarkdownTableRow, MarkdownTableCell } from '../components/Table';
import { MarkdownSimpleTable } from '../MarkdownSimpleTable';
import { TableHighlight } from '../mdxComponents';
import { MDXTable, MDXTableBody, MDXTableCell, MDXTableHead, MDXTableHeaderCell, MDXTableRow } from '../Table';

const meta: Meta = {
  title: 'Markdown/Tables',
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          'Markdown table renderer (MarkdownTable), MDX table (table-primitives), MarkdownSimpleTable, TableHighlight.',
      },
    },
  },
};

export default meta;
type Story = StoryObj;

export const MarkdownTableRenderer: Story = {
  render: () => (
    <YStack
      maxWidth={700}
      padding="$4">
      <MarkdownTable>
        <MarkdownTableRow isHeader>
          <MarkdownTableCell isHeader>Feature</MarkdownTableCell>
          <MarkdownTableCell
            isHeader
            align="center">
            Web
          </MarkdownTableCell>
          <MarkdownTableCell
            isHeader
            align="right">
            Native
          </MarkdownTableCell>
        </MarkdownTableRow>
        <MarkdownTableRow>
          <MarkdownTableCell>Markdown</MarkdownTableCell>
          <MarkdownTableCell align="center">Yes</MarkdownTableCell>
          <MarkdownTableCell align="right">Yes</MarkdownTableCell>
        </MarkdownTableRow>
        <MarkdownTableRow>
          <MarkdownTableCell>
            A very long cell value that should push the row wide and prove horizontal overflow scrolls inside the table
            wrapper rather than the page
          </MarkdownTableCell>
          <MarkdownTableCell align="center">short</MarkdownTableCell>
          <MarkdownTableCell align="right">short</MarkdownTableCell>
        </MarkdownTableRow>
      </MarkdownTable>
    </YStack>
  ),
};

export const MarkdownTableEdge: Story = {
  render: () => (
    <YStack
      maxWidth={700}
      padding="$4">
      <Paragraph>No header:</Paragraph>
      <MarkdownTable>
        <MarkdownTableRow>
          <MarkdownTableCell>a</MarkdownTableCell>
          <MarkdownTableCell>b</MarkdownTableCell>
        </MarkdownTableRow>
      </MarkdownTable>
      <Paragraph>Ragged rows (2 vs 3 cells):</Paragraph>
      <MarkdownTable>
        <MarkdownTableRow isHeader>
          <MarkdownTableCell isHeader>one</MarkdownTableCell>
          <MarkdownTableCell isHeader>two</MarkdownTableCell>
          <MarkdownTableCell isHeader>three</MarkdownTableCell>
        </MarkdownTableRow>
        <MarkdownTableRow>
          <MarkdownTableCell>only</MarkdownTableCell>
          <MarkdownTableCell>two</MarkdownTableCell>
        </MarkdownTableRow>
      </MarkdownTable>
      <Paragraph>Empty:</Paragraph>
      <MarkdownTable>{null}</MarkdownTable>
    </YStack>
  ),
};

export const MdxTable: Story = {
  name: 'MDXTable',
  render: () => (
    <YStack
      maxWidth={700}
      padding="$4">
      <MDXTable>
        <MDXTableHead>
          <MDXTableRow>
            <MDXTableHeaderCell>Prop</MDXTableHeaderCell>
            <MDXTableHeaderCell>Type</MDXTableHeaderCell>
            <MDXTableHeaderCell>Default</MDXTableHeaderCell>
          </MDXTableRow>
        </MDXTableHead>
        <MDXTableBody>
          <MDXTableRow>
            <MDXTableCell>size</MDXTableCell>
            <MDXTableCell>string</MDXTableCell>
            <MDXTableCell>$5</MDXTableCell>
          </MDXTableRow>
          <MDXTableRow>
            <MDXTableCell>
              a very long cell that keeps going and going to force horizontal overflow behaviour in the MDX table
              wrapper scroll view
            </MDXTableCell>
            <MDXTableCell>ragged</MDXTableCell>
          </MDXTableRow>
          <MDXTableRow>
            <MDXTableCell>
              <Paragraph fontWeight="700">custom node cell</Paragraph>
            </MDXTableCell>
            <MDXTableCell>ReactNode</MDXTableCell>
            <MDXTableCell>—</MDXTableCell>
          </MDXTableRow>
        </MDXTableBody>
      </MDXTable>
      <Paragraph>Empty:</Paragraph>
      <MDXTable>{null}</MDXTable>
    </YStack>
  ),
};

export const MarkdownSimpleTableStory: Story = {
  name: 'MarkdownSimpleTable',
  args: {
    headers: ['Name', 'Description', 'Docs'],
    rows: [
      ['alpha', 'Plain cell', '[link](https://example.com)'],
      ['`inline code`', '**bold cell**', '**[bold link](https://example.com)**'],
      [
        'long',
        'A very long description cell that runs on well past a comfortable width to prove wrapping or overflow inside the simple table',
        'plain',
      ],
    ],
  },
  argTypes: {
    headers: { control: 'object' },
    rows: { control: 'object' },
  },
  render: (args: any) => (
    <YStack
      maxWidth={700}
      padding="$4">
      <MarkdownSimpleTable
        headers={args.headers}
        rows={args.rows}
      />
    </YStack>
  ),
};

export const MarkdownSimpleTableEmpty: Story = {
  render: () => (
    <YStack
      maxWidth={700}
      padding="$4">
      <MarkdownSimpleTable
        headers={[]}
        rows={[]}
      />
    </YStack>
  ),
};

export const TableHighlightStory: Story = {
  name: 'TableHighlight',
  render: () => (
    <YStack
      maxWidth={700}
      padding="$4">
      <YStack
        position="relative"
        height={80}
        borderWidth={1}
        borderColor="$color5">
        <TableHighlight />
        <Paragraph padding="$3">row content sitting above the highlight layer</Paragraph>
      </YStack>
    </YStack>
  ),
};
