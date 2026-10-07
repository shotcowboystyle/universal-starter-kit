import { ScrollView } from '@repo/ui';
import { Table } from '@repo/table-primitives';
import type { ReactNode } from 'react';
import { Paragraph, Text, useMedia } from 'tamagui';

import { InlineCode } from '../components/InlineCode';
import { Link } from '../components/Link';
import { useMarkdownTableKnobs } from '../shared/useMarkdownTableKnobs';

type CellContent = ReactNode;

const markdownPattern = /(\*\*\[([^\]]+)\]\(([^)]+)\)\*\*)|(\[([^\]]+)\]\(([^)]+)\))|(\*\*([^*]+)\*\*)|(`([^`]+)`)/g;

function parseCell(content: CellContent): ReactNode {
  if (typeof content !== 'string') {
    return content;
  }

  const matches = [...content.matchAll(markdownPattern)];
  if (!matches.length) {
    return content;
  }

  const parts: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of matches) {
    const matchIndex = match.index ?? 0;
    if (matchIndex > lastIndex) {
      parts.push(content.slice(lastIndex, matchIndex));
    }

    const key = `m-${matchIndex}`;
    if (match[1]) {
      parts.push(
        <Text
          key={key}
          fontWeight="700">
          <Link href={match[3]}>{match[2]}</Link>
        </Text>,
      );
    } else if (match[4]) {
      parts.push(
        <Link
          key={key}
          href={match[6]}>
          {match[5]}
        </Link>,
      );
    } else if (match[7]) {
      parts.push(
        <Text
          key={key}
          fontWeight="700">
          {match[8]}
        </Text>,
      );
    } else if (match[9]) {
      parts.push(<InlineCode key={key}>{match[10]}</InlineCode>);
    }

    lastIndex = matchIndex + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex));
  }

  return parts.length === 1 ? parts[0] : parts;
}

export interface MarkdownSimpleTableProps {
  headers: CellContent[];
  rows: CellContent[][];
}

/**
 * MarkdownSimpleTable — headers/rows table for markdown-ish content.
 *
 * Cells are ReactNodes; string cells get a mini inline-markdown pass
 * (links, bold, inline code). Not a data table — for that use
 * `SimpleTable` from `@repo/table`.
 */
export function MarkdownSimpleTable({ headers, rows }: MarkdownSimpleTableProps) {
  const { frameProps, headerTextProps, cellTextProps, cellPad, headRule } = useMarkdownTableKnobs();
  const media = useMedia();
  const isMobile = media.sm;

  const table = (
    <Table
      render="table"
      // Auto width/layout: a real <table> with width:100% against the
      // scroller's indefinite width hits Chromium's 1e6px table clamp.
      width="auto"
      cellWidth="auto"
      style={{ tableLayout: 'auto' }}
      alignCells={{ x: 'start', y: 'center' }}
      alignHeaderCells={{ x: 'start', y: 'center' }}
      {...frameProps}
      {...(isMobile && { minWidth: 760 })}>
      <Table.Head
        render="thead"
        {...headRule}>
        <Table.Row
          render="tr"
          rowLocation="first">
          {headers.map((header, headerIdx) => (
            <Table.HeaderCell
              render="th"
              key={`h-${headerIdx}`}
              {...cellPad}>
              <Paragraph {...headerTextProps}>{header}</Paragraph>
            </Table.HeaderCell>
          ))}
        </Table.Row>
      </Table.Head>
      <Table.Body render="tbody">
        {rows.map((row, rowIdx) => (
          <Table.Row
            render="tr"
            key={`r-${rowIdx}`}
            rowLocation={rowIdx === rows.length - 1 ? 'last' : 'middle'}>
            {row.map((cell, cellIdx) => (
              <Table.Cell
                render="td"
                key={`c-${rowIdx}-${cellIdx}`}
                {...cellPad}>
                <Paragraph
                  render="span"
                  display="block"
                  {...cellTextProps}>
                  {parseCell(cell)}
                </Paragraph>
              </Table.Cell>
            ))}
          </Table.Row>
        ))}
      </Table.Body>
    </Table>
  );

  if (isMobile) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}>
        {table}
      </ScrollView>
    );
  }

  return table;
}
