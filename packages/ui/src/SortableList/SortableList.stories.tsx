import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useState } from 'react';

import { SortableList } from './index';

const SEED = [
  { id: 'mon', label: 'Monday standup' },
  { id: 'tue', label: 'Tuesday review' },
  { id: 'dep', label: 'Deploy window' },
  { id: 'ret', label: 'Retro notes' },
];

const meta: Meta<typeof SortableList> = {
  title: 'Components/SortableList',
  component: SortableList,
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          'Grab-handle plus keyboard reorder. One kanbanDnd session serves List, DataTable, and ChildTable (LC-16 / LC-43).',
      },
    },
  },
  argTypes: {
    disabled: { control: 'boolean' },
    readOnly: { control: 'boolean' },
    compact: { control: 'boolean' },
    disabledStyle: { control: 'select', options: ['keepLabel', 'dimWhole'] },
    emptyMessage: { control: 'text' },
  },
};
export default meta;

type Story = StoryObj<typeof SortableList>;

function Demo(props: {
  readOnly?: boolean;
  locked?: string;
  disabled?: boolean;
  compact?: boolean;
  empty?: boolean;
  disabledStyle?: 'keepLabel' | 'dimWhole';
}) {
  const [items, setItems] = useState(props.empty ? [] : SEED);
  return (
    <SortableList
      items={items}
      getId={(item) => item.id}
      getLabel={(item) => item.label}
      canReorder={props.locked ? (item) => item.id !== props.locked : undefined}
      readOnly={props.readOnly}
      disabled={props.disabled}
      compact={props.compact}
      disabledStyle={props.disabledStyle}
      emptyMessage="No rows yet"
      onChange={setItems}
      aria-label="Sprint rituals"
    />
  );
}

export const Default: Story = {
  name: 'Main',
  render: () => <Demo />,
};

export const ReadOnly: Story = {
  render: () => <Demo readOnly />,
};

export const LockedRow: Story = {
  render: () => <Demo locked="tue" />,
};

/** Board 04 — empty is a real state, not an error. */
export const Empty: Story = {
  render: () => <Demo empty />,
};

/** Board 04 — disabled list keeps labels, drops the handles. */
export const Disabled: Story = {
  render: () => <Demo disabled />,
};

/** Board 04 — compact nested well. */
export const Compact: Story = {
  render: () => <Demo compact />,
};
