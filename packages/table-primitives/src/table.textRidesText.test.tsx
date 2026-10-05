/**
 * Table.Cell and Table.HeaderCell wrap
 * ALL bare string/number children — runs of adjacent strings coalesce into
 * the cell's SizableText — so `{value}{cond ? suffix : ""}` renders the
 * concatenated text instead of tripping the native "Text strings must be
 * rendered within a <Text> component" invariant.
 *
 * A wrapped run renders a Text element (<span>); a bare run's direct text
 * holder would be the <td>/<th> itself — asserting the getByText match is
 * not the cell element proves the string rides a Text component.
 */

import { renderWithProviders } from '@repo/test-utils';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Table } from './index';

function renderTable(headerChildren: React.ReactNode, cellChildren: React.ReactNode) {
  return renderWithProviders(
    <Table>
      <Table.Head>
        <Table.Row>
          <Table.HeaderCell>{headerChildren}</Table.HeaderCell>
        </Table.Row>
      </Table.Head>
      <Table.Body>
        <Table.Row>
          <Table.Cell>{cellChildren}</Table.Cell>
        </Table.Row>
      </Table.Body>
    </Table>,
  );
}

describe('Table primitives wrap bare text children', () => {
  it('renders array-of-strings cell children as one concatenated wrapped run', () => {
    renderTable('Weight', ['42', ' kg']);
    const value = screen.getByText('42 kg');
    expect(value).toBeInTheDocument();
    expect(value.tagName).not.toBe('TD');
    expect(value.tagName).not.toBe('DIV');
  });

  it('renders array-of-strings header cell children wrapped', () => {
    renderTable(['Total', ' (USD)'], '100');
    const label = screen.getByText('Total (USD)');
    expect(label).toBeInTheDocument();
    expect(label.tagName).not.toBe('TH');
    expect(label.tagName).not.toBe('DIV');
  });

  it('renders the origin shape `{value}{cond ? suffix : ""}` when the condition is false', () => {
    const delta: number = 0;
    renderTable('Price', ['$5.00', delta !== 0 ? ` +$${delta}` : '']);
    const value = screen.getByText('$5.00');
    expect(value.tagName).not.toBe('TD');
    expect(value.tagName).not.toBe('DIV');
  });

  it('wraps array string children in the cards layout value slot', () => {
    renderWithProviders(
      <Table layout="cards">
        <Table.Head>
          <Table.Row>
            <Table.HeaderCell>Weight</Table.HeaderCell>
          </Table.Row>
        </Table.Head>
        <Table.Body>
          <Table.Row>
            <Table.Cell>{['42', ' kg']}</Table.Cell>
          </Table.Row>
        </Table.Body>
      </Table>,
    );
    const value = screen.getByText('42 kg');
    expect(value).toBeInTheDocument();
    expect(value.tagName).not.toBe('DIV');
  });
});
