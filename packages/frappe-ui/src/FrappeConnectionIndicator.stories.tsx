import { Text, YStack } from 'tamagui';

import { FrappeConnectionIndicator } from './FrappeConnectionIndicator';
import type { FrappeConnectionIndicatorProps } from './FrappeConnectionIndicator';

export default {
  title: 'FrappeUI/FrappeConnectionIndicator',
  component: FrappeConnectionIndicator,
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component:
          'Compact reconnecting pill for live Frappe views. Renders only while the realtime socket is down after having been up. Fixture mode, SSR, and a healthy socket all render nothing.',
      },
    },
  },
};

const config: FrappeConnectionIndicatorProps['config'] = {
  baseURL: 'https://connection.mock.test',
};

export const Default = () => (
  <YStack
    gap="$3"
    width={360}>
    <Text
      fontSize="$2"
      color="$color10">
      Fixture / never-connected: the indicator paints nothing. That is the contract.
    </Text>
    <FrappeConnectionIndicator
      config={config}
      connection={{ connected: false, everConnected: false }}
    />
  </YStack>
);
Default.storyName = 'Main';

export const Reconnecting = () => (
  <FrappeConnectionIndicator
    config={config}
    connection={{ connected: false, everConnected: true }}
  />
);

export const Connected = () => (
  <YStack
    gap="$3"
    width={360}>
    <Text
      fontSize="$2"
      color="$color10">
      Live socket up: nothing to show.
    </Text>
    <FrappeConnectionIndicator
      config={config}
      connection={{ connected: true, everConnected: true }}
    />
  </YStack>
);
