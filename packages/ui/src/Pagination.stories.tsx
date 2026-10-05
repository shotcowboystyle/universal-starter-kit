import { action } from '@repo/storybook';
import { Preset } from '@repo/theme';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useState } from 'react';
import { Text, YStack } from 'tamagui';

import { Pagination, type PaginationProps } from './Pagination';

const meta: Meta<typeof Pagination> = {
  title: 'Components/Pagination',
  component: Pagination,
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component:
          'One pagination component, two idioms. `dots`/`bars` are the carousel & wizard ' +
          'idiom (animated active indicator, arrow navigation, optional submit on the last ' +
          'step). `numbered` is the table & data idiom: prev/next chevrons plus numbered page ' +
          'buttons with ellipsis windowing, the current page on the accent intent, and an ' +
          'optional item-range summary. Controlled via `page`/`onPageChange` (or the legacy ' +
          '0-based `activeIndex`/`onChange`), uncontrolled via `defaultPage`.',
      },
    },
  },
  argTypes: {
    total: { control: 'number', description: 'Total number of pages/steps' },
    activeIndex: { control: 'number', description: 'Current active index (0-based)' },
    allowJumpTo: { control: 'boolean', description: 'Allow clicking a dot to jump to that step' },
    isLastStep: { control: 'boolean', description: 'Last step triggers onSubmit' },
    disabled: { control: 'boolean', description: 'Disable all navigation' },
    variant: { control: 'select', options: ['dots', 'bars', 'numbered'] },
    totalItems: { control: 'number', description: 'Total items across all pages (numbered)' },
    pageSize: { control: 'number', description: 'Items per page (numbered)' },
    showSummary: { control: 'boolean', description: 'Show the item-range summary (numbered)' },
  },
};
export default meta;

type Story = StoryObj<typeof Pagination>;

// Rest on a middle step: at index 0 the prev arrow is a bare-disabled Button
// at rest, which trips the `[theme]` guardrail and demos
// nothing — both arrows live shows the full control.
function ControlledPagination(props: Omit<PaginationProps, 'activeIndex' | 'onChange'>) {
  const [activeIndex, setActiveIndex] = useState(1);
  return (
    <Pagination
      {...props}
      activeIndex={activeIndex}
      onChange={(index) => {
        setActiveIndex(index);
        action('onChange')(index);
      }}
    />
  );
}

export const Default: Story = {
  name: 'Main',
  render: () => <ControlledPagination total={5} />,
};

export const Playground: Story = {
  args: { total: 5, activeIndex: 1 },
  render: (args) => <Pagination onChange={action('onChange')} {...args} />,
};

export const ThreeSteps: Story = {
  render: () => <ControlledPagination total={3} />,
};

export const WithCompletedSteps: Story = {
  render: () => {
    const [activeIndex, setActiveIndex] = useState(2);
    return (
      <Pagination total={5} activeIndex={activeIndex} onChange={setActiveIndex} completedSteps={new Set([0, 1])} />
    );
  },
};

export const BarsVariant: Story = {
  render: () => <ControlledPagination total={5} variant="bars" />,
};

export const AllowJumpTo: Story = {
  render: () => <ControlledPagination total={5} allowJumpTo />,
};

export const WithSubmit: Story = {
  render: () => {
    const [activeIndex, setActiveIndex] = useState(1);
    const total = 4;
    return (
      <YStack gap="$4" alignItems="center">
        <Pagination
          total={total}
          activeIndex={activeIndex}
          onChange={setActiveIndex}
          isLastStep={activeIndex === total - 1}
          onSubmit={() => action('onSubmit')()}
          completedSteps={new Set(Array.from({ length: activeIndex }, (_, i) => i))}
        />
        <Text color="$color11" fontSize="$3">
          Step {activeIndex + 1} of {total}
          {activeIndex === total - 1 ? ' — right arrow becomes submit' : ''}
        </Text>
      </YStack>
    );
  },
};

export const Disabled: Story = {
  render: () => <ControlledPagination total={5} disabled />,
};

// ── Numbered (table & data idiom) ──────────────────────────────

function ControlledNumbered(props: Omit<PaginationProps, 'page' | 'onPageChange' | 'variant'>) {
  // Middle page: page 1 rests with prev/first bare-disabled.
  const [page, setPage] = useState(2);
  return (
    <Pagination
      {...props}
      variant="numbered"
      page={page}
      onPageChange={(next) => {
        setPage(next);
        action('onPageChange')(next);
      }}
    />
  );
}

export const NumberedFewPages: Story = {
  render: () => <ControlledNumbered total={5} />,
};

export const NumberedManyPages: Story = {
  parameters: {
    docs: {
      description: {
        story: 'Ellipsis windowing: 1 … 4 [5] 6 … 20. Boundary pages stay clickable.',
      },
    },
  },
  render: () => {
    const [page, setPage] = useState(5);
    return <Pagination variant="numbered" total={20} page={page} onPageChange={setPage} />;
  },
};

export const NumberedWithSummary: Story = {
  parameters: {
    docs: {
      description: {
        story: 'The optional summary slot renders the item range, e.g. "1–25 of 312".',
      },
    },
  },
  render: () => <ControlledNumbered total={13} totalItems={312} pageSize={25} showSummary />,
};

export const NumberedUncontrolled: Story = {
  render: () => <Pagination variant="numbered" total={9} defaultPage={3} onPageChange={action('onPageChange')} />,
};

export const NumberedRadiusNone: Story = {
  parameters: {
    docs: {
      description: {
        story: 'radius:none knob = square page buttons — knobs are consumed like the rest of the catalog.',
      },
    },
  },
  render: () => (
    <Preset overrides={{ borderRadius: 'none' }}>
      <ControlledNumbered total={20} />
    </Preset>
  ),
};

export const NumberedDisabled: Story = {
  render: () => <ControlledNumbered total={8} disabled />,
};

export const NumberedFirstLast: Story = {
  parameters: {
    docs: {
      description: {
        story:
          '`showFirstLast` adds double-chevron jump-to-boundary buttons — the table idiom ' +
          'DataTable composes in its footer.',
      },
    },
  },
  render: () => <ControlledNumbered total={20} showFirstLast />,
};

export const AllStates: Story = {
  render: () => (
    <YStack gap="$6" alignItems="center">
      <YStack gap="$2" alignItems="center">
        <Text fontWeight="400">Dots (default)</Text>
        <ControlledPagination total={5} />
      </YStack>
      <YStack gap="$2" alignItems="center">
        <Text fontWeight="400">Bars</Text>
        <ControlledPagination total={5} variant="bars" />
      </YStack>
      <YStack gap="$2" alignItems="center">
        <Text fontWeight="400">With completed steps</Text>
        <Pagination total={5} activeIndex={3} onChange={action('onChange')} completedSteps={new Set([0, 1, 2])} />
      </YStack>
      <YStack gap="$2" alignItems="center">
        <Text fontWeight="400">Disabled</Text>
        <ControlledPagination total={5} disabled />
      </YStack>
    </YStack>
  ),
};

export const Simple: Story = {
  render: () => (
    <YStack width={249}>
      <Pagination variant="simple" total={100} defaultPage={50} />
    </YStack>
  ),
};
