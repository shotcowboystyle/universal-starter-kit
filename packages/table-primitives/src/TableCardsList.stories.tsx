import { Table } from './index';

export default {
  title: 'Table/TableCardsList',
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          'TableCardsList is the layout=cards body: each body row becomes a stacked label/value card. Foot has no card slot. Caption stays above the list.',
      },
    },
  },
};

export const main = {
  name: 'Main',
  render: () => (
    <Table layout="cards">
      <Table.Caption>Monthly sales, Q3</Table.Caption>
      <Table.Head>
        <Table.Row>
          <Table.HeaderCell>Name</Table.HeaderCell>
          <Table.HeaderCell>Age</Table.HeaderCell>
          <Table.HeaderCell>City</Table.HeaderCell>
        </Table.Row>
      </Table.Head>
      <Table.Body>
        <Table.Row>
          <Table.Cell>John Doe</Table.Cell>
          <Table.Cell>30</Table.Cell>
          <Table.Cell>New York</Table.Cell>
        </Table.Row>
        <Table.Row error>
          <Table.Cell>Jane Smith</Table.Cell>
          <Table.Cell>25</Table.Cell>
          <Table.Cell>Los Angeles</Table.Cell>
        </Table.Row>
      </Table.Body>
    </Table>
  ),
};
