import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { YStack } from 'tamagui';

import { Breadcrumbs } from './Breadcrumbs';

const meta: Meta<typeof Breadcrumbs> = {
  title: 'Components/Breadcrumbs',
  component: Breadcrumbs,
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component:
          'Wayfinding trail: landmark nav, last crumb is the current page. Tight chromeless gap (LC-03). Crumb labels are weight 400 (R7).',
      },
    },
  },
};
export default meta;

type Story = StoryObj<typeof Breadcrumbs>;

const deepItems = [
  { label: 'Home', href: '/' },
  { label: 'Workspace', href: '/ws' },
  { label: 'Projects', href: '/projects' },
  { label: 'universal-starter-kit', href: '/projects/mp1' },
  { label: 'Apps', href: '/projects/mp1/apps' },
  { label: 'One', href: '/projects/mp1/apps/web' },
  { label: 'Settings' },
];

export const Default: Story = {
  name: 'Main',
  render: () => (
    <YStack gap="$4" padding="$4">
      <Breadcrumbs
        items={[
          { label: 'Home', href: '/' },
          { label: 'Projects', href: '/projects' },
          { label: 'universal-starter-kit', href: '/projects/mp1' },
          { label: 'Settings' },
        ]}
        onNavigate={(href) => {
          console.log('Navigate:', href);
        }}
      />
      <Breadcrumbs
        items={[{ label: 'Dashboard', href: '/' }, { label: 'Users' }]}
        onNavigate={(href) => {
          console.log('Navigate:', href);
        }}
      />
    </YStack>
  ),
};

export const Overflow: Story = {
  name: 'Overflow',
  render: () => (
    <YStack gap="$4" maxWidth={480} padding="$4">
      <Breadcrumbs
        items={deepItems}
        maxVisible={4}
        onNavigate={(href) => {
          console.log('Navigate:', href);
        }}
      />
    </YStack>
  ),
};
