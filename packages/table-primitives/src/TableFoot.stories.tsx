import { Table, type TableFootProps } from '@repo/table-primitives';

const TableFoot = Table.Foot;

export default {
  title: 'Table/Foot',
  component: TableFoot,
  parameters: { status: { type: 'beta' } },
};

/** A real `<tfoot>` under a body: totals row in the footer row group. */
function FootDemo(props: Partial<TableFootProps>) {
  return (
    <Table>
      <Table.Head>
        <Table.Row>
          <Table.HeaderCell>Item</Table.HeaderCell>
          <Table.HeaderCell>Qty</Table.HeaderCell>
          <Table.HeaderCell>Amount</Table.HeaderCell>
        </Table.Row>
      </Table.Head>
      <Table.Body>
        <Table.Row>
          <Table.Cell>Widget</Table.Cell>
          <Table.Cell>4</Table.Cell>
          <Table.Cell>40.00</Table.Cell>
        </Table.Row>
        <Table.Row>
          <Table.Cell>Gadget</Table.Cell>
          <Table.Cell>1</Table.Cell>
          <Table.Cell>15.50</Table.Cell>
        </Table.Row>
      </Table.Body>
      <Table.Foot {...props}>
        <Table.Row>
          <Table.Cell>Total</Table.Cell>
          <Table.Cell>5</Table.Cell>
          <Table.Cell>55.50</Table.Cell>
        </Table.Row>
      </Table.Foot>
    </Table>
  );
}

export const main = {
  name: 'Main',
  render: (args: Partial<TableFootProps>) => <FootDemo {...args} />,
};

/** Foot as the subject: the row group with no body above it. */
export const footOnly = {
  name: 'Foot only',
  render: () => (
    <Table>
      <Table.Foot>
        <Table.Row>
          <Table.Cell>Total</Table.Cell>
          <Table.Cell>5</Table.Cell>
          <Table.Cell>55.50</Table.Cell>
        </Table.Row>
      </Table.Foot>
    </Table>
  ),
};
