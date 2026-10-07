import { action } from '@repo/storybook';
import { YStack } from 'tamagui';

import { SyncErrorNotice } from './SyncErrorNotice';

export default {
  title: 'FrappeUI/SyncErrorNotice',
  component: SyncErrorNotice,
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component:
          'Rejected-write notice: role=alert message with Retry (same mutation id) and Dismiss. Each affordance only renders when its handler is provided.',
      },
    },
  },
  argTypes: {
    message: { control: 'text' },
    retryLabel: { control: 'text' },
    dismissLabel: { control: 'text' },
  },
};

export const Default = () => (
  <SyncErrorNotice
    message="Could not add comment"
    onRetry={action('onRetry')}
    onDismiss={action('onDismiss')}
  />
);
Default.storyName = 'Main';

export const AllStates = () => (
  <YStack
    gap="$4"
    width={480}>
    <SyncErrorNotice
      message="Could not add comment"
      onRetry={action('onRetry')}
      onDismiss={action('onDismiss')}
    />
    <SyncErrorNotice
      message="Write rejected — retry only"
      onRetry={action('onRetry')}
    />
    <SyncErrorNotice message="No actions" />
    <SyncErrorNotice
      message="Custom labels"
      onRetry={action('onRetry')}
      onDismiss={action('onDismiss')}
      retryLabel="Try again"
      dismissLabel="Ignore"
    />
  </YStack>
);
