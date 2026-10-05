import { Button } from '@repo/forms';
import { action } from '@repo/storybook';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useState } from 'react';
import { Paragraph, Text, XStack, YStack } from 'tamagui';

import { Badge } from '../Badge';

import { AsyncBoundary, type AsyncBoundaryLayout } from './AsyncBoundary';

const meta: Meta<typeof AsyncBoundary> = {
  title: 'Components/AsyncBoundary',
  component: AsyncBoundary,
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          'Async-state wrapper for data views (W9 / DG-ST-01,02,04 / DG-TBL-06). Priority: error → loading → empty → data. First load uses a layout-matched skeleton; later loads keep previous data (pending bar / inline error). Empty chrome is forbidden when `error` is set; count badges hide on a blocking failure.',
      },
    },
  },
  argTypes: {
    layout: {
      control: 'select',
      options: ['list', 'table', 'kanban', 'dashboard', 'generic'] satisfies AsyncBoundaryLayout[],
    },
    keepPrevious: { control: 'boolean' },
  },
};
export default meta;

type Story = StoryObj<typeof AsyncBoundary>;

export const Data: Story = {
  args: {
    layout: 'list',
  },
  render: (args) => (
    <AsyncBoundary {...args}>
      <YStack gap="$2" padding="$3">
        <Text>Row A</Text>
        <Text>Row B</Text>
        <Text>Row C</Text>
      </YStack>
    </AsyncBoundary>
  ),
};

export const LoadingListSkeleton: Story = {
  args: { loading: true, layout: 'list' },
};

export const LoadingTableSkeleton: Story = {
  args: { loading: true, layout: 'table' },
};

export const LoadingKanbanSkeleton: Story = {
  args: { loading: true, layout: 'kanban' },
};

export const LoadingDashboardSkeleton: Story = {
  args: { loading: true, layout: 'dashboard' },
};

export const Empty: Story = {
  args: {
    empty: true,
    emptyTitle: 'No items found',
    emptyDescription: 'Try adjusting filters or create a new item.',
    layout: 'list',
  },
};

export const Error: Story = {
  args: {
    error: 'The server did not respond.',
    errorTitle: "Couldn't load data",
    layout: 'list',
    onRetry: action('retry'),
  },
};

/** Empty title must not appear when error is also set. */
export const ErrorWinsOverEmpty: Story = {
  render: () => (
    <AsyncBoundary
      empty
      emptyTitle="No items found"
      error="Timed out waiting for the API"
      errorTitle="Couldn't load data"
      layout="list"
      onRetry={action('retry')}
    />
  ),
};

/** Chrome/badges suppressed on failure. */
export const HideBadgesOnFailure: Story = {
  render: () => (
    <AsyncBoundary
      error="Secondary feed unavailable"
      errorTitle="Couldn't load notifications"
      chrome={
        <XStack gap="$3" padding="$3" alignItems="center">
          <Badge count={12}>
            <Text>Inbox</Text>
          </Badge>
          <Paragraph>This chrome (and the count) must not render on error.</Paragraph>
        </XStack>
      }
      onRetry={action('retry')}
    />
  ),
};

export const InteractiveCycle: Story = {
  render: () => {
    const [status, setStatus] = useState<'loading' | 'empty' | 'error' | 'data'>('loading');
    return (
      <YStack gap="$3" padding="$3" minHeight={320}>
        <XStack gap="$2" flexWrap="wrap">
          {(['loading', 'empty', 'error', 'data'] as const).map((s) => (
            <Button
              key={s}
              size="$3"
              onPress={() => {
                setStatus(s);
              }}>
              {s}
            </Button>
          ))}
        </XStack>
        <AsyncBoundary
          loading={status === 'loading'}
          empty={status === 'empty'}
          error={status === 'error' ? 'Simulated failure' : null}
          layout="list"
          emptyTitle="No items found"
          onRetry={() => {
            setStatus('loading');
          }}
          chrome={
            <Badge count={4}>
              <Text>Count</Text>
            </Badge>
          }>
          <YStack gap="$2">
            <Text>Loaded item 1</Text>
            <Text>Loaded item 2</Text>
          </YStack>
        </AsyncBoundary>
      </YStack>
    );
  },
};

/** Settled rows stay painted while a later load is in flight (default keepPrevious). */
export const KeepPreviousOnRefetch: Story = {
  render: () => {
    const [phase, setPhase] = useState<'data' | 'loading' | 'error'>('data');
    return (
      <YStack gap="$3" padding="$3" minHeight={320}>
        <XStack gap="$2" flexWrap="wrap">
          {(['data', 'loading', 'error'] as const).map((s) => (
            <Button
              key={s}
              size="$3"
              onPress={() => {
                setPhase(s);
              }}>
              {s}
            </Button>
          ))}
        </XStack>
        <AsyncBoundary
          loading={phase === 'loading'}
          error={phase === 'error' ? 'Refresh did not complete.' : null}
          errorTitle="Couldn't refresh"
          layout="list"
          onRetry={() => {
            setPhase('loading');
          }}>
          <YStack gap="$2" padding="$3">
            <Text>Loaded item 1</Text>
            <Text>Loaded item 2</Text>
            <Text>Loaded item 3</Text>
          </YStack>
        </AsyncBoundary>
      </YStack>
    );
  },
};
