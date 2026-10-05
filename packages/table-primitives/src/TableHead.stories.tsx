import { Table, type TableHeadProps } from '@repo/table-primitives';

const TableHead = Table.Head;

export default {
  title: 'Table/Head',
  component: TableHead,
  parameters: { status: { type: 'beta' } },
};

function HeadDemo(props: Partial<TableHeadProps>) {
  return (
    <Table>
      <Table.Head {...props}>
        <Table.Row>
          <Table.HeaderCell>Name</Table.HeaderCell>
          <Table.HeaderCell>Role</Table.HeaderCell>
          <Table.HeaderCell>Team</Table.HeaderCell>
        </Table.Row>
      </Table.Head>
      <Table.Body>
        <Table.Row>
          <Table.Cell>Ada Lovelace</Table.Cell>
          <Table.Cell>Analyst</Table.Cell>
          <Table.Cell>Mathematics</Table.Cell>
        </Table.Row>
        <Table.Row>
          <Table.Cell>Grace Hopper</Table.Cell>
          <Table.Cell>Commodore</Table.Cell>
          <Table.Cell>Navy</Table.Cell>
        </Table.Row>
      </Table.Body>
    </Table>
  );
}

export const main = {
  name: 'Main',
  render: (args: Partial<TableHeadProps>) => <HeadDemo {...args} />,
};

/** Head as the subject: the row group with no body below it. */
export const headerOnly = {
  name: 'Header only',
  render: () => (
    <Table>
      <Table.Head>
        <Table.Row>
          <Table.HeaderCell>Name</Table.HeaderCell>
          <Table.HeaderCell>Role</Table.HeaderCell>
          <Table.HeaderCell>Team</Table.HeaderCell>
        </Table.Row>
      </Table.Head>
    </Table>
  ),
};
