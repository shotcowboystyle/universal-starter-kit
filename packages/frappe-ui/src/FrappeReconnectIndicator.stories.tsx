import { Text, YStack } from 'tamagui';

import { FrappeReconnectIndicator } from './FrappeReconnectIndicator';
import type { FrappeReconnectIndicatorProps } from './FrappeReconnectIndicator';

export default {
  title: 'FrappeUI/FrappeReconnectIndicator',
  component: FrappeReconnectIndicator,
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component:
          "Honest realtime-state chip for live Frappe components. Renders only while the socket feeding this connection's live queries is down after having been up. Fixture-backed configs render nothing.",
      },
    },
  },
};

const config: FrappeReconnectIndicatorProps['config'] = {
  baseURL: 'https://reconnect.mock.test',
};

export const Default = () => (
  <YStack
    gap="$3"
    width={420}>
    <Text
      fontSize="$2"
      color="$color10">
      Never-connected (fixtures, SSR): paints nothing.
    </Text>
    <FrappeReconnectIndicator
      config={config}
      connection={{ connected: false, everConnected: false }}
    />
  </YStack>
);
Default.storyName = 'Main';

export const Reconnecting = () => (
  <FrappeReconnectIndicator
    config={config}
    connection={{ connected: false, everConnected: true }}
  />
);

export const Connected = () => (
  <YStack
    gap="$3"
    width={420}>
    <Text
      fontSize="$2"
      color="$color10">
      Socket up: the chip is gone.
    </Text>
    <FrappeReconnectIndicator
      config={config}
      connection={{ connected: true, everConnected: true }}
    />
  </YStack>
);
