/**
 * AsyncSkeleton — the layout-matched loading face AsyncBoundary uses on
 * first load. The boundary has stories; this export did not, so Kitchen
 * Sink never showed the skeleton itself.
 */

import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { YStack } from 'tamagui';

import { AsyncSkeleton, type AsyncBoundaryLayout } from './AsyncBoundary';

const LAYOUTS: AsyncBoundaryLayout[] = ['list', 'table', 'kanban', 'dashboard', 'generic'];

const meta: Meta<typeof AsyncSkeleton> = {
  title: 'Components/AsyncSkeleton',
  component: AsyncSkeleton,
  parameters: {
    status: { type: 'stable' },
    skeletonSpecimen: true,
    docs: {
      description: {
        component:
          'SKELETON SPECIMEN (D-10). Layout-matched loading placeholder (DG-ST-02). These skeletons persist because the skeleton is the subject.',
      },
    },
  },
  argTypes: {
    layout: { control: 'select', options: LAYOUTS },
  },
};

export default meta;
type Story = StoryObj<typeof AsyncSkeleton>;

export const Main: Story = {
  name: 'Main',
  args: { layout: 'list' },
};

export const List: Story = { args: { layout: 'list' } };
export const Table: Story = { args: { layout: 'table' } };
export const Kanban: Story = { args: { layout: 'kanban' } };
export const Dashboard: Story = { args: { layout: 'dashboard' } };
export const Generic: Story = { args: { layout: 'generic' } };

export const AllLayouts: Story = {
  render: () => (
    <YStack gap="$6" padding="$4">
      {LAYOUTS.map((layout) => (
        <YStack key={layout} gap="$2">
          <AsyncSkeleton layout={layout} />
        </YStack>
      ))}
    </YStack>
  ),
};
