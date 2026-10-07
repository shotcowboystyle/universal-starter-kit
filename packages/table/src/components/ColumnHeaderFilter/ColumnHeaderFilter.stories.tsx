import { useResolvedKnobs } from '@repo/theme';
import type { Meta } from '@storybook/react-native-web-vite';
import { useState } from 'react';
import { YStack, XStack, Text } from 'tamagui';

import { ColumnHeaderFilter } from './index';
import type { ColumnFilterType } from './index';

const meta: Meta = {
  title: 'Table/ColumnHeaderFilter',
  component: ColumnHeaderFilter,
  parameters: {
    status: { type: 'stable' },
  },
};

export default meta;

function ControlledColumn({
  initiallyFiltered = false,
  columnType = 'text',
}: {
  initiallyFiltered?: boolean;
  columnType?: ColumnFilterType;
}) {
  const label = columnType === 'number' ? 'Amount' : 'Invoice';
  const { knobProps } = useResolvedKnobs();
  const [filter, setFilter] = useState<{ operator: string; value: string } | undefined>(
    initiallyFiltered ? { operator: 'contains', value: 'corp' } : undefined,
  );
  return (
    <YStack
      {...knobProps.panelPadding}
      {...knobProps.gap}>
      <XStack
        alignItems="center"
        {...knobProps.gap}>
        <Text {...knobProps.label}>{label}</Text>
        <ColumnHeaderFilter
          columnId="invoice"
          columnLabel={label}
          columnType={columnType}
          filterValue={filter}
          isFiltered={filter !== undefined}
          onFilterChange={setFilter}
        />
      </XStack>
      <Text
        {...knobProps.body}
        aria-live="polite">
        {filter ? `Applied: ${filter.operator} ${filter.value ?? ''}` : 'No filter applied'}
      </Text>
    </YStack>
  );
}

export const Default = {
  name: 'Main',
  render: () => <ControlledColumn />,
};

export const Filtered = {
  render: () => <ControlledColumn initiallyFiltered />,
};

export const NumberColumn = {
  render: () => <ControlledColumn columnType="number" />,
};
