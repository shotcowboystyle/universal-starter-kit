import { ScrollView } from '@repo/ui';
import { Table as BaseTable } from '@repo/table-primitives';
import type { ReactNode } from 'react';
import { Paragraph, YStack, styled } from 'tamagui';

import { useMarkdownTableKnobs } from '../shared/useMarkdownTableKnobs';

const MDXTableFrame = styled(YStack, {
  marginVertical: '$4',
  overflow: 'hidden',
});

export function MDXTable({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) {
  const { frameProps } = useMarkdownTableKnobs();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}>
      <MDXTableFrame>
        <BaseTable
          render="table"
          // Auto width/layout: a real <table> with width:100% against the
          // scroller's indefinite width hits Chromium's 1e6px table clamp.
          width="auto"
          cellWidth="auto"
          style={{ tableLayout: 'auto' }}
          alignCells={{ x: 'start', y: 'center' }}
          alignHeaderCells={{ x: 'start', y: 'center' }}
          {...frameProps}
          {...props}>
          {children}
        </BaseTable>
      </MDXTableFrame>
    </ScrollView>
  );
}

export function MDXTableHead({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) {
  const { headRule } = useMarkdownTableKnobs();
  return (
    <BaseTable.Head
      render="thead"
      {...headRule}
      {...props}>
      {children}
    </BaseTable.Head>
  );
}

export function MDXTableBody({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) {
  return (
    <BaseTable.Body
      render="tbody"
      {...props}>
      {children}
    </BaseTable.Body>
  );
}

export function MDXTableRow({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) {
  return (
    <BaseTable.Row
      render="tr"
      rowLocation="middle"
      {...props}>
      {children}
    </BaseTable.Row>
  );
}

export function MDXTableHeaderCell({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) {
  const { headerTextProps, cellPad } = useMarkdownTableKnobs();
  return (
    <BaseTable.HeaderCell
      render="th"
      {...cellPad}
      {...props}>
      <Paragraph {...headerTextProps}>{children}</Paragraph>
    </BaseTable.HeaderCell>
  );
}

export function MDXTableCell({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) {
  const { cellTextProps, cellPad } = useMarkdownTableKnobs();
  return (
    <BaseTable.Cell
      render="td"
      {...cellPad}
      {...props}>
      <Paragraph
        render="span"
        display="block"
        {...cellTextProps}>
        {children}
      </Paragraph>
    </BaseTable.Cell>
  );
}
