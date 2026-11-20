import { Table as BaseTable } from '@repo/table-primitives';
import { ScrollView } from '@repo/ui';
import type { GetProps } from 'tamagui';
import { Paragraph, YStack, styled } from 'tamagui';

import { useMarkdownTableKnobs } from '../shared/use-markdown-table-knobs';

const MDXTableFrame = styled(YStack, {
  marginVertical: '$4',
  overflow: 'hidden',
});

export const MDXTable = ({ children, ...props }: GetProps<typeof BaseTable>) => {
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
};

export const MDXTableHead = ({ children, ...props }: GetProps<typeof BaseTable.Head>) => {
  const { headRule } = useMarkdownTableKnobs();
  return (
    <BaseTable.Head
      render="thead"
      {...headRule}
      {...props}>
      {children}
    </BaseTable.Head>
  );
};

export const MDXTableBody = ({ children, ...props }: GetProps<typeof BaseTable.Body>) => (
  <BaseTable.Body
    render="tbody"
    {...props}>
    {children}
  </BaseTable.Body>
);

export const MDXTableRow = ({ children, ...props }: GetProps<typeof BaseTable.Row>) => (
  <BaseTable.Row
    render="tr"
    rowLocation="middle"
    {...props}>
    {children}
  </BaseTable.Row>
);

export const MDXTableHeaderCell = ({ children, ...props }: GetProps<typeof BaseTable.HeaderCell>) => {
  const { headerTextProps, cellPad } = useMarkdownTableKnobs();
  return (
    <BaseTable.HeaderCell
      render="th"
      {...cellPad}
      {...props}>
      <Paragraph {...headerTextProps}>{children}</Paragraph>
    </BaseTable.HeaderCell>
  );
};

export const MDXTableCell = ({ children, ...props }: GetProps<typeof BaseTable.Cell>) => {
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
};
