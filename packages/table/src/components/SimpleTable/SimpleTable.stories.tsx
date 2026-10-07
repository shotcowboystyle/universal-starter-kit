import { useState } from 'react';

import { SimpleTable } from './index';
import type { SimpleTableColumn, SimpleTableProps } from './index';

export default {
  title: 'Table/SimpleTable',
  component: SimpleTable,
  parameters: { status: { type: 'beta' } },
};

const peopleColumns: SimpleTableColumn[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'age', header: 'Age', align: 'right' },
  { accessorKey: 'city', header: 'City' },
];

const peopleData = [
  { name: 'John Doe', age: 30, city: 'New York' },
  { name: 'Jane Smith', age: 25, city: 'Los Angeles' },
  { name: 'Sam Lee', age: 41, city: 'Chicago' },
];

export const main = {
  name: 'Main',
  args: {
    layout: 'table',
  } satisfies Partial<SimpleTableProps>,
  argTypes: {
    layout: {
      control: 'select',
      options: ['auto', 'table', 'cards'],
      description: 'Responsive layout mode',
    },
  },
  render: (args: Partial<SimpleTableProps>) => (
    <SimpleTable
      data={peopleData}
      columns={peopleColumns}
      aria-label="People"
      {...args}
    />
  ),
};

/** Per-column `align` steers both header and body cells. */
export const columnAlignment = () => (
  <SimpleTable
    aria-label="Invoices"
    layout="table"
    columns={[
      { accessorKey: 'item', header: 'Item', align: 'left' },
      { accessorKey: 'quantity', header: 'Qty', align: 'center' },
      { accessorKey: 'total', header: 'Total', align: 'right' },
    ]}
    data={[
      { item: 'Standing desk', quantity: 2, total: '$1,198.00' },
      { item: 'Monitor arm', quantity: 4, total: '$356.00' },
      { item: 'Cable tray', quantity: 10, total: '$149.50' },
    ]}
  />
);

/** Rows pick up intent theming from a `_intent` property in the data. */
export const intentRows = () => (
  <SimpleTable
    aria-label="Service status"
    layout="table"
    columns={[
      { accessorKey: 'service', header: 'Service' },
      { accessorKey: 'status', header: 'Status' },
      { accessorKey: 'uptime', header: 'Uptime', align: 'right' },
    ]}
    data={[
      { service: 'API', status: 'Operational', uptime: '99.99%' },
      { service: 'Dashboard', status: 'Selected', uptime: '99.95%', _intent: 'accent' },
      { service: 'Webhooks', status: 'Outage', uptime: '91.20%', _intent: 'error' },
      { service: 'Search', status: 'Degraded', uptime: '97.10%', _intent: 'warning' },
      { service: 'Backups', status: 'Recovered', uptime: '99.80%', _intent: 'success' },
    ]}
  />
);

/**
 * Card layout: first column is the card title; remaining fields are
 * label/value rows. `layout="cards"` pins it so the story shows cards at
 * any viewport; `_intent` rows keep their theming in card mode.
 */
export const cardLayout = () => (
  <SimpleTable
    layout="cards"
    aria-label="Service status cards"
    columns={[
      { accessorKey: 'service', header: 'Service' },
      { accessorKey: 'status', header: 'Status' },
      { accessorKey: 'uptime', header: 'Uptime' },
    ]}
    data={[
      { service: 'API', status: 'Operational', uptime: '99.99%' },
      { service: 'Webhooks', status: 'Outage', uptime: '91.20%', _intent: 'error' },
      { service: 'Backups', status: 'Recovered', uptime: '99.80%', _intent: 'success' },
    ]}
  />
);

/** Responsive default: table at desktop widths, cards below `$sm`. */
export const responsiveAuto = () => (
  <SimpleTable
    layout="auto"
    aria-label="People responsive"
    columns={peopleColumns}
    data={peopleData}
  />
);

/** Empty data renders the localized EmptyState instead of bare rows. */
export const empty = () => (
  <SimpleTable
    aria-label="People empty"
    layout="table"
    columns={peopleColumns}
    data={[]}
  />
);

/** Empty state in pinned card layout. */
export const emptyCards = () => (
  <SimpleTable
    layout="cards"
    aria-label="People empty cards"
    columns={peopleColumns}
    data={[]}
  />
);

/**
 * Row press: the row is one control. Keyboard-origin focus paints one inset
 * ring (LC-71); selected state is fill via `_intent`, never a second outline.
 */
export const rowPress = () => {
  const [selected, setSelected] = useState<string | null>('Jane Smith');
  const data = peopleData.map((row) => (row.name === selected ? { ...row, _intent: 'accent' as const } : row));
  return (
    <SimpleTable
      layout="table"
      data={data}
      columns={peopleColumns}
      aria-label="People"
      onRowPress={(row) => {
        setSelected(row.name);
      }}
      rowLabel={(row) => row.name}
    />
  );
};

/** Disabled row press: rows stay visible; activation is inert (LC-40). */
export const disabledRows = () => (
  <SimpleTable
    layout="table"
    disabled
    data={peopleData}
    columns={peopleColumns}
    aria-label="People disabled"
    onRowPress={() => {}}
    rowLabel={(row) => row.name}
  />
);
