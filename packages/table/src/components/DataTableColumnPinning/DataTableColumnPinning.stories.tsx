import { Button } from '@repo/forms';
import { action } from '@repo/storybook';
import { formatCurrency, useResolvedKnobs } from '@repo/theme';
import { PushPinIcon, PushPinSlashIcon, ArrowCounterClockwiseIcon } from '@phosphor-icons/react';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { useState } from 'react';
import { Card, H3, Paragraph, ScrollView, Separator, Text, View, XStack, YStack } from 'tamagui';

import { DataTableColumnPinning, useColumnPinning } from './index';

interface Person {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  department: string;
  role: string;
  salary: number;
  startDate: string;
  status: 'active' | 'inactive' | 'pending';
  performance: number;
}

/**
 * Seeded PRNG (mulberry32). The fixture must produce byte-identical rows on
 * every page load: `Math.random()` here redrew Salary and the performance-bar
 * width per capture, which is what flapped the visual baselines for this
 * family. Determinism at the source keeps every pixel under comparison, where
 * a screenshot mask or delay would not.
 */
const seededRandom = (seed: number) => () => {
  seed = (seed + 0x6d_2b_79_f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
};

const generateData = (count: number): Person[] => {
  const departments = ['Engineering', 'Sales', 'Marketing', 'HR', 'Finance'];
  const roles = ['Manager', 'Senior', 'Junior', 'Lead', 'Intern'];
  const statuses: ('active' | 'inactive' | 'pending')[] = ['active', 'inactive', 'pending'];
  const random = seededRandom(0x5e_ed);

  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    firstName: `First${i + 1}`,
    lastName: `Last${i + 1}`,
    email: `user${i + 1}@example.com`,
    department: departments[i % departments.length],
    role: roles[i % roles.length],
    salary: 50_000 + Math.floor(random() * 100_000),
    startDate: new Date(2020 + (i % 4), i % 12, (i % 28) + 1).toISOString().split('T')[0],
    status: statuses[i % statuses.length],
    performance: Math.floor(random() * 100),
  }));
};

const defaultData = generateData(50);
const columnHelper = createColumnHelper<Person>();

/**
 * Mini performance track. A component rather than an inline cell renderer so
 * the track's radius can follow the knob (LC-60): the previous pinned `$2`
 * outlived `borderRadius:none` on an 8px-tall bar, which reads as an
 * undeclared knob-immune shape.
 */
function PerformanceBar({ value }: { value: number }) {
  const { knobProps } = useResolvedKnobs();
  return (
    <XStack
      alignItems="center"
      gap="$2">
      <View
        backgroundColor="$gray5"
        height={8}
        flex={1}
        {...knobProps.containerRadius}
        overflow="hidden">
        <View
          backgroundColor={value > 70 ? '$green10' : value > 40 ? '$yellow10' : '$red10'}
          height="100%"
          width={`${value}%`}
        />
      </View>
      <Text fontSize="$1">{value}%</Text>
    </XStack>
  );
}

