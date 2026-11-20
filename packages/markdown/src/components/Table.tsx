/**
 * Plain-markdown table renderer.
 *
 * Built on `@repo/table-primitives` so plain-markdown tables
 * render real `<table>/<thead>/<tbody>/<tr>/<th>/<td>` semantics and match
 * the MDX table styling. The renderer emits a flat list of rows (first row
 * flagged `isHeader`); MarkdownTable partitions them into head and body.
 */

import { Table } from '@repo/table-primitives';
import { ScrollView } from '@repo/ui';
import { Children, isValidElement } from 'react';
import type { ReactNode } from 'react';
import { Paragraph, YStack } from 'tamagui';

import { useMarkdownTableKnobs } from '../shared/use-markdown-table-knobs';
import type { TableProps, TableRowProps, TableCellProps } from '../types';

const isHeaderRow = (row: ReactNode): boolean => isValidElement<TableRowProps>(row) && row.props.isHeader === true;

export const MarkdownTable = ({ children }: TableProps) => {
  const { frameProps, headRule } = useMarkdownTableKnobs();
  // oxlint-disable-next-line react/no-react-children -- the renderer emits a flat row list as children; partitioning into thead/tbody must read each row's isHeader prop
  const rows = Children.toArray(children);
  const headerRows = rows.filter((row) => isHeaderRow(row));
  const bodyRows = rows.filter((row) => !isHeaderRow(row));

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      marginVertical="$3">
      <YStack minWidth="100%">
        <Table
          render="table"
          // Size by content inside the horizontal scroller: a real <table> with
          // width:100% against the scroller's indefinite width hits Chromium's
          // 1e6px table clamp. Auto width + auto layout = GitHub-style
          // shrink-to-fit columns; cellWidth="auto" lifts the token width cap.
          width="auto"
          cellWidth="auto"
          style={{ tableLayout: 'auto' }}
          alignCells={{ x: 'start', y: 'center' }}
          alignHeaderCells={{ x: 'start', y: 'center' }}
          {...frameProps}>
          {headerRows.length > 0 && (
            <Table.Head
              render="thead"
              {...headRule}>
              {headerRows}
            </Table.Head>
          )}
          <Table.Body render="tbody">{bodyRows}</Table.Body>
        </Table>
      </YStack>
    </ScrollView>
  );
};

// `isHeader` is consumed by MarkdownTable to place the row in thead/tbody.
export const MarkdownTableRow = ({ children }: TableRowProps) => <Table.Row render="tr">{children}</Table.Row>;

export const MarkdownTableCell = ({ children, isHeader, align }: TableCellProps) => {
  const { headerTextProps, cellTextProps, cellPad } = useMarkdownTableKnobs();
  const textAlign = align ?? 'left';

  if (isHeader) {
    return (
      <Table.HeaderCell
        render="th"
        {...cellPad}>
        <Paragraph
          render="span"
          display="block"
          {...headerTextProps}
          textAlign={textAlign}>
          {children}
        </Paragraph>
      </Table.HeaderCell>
    );
  }

  return (
    <Table.Cell
      render="td"
      {...cellPad}>
      <Paragraph
        render="span"
        display="block"
        {...cellTextProps}
        textAlign={textAlign}>
        {children}
      </Paragraph>
    </Table.Cell>
  );
};
