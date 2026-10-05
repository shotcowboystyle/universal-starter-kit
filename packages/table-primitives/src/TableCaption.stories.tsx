import { Table, type TableCaptionProps } from '@repo/table-primitives';

const TableCaption = Table.Caption;

export default {
  title: 'Table/Caption',
  component: TableCaption,
  parameters: { status: { type: 'beta' } },
};

/** A real `<caption>` as the table's accessible name, above the head. */
function CaptionDemo(props: Partial<TableCaptionProps>) {
  return (
    <Table>
      <Table.Caption {...props}>Monthly sales, Q3</Table.Caption>
      <Table.Head>
        <Table.Row>
          <Table.HeaderCell>Month</Table.HeaderCell>
          <Table.HeaderCell>Orders</Table.HeaderCell>
          <Table.HeaderCell>Revenue</Table.HeaderCell>
        </Table.Row>
      </Table.Head>
      <Table.Body>
        <Table.Row>
          <Table.Cell>July</Table.Cell>
          <Table.Cell>120</Table.Cell>
          <Table.Cell>9,800</Table.Cell>
        </Table.Row>
        <Table.Row>
          <Table.Cell>August</Table.Cell>
          <Table.Cell>134</Table.Cell>
          <Table.Cell>11,200</Table.Cell>
        </Table.Row>
      </Table.Body>
    </Table>
  );
}

export const main = {
  name: 'Main',
  render: (args: Partial<TableCaptionProps>) => <CaptionDemo {...args} />,
};

/** Caption survives the card layout: it renders above the card list. */
export const cardLayout = {
  name: 'Card layout',
  render: () => (
    <Table layout="cards">
      <Table.Caption>Monthly sales, Q3</Table.Caption>
      <Table.Head>
        <Table.Row>
          <Table.HeaderCell>Month</Table.HeaderCell>
          <Table.HeaderCell>Orders</Table.HeaderCell>
        </Table.Row>
      </Table.Head>
      <Table.Body>
        <Table.Row>
          <Table.Cell>July</Table.Cell>
          <Table.Cell>120</Table.Cell>
        </Table.Row>
      </Table.Body>
    </Table>
  ),
};