const defaultColumns = [
  columnHelper.accessor('id', {
    header: 'ID',
    cell: (info) => info.getValue(),
    size: 60,
  }),
  columnHelper.accessor('firstName', {
    header: 'First Name',
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor('lastName', {
    header: 'Last Name',
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor('email', {
    header: 'Email',
    cell: (info) => info.getValue(),
    size: 200,
  }),
  columnHelper.accessor('department', {
    header: 'Department',
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor('role', {
    header: 'Role',
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor('salary', {
    header: 'Salary',
    cell: (info) => formatCurrency(info.getValue(), { symbol: '$', fractionDigits: 'auto' }),
  }),
  columnHelper.accessor('startDate', {
    header: 'Start Date',
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor('status', {
    header: 'Status',
    cell: (info) => (
      <Text color={info.getValue() === 'active' ? '$green10' : info.getValue() === 'inactive' ? '$red10' : '$yellow10'}>
        {info.getValue()}
      </Text>
    ),
  }),
  columnHelper.accessor('performance', {
    header: 'Performance',
    cell: (info) => <PerformanceBar value={info.getValue()} />,
  }),
];

const meta: Meta<typeof DataTableColumnPinning> = {
  title: 'Table/DataTableColumnPinning',
  component: DataTableColumnPinning as any,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

function BasicPinningExample() {
  const [data] = useState(defaultData);

  const table = useReactTable({
    data,
    columns: defaultColumns,
    getCoreRowModel: getCoreRowModel(),
    columnResizeMode: 'onChange',
  });

  const pinning = DataTableColumnPinning({
    table,
    onPinChange: action('onPinChange'),
  });

  return (
    <YStack
      padding="$4"
      gap="$4"
      height="100vh">
      <Card>
        <Card.Header>
          <H3>Column Pinning Example</H3>
          <Paragraph>Click the pin icons to pin/unpin columns to left or right</Paragraph>
        </Card.Header>

        <Separator />

        <XStack
          padding="$4"
          gap="$2"
          flexWrap="wrap">
          <Text>Pinned Left: {pinning.pinnedLeftColumns.length}</Text>
          <Text>|</Text>
          <Text>Pinned Right: {pinning.pinnedRightColumns.length}</Text>
          <Text>|</Text>
          <Text>Scrollable: {pinning.scrollableColumns.length}</Text>
        </XStack>
      </Card>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator>
        <YStack>
          <XStack
            borderBottomWidth={1}
            borderColor="$borderColor">
            {table.getHeaderGroups().map((headerGroup) => (
              <XStack key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const isPinned = pinning.isPinned(header.column.id);
                  const position = pinning.getPinPosition(header.column.id);
                  const headerLabel =
                    typeof header.column.columnDef.header === 'string'
                      ? header.column.columnDef.header
                      : header.column.id;

                  return (
                    <View
                      key={header.id}
                      width={header.getSize()}
                      padding="$2"
                      borderRightWidth={1}
                      borderColor="$borderColor"
                      backgroundColor={isPinned ? '$gray3' : '$background'}>
                      <XStack
                        alignItems="center"
                        justifyContent="space-between">
                        <Text fontWeight="bold">{flexRender(header.column.columnDef.header, header.getContext())}</Text>
                        <XStack gap="$1">
                          <Button
                            size="$1"
                            icon={isPinned && position === 'left' ? PushPinSlashIcon : PushPinIcon}
                            onPress={() => {
                              pinning.togglePin(header.column.id, 'left');
                            }}
                            disabled={!isPinned && position !== 'left' && !pinning.canPin('left')}
                            circular
                            aria-label={
                              isPinned && position === 'left'
                                ? `Unpin ${headerLabel} column`
                                : `Pin ${headerLabel} column left`
                            }
                          />
                          <Button
                            size="$1"
                            icon={isPinned && position === 'right' ? PushPinSlashIcon : PushPinIcon}
                            onPress={() => {
                              pinning.togglePin(header.column.id, 'right');
                            }}
                            disabled={!isPinned && position !== 'right' && !pinning.canPin('right')}
                            circular
                            aria-label={
                              isPinned && position === 'right'
                                ? `Unpin ${headerLabel} column`
                                : `Pin ${headerLabel} column right`
                            }
                          />
                        </XStack>
                      </XStack>
                      {isPinned && (
                        <Text
                          fontSize="$1"
                          color="$gray10">
                          Pinned: {position}
                        </Text>
                      )}
                    </View>
                  );
                })}
              </XStack>
            ))}
          </XStack>

          {table
            .getRowModel()
            .rows.slice(0, 10)
            .map((row) => (
              <XStack
                key={row.id}
                borderBottomWidth={1}
                borderColor="$borderColor">
                {row.getVisibleCells().map((cell) => {
                  const isPinned = pinning.isPinned(cell.column.id);

                  return (
                    <View
                      key={cell.id}
                      width={cell.column.getSize()}
                      padding="$2"
                      borderRightWidth={1}
                      borderColor="$borderColor"
                      backgroundColor={isPinned ? '$gray2' : '$background'}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </View>
                  );
                })}
              </XStack>
            ))}
        </YStack>
      </ScrollView>
    </YStack>
  );
}

export const Basic: Story = {
  name: 'Main',
  render: () => <BasicPinningExample />,
};

function AdvancedPinningExample() {
  const [data] = useState(defaultData);

  const table = useReactTable({
    data,
    columns: defaultColumns,
    getCoreRowModel: getCoreRowModel(),
  });

  const { pinnedState, pinColumn, unpinColumn, resetPinning } = useColumnPinning(table, {
    maxPinnedColumns: 3,
    initialPinnedColumns: {
      left: ['id', 'firstName'],
      right: ['status'],
    },
  });

  return (
    <YStack
      padding="$4"
      gap="$4"
      height="100vh">
      <Card>
        <Card.Header>
          <H3>Advanced Column Pinning</H3>
          <Paragraph>Using the useColumnPinning hook with initial pinned columns</Paragraph>
        </Card.Header>

        <Separator />

        <XStack
          padding="$4"
          gap="$2"
          alignItems="center">
          <Button
            icon={ArrowCounterClockwiseIcon}
            onPress={resetPinning}
            size="$3">
            Reset Pinning
          </Button>

          <Separator vertical />

          <YStack>
            <Text fontSize="$2">Left: {pinnedState.left.join(', ') || 'None'}</Text>
            <Text fontSize="$2">Right: {pinnedState.right.join(', ') || 'None'}</Text>
          </YStack>
        </XStack>
      </Card>

      <Card flex={1}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator>
          <YStack minWidth="100%">
            <XStack
              backgroundColor="$gray3"
              borderBottomWidth={2}
              borderColor="$borderColor">
              {table.getHeaderGroups().map((headerGroup) => (
                <XStack key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    const isPinnedLeft = pinnedState.left.includes(header.column.id);
                    const isPinnedRight = pinnedState.right.includes(header.column.id);
                    const isPinned = isPinnedLeft || isPinnedRight;

                    return (
                      <View
                        key={header.id}
                        width={header.getSize()}
                        padding="$3"
                        borderRightWidth={1}
                        borderColor="$borderColor"
                        backgroundColor={isPinnedLeft ? '$blue3' : isPinnedRight ? '$purple3' : '$gray3'}>
                        <YStack gap="$1">
                          <Text
                            fontWeight="bold"
                            fontSize="$3">
                            {flexRender(header.column.columnDef.header, header.getContext())}
                          </Text>
                          <XStack gap="$1">
                            {!isPinnedLeft && (
                              <Button
                                size="$1"
                                onPress={() => {
                                  pinColumn(header.column.id, 'left');
                                }}
                                disabled={pinnedState.left.length >= 3}
                                {...({ fontSize: '$1' } as any)}>
                                Pin Left
                              </Button>
                            )}
                            {!isPinnedRight && (
                              <Button
                                size="$1"
                                onPress={() => {
                                  pinColumn(header.column.id, 'right');
                                }}
                                disabled={pinnedState.right.length >= 3}
                                {...({ fontSize: '$1' } as any)}>
                                Pin Right
                              </Button>
                            )}
                            {isPinned && (
                              <Button
                                size="$1"
                                onPress={() => {
                                  unpinColumn(header.column.id);
                                }}
                                {...({ fontSize: '$1', color: '$red10' } as any)}>
                                Unpin
                              </Button>
                            )}
                          </XStack>
                        </YStack>
                      </View>
                    );
                  })}
                </XStack>
              ))}
            </XStack>

            <ScrollView maxHeight={400}>
              {table.getRowModel().rows.map((row) => (
                <XStack
                  key={row.id}
                  borderBottomWidth={1}
                  borderColor="$borderColor"
                  hoverStyle={{ backgroundColor: '$gray2' }}>
                  {row.getVisibleCells().map((cell) => {
                    const isPinnedLeft = pinnedState.left.includes(cell.column.id);
                    const isPinnedRight = pinnedState.right.includes(cell.column.id);

                    return (
                      <View
                        key={cell.id}
                        width={cell.column.getSize()}
                        padding="$2"
                        borderRightWidth={1}
                        borderColor="$borderColor"
                        backgroundColor={isPinnedLeft ? '$blue1' : isPinnedRight ? '$purple1' : '$background'}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </View>
                    );
                  })}
                </XStack>
              ))}
            </ScrollView>
          </YStack>
        </ScrollView>
      </Card>
    </YStack>
  );
}

export const Advanced: Story = {
  render: () => <AdvancedPinningExample />,
};

export const MaxPinnedColumns: Story = {
  render: () => {
    const [data] = useState(defaultData.slice(0, 10));
    const table = useReactTable({
      data,
      columns: defaultColumns.slice(0, 6),
      getCoreRowModel: getCoreRowModel(),
    });

    const pinning = DataTableColumnPinning({
      table,
      maxPinnedColumns: 2,
      onPinChange: action('onPinChange'),
    });

    return (
      <YStack
        padding="$4"
        gap="$4">
        <Card>
          <Card.Header>
            <H3>Max Pinned Columns (Limited to 2)</H3>
            <Paragraph>Only 2 columns can be pinned at a time</Paragraph>
          </Card.Header>
        </Card>

        <Card>
          <YStack
            padding="$4"
            gap="$2">
            {table.getAllColumns().map((column) => (
              <XStack
                key={column.id}
                alignItems="center"
                justifyContent="space-between"
                padding="$2"
                borderRadius="$2"
                backgroundColor={pinning.isPinned(column.id) ? '$blue3' : '$gray2'}>
                <Text>{column.id}</Text>
                <XStack gap="$2">
                  <Button
                    size="$2"
                    onPress={() => {
                      pinning.togglePin(column.id, 'left');
                    }}
                    disabled={!pinning.isPinned(column.id) && !pinning.canPin('left')}>
                    {pinning.getPinPosition(column.id) === 'left' ? 'Unpin' : 'Pin Left'}
                  </Button>
                  <Button
                    size="$2"
                    onPress={() => {
                      pinning.togglePin(column.id, 'right');
                    }}
                    disabled={!pinning.isPinned(column.id) && !pinning.canPin('right')}>
                    {pinning.getPinPosition(column.id) === 'right' ? 'Unpin' : 'Pin Right'}
                  </Button>
                </XStack>
              </XStack>
            ))}
          </YStack>

          <Separator />

          <XStack
            padding="$4"
            gap="$4">
            <Text>Left: {pinning.pinnedLeftColumns.length}/2</Text>
            <Text>Right: {pinning.pinnedRightColumns.length}/2</Text>
          </XStack>
        </Card>
      </YStack>
    );
  },
};

export const DisabledPinning: Story = {
  render: () => {
    const [data] = useState(defaultData.slice(0, 5));
    const table = useReactTable({
      data,
      columns: defaultColumns.slice(0, 4),
      getCoreRowModel: getCoreRowModel(),
    });

    const pinning = DataTableColumnPinning({
      table,
      allowPinning: false,
    });

    return (
      <YStack
        padding="$4"
        gap="$4">
        <Card>
          <Card.Header>
            <H3>Disabled Column Pinning</H3>
            <Paragraph>Column pinning is disabled in this example</Paragraph>
          </Card.Header>
        </Card>

        <Card>
          <YStack padding="$4">
            <Text color="$gray10">Pin buttons are not rendered when allowPinning is false</Text>
            {table.getAllColumns().map((column) => (
              <XStack
                key={column.id}
                alignItems="center"
                justifyContent="space-between"
                padding="$3"
                borderBottomWidth={1}
                borderColor="$borderColor">
                <Text>{column.id}</Text>
                <pinning.PinButton columnId={column.id} />
              </XStack>
            ))}
          </YStack>
        </Card>
      </YStack>
    );
  },
};
