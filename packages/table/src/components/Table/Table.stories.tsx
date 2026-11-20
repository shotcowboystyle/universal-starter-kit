import { Table } from '@repo/table-primitives';
import type { TableProps } from '@repo/table-primitives';

export default {
  title: 'Table/Table',
  component: Table,
  parameters: { status: { type: 'beta' } },
};

const MainRender = (props: TableProps) => (
  <Table {...props}>
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
      <Table.Row>
        <Table.Cell>Jane Smith</Table.Cell>
        <Table.Cell>25</Table.Cell>
        <Table.Cell>Los Angeles</Table.Cell>
      </Table.Row>
    </Table.Body>
  </Table>
);

export const main = {
  name: 'Main',
  args: {
    cellWidth: '$8',
  } satisfies Partial<TableProps>,
  render: (args: TableProps) => <MainRender {...args} />,
};

export const withRowLocations = () => (
  <Table>
    <Table.Head>
      <Table.Row>
        <Table.HeaderCell>Status</Table.HeaderCell>
        <Table.HeaderCell>Task</Table.HeaderCell>
      </Table.Row>
    </Table.Head>
    <Table.Body>
      <Table.Row rowLocation="first">
        <Table.Cell>Done</Table.Cell>
        <Table.Cell>Complete project setup</Table.Cell>
      </Table.Row>
      <Table.Row rowLocation="middle">
        <Table.Cell>In Progress</Table.Cell>
        <Table.Cell>Implement authentication</Table.Cell>
      </Table.Row>
      <Table.Row rowLocation="last">
        <Table.Cell>Pending</Table.Cell>
        <Table.Cell>Write documentation</Table.Cell>
      </Table.Row>
    </Table.Body>
  </Table>
);

export const withCustomWidths = () => (
  <Table>
    <Table.Head>
      <Table.Row>
        <Table.HeaderCell {...({ cellWidth: '$6' } as const)}>ID</Table.HeaderCell>
        <Table.HeaderCell {...({ cellWidth: '$12' } as const)}>Name</Table.HeaderCell>
        <Table.HeaderCell {...({ cellWidth: '$10' } as const)}>Role</Table.HeaderCell>
      </Table.Row>
    </Table.Head>
    <Table.Body>
      <Table.Row>
        <Table.Cell {...({ cellWidth: '$6' } as const)}>1</Table.Cell>
        <Table.Cell {...({ cellWidth: '$12' } as const)}>Alice Johnson</Table.Cell>
        <Table.Cell {...({ cellWidth: '$10' } as const)}>Developer</Table.Cell>
      </Table.Row>
      <Table.Row>
        <Table.Cell {...({ cellWidth: '$6' } as const)}>2</Table.Cell>
        <Table.Cell {...({ cellWidth: '$12' } as const)}>Bob Smith</Table.Cell>
        <Table.Cell {...({ cellWidth: '$10' } as const)}>Designer</Table.Cell>
      </Table.Row>
    </Table.Body>
  </Table>
);

export const emptyTable = () => (
  <Table>
    <Table.Head>
      <Table.Row>
        <Table.HeaderCell>Name</Table.HeaderCell>
        <Table.HeaderCell>Email</Table.HeaderCell>
        <Table.HeaderCell>Status</Table.HeaderCell>
      </Table.Row>
    </Table.Head>
    <Table.Body>
      <Table.Row>
        <Table.Cell>No data available</Table.Cell>
      </Table.Row>
    </Table.Body>
  </Table>
);

/**
 * Card layout: each body row renders as a stacked card of label/value
 * pairs (labels from the header cells). `layout="auto"` switches
 * automatically below the `$sm` breakpoint; `layout="cards"` pins it
 * so the story shows cards at any viewport.
 */
export const cardLayout = () => (
  <Table layout="cards">
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
      <Table.Row>
        <Table.Cell>Sam Lee</Table.Cell>
        <Table.Cell>41</Table.Cell>
        <Table.Cell>Chicago</Table.Cell>
      </Table.Row>
    </Table.Body>
  </Table>
);

/** Responsive default: grid at desktop widths, cards below `$sm` (640). */
export const responsiveAuto = () => (
  <Table layout="auto">
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
      <Table.Row>
        <Table.Cell>Jane Smith</Table.Cell>
        <Table.Cell>25</Table.Cell>
        <Table.Cell>Los Angeles</Table.Cell>
      </Table.Row>
    </Table.Body>
  </Table>
);

/**
 * All four `Table.Row` intents side by side (`accent` / `error` /
 * `warning` / `success`); a plain row anchors the baseline. Row
 * backgrounds come from the intent theme ramps, so they track the
 * active theme in both light and dark mode.
 */
export const allIntents = () => (
  <Table>
    <Table.Head>
      <Table.Row>
        <Table.HeaderCell>Intent</Table.HeaderCell>
        <Table.HeaderCell>Event</Table.HeaderCell>
        <Table.HeaderCell>Detail</Table.HeaderCell>
      </Table.Row>
    </Table.Head>
    <Table.Body>
      <Table.Row rowLocation="first">
        <Table.Cell>none</Table.Cell>
        <Table.Cell>Baseline row</Table.Cell>
        <Table.Cell>Default surface</Table.Cell>
      </Table.Row>
      <Table.Row
        accent
        rowLocation="middle">
        <Table.Cell>accent</Table.Cell>
        <Table.Cell>Row selected</Table.Cell>
        <Table.Cell>Highlighted for emphasis</Table.Cell>
      </Table.Row>
      <Table.Row
        error
        rowLocation="middle">
        <Table.Cell>error</Table.Cell>
        <Table.Cell>Sync failed</Table.Cell>
        <Table.Cell>Record needs attention</Table.Cell>
      </Table.Row>
      <Table.Row
        warning
        rowLocation="middle">
        <Table.Cell>warning</Table.Cell>
        <Table.Cell>Quota near limit</Table.Cell>
        <Table.Cell>Approaching threshold</Table.Cell>
      </Table.Row>
      <Table.Row
        success
        rowLocation="last">
        <Table.Cell>success</Table.Cell>
        <Table.Cell>Import complete</Table.Cell>
        <Table.Cell>All rows processed</Table.Cell>
      </Table.Row>
    </Table.Body>
  </Table>
);
