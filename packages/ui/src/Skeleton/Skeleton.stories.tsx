import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { XStack, YStack, Text, View } from 'tamagui';

import { Card } from '../surfaces';

import { Skeleton, type SkeletonVariant } from './index';

const meta: Meta<typeof Skeleton> = {
  title: 'Components/Skeleton',
  component: Skeleton,
  parameters: {
    status: { type: 'stable' },
    // Skeleton specimen carve-out: this is the component's own anatomy
    // catalog, so its skeletons are the subject rather than a promise about
    // data that never arrives. Explicitly labeled so the skeleton-at-rest
    // probe exempts it; every non-specimen surface must show zero skeletons
    // after settle.
    skeletonSpecimen: true,
    docs: {
      description: {
        component:
          'SKELETON SPECIMEN (D-10). A loading placeholder that pulses to indicate content is being loaded. Supports multiple variants for different content types. The skeletons on this page persist by design because the skeleton itself is the subject — in product surfaces a skeleton may only persist while a real pending source exists.',
      },
    },
  },
};
export default meta;

type Story = StoryObj<typeof Skeleton>;

export const Default: Story = {
  name: 'Main',
  render: () => <Skeleton width={200} />,
};

export const Variants: Story = {
  render: () => {
    const variants: SkeletonVariant[] = ['text', 'circular', 'rectangular', 'rounded'];
    return (
      <YStack gap="$4">
        {variants.map((variant) => (
          <XStack key={variant} gap="$4" alignItems="center">
            <Text width={100} fontSize="$2" color="$color10">
              {variant}
            </Text>
            <Skeleton
              variant={variant}
              width={variant === 'circular' ? 48 : 200}
              height={variant === 'circular' ? 48 : variant === 'text' ? undefined : 48}
            />
          </XStack>
        ))}
      </YStack>
    );
  },
};

export const TextLines: Story = {
  render: () => (
    <YStack gap="$6" maxWidth={400}>
      <YStack gap="$2">
        <Text fontWeight="600">Single line</Text>
        <Skeleton.Text />
      </YStack>
      <YStack gap="$2">
        <Text fontWeight="600">Multiple lines (3)</Text>
        <Skeleton.Text lines={3} />
      </YStack>
      <YStack gap="$2">
        <Text fontWeight="600">Paragraph (5 lines)</Text>
        <Skeleton.Text lines={5} />
      </YStack>
      <YStack gap="$2">
        <Text fontWeight="600">Display (title)</Text>
        <Skeleton.Text size="display" lines={1} lastLineWidth={180} />
      </YStack>
    </YStack>
  ),
};

export const Circles: Story = {
  render: () => (
    <XStack gap="$4" alignItems="center">
      <Skeleton.Circle size={32} />
      <Skeleton.Circle size={40} />
      <Skeleton.Circle size={48} />
      <Skeleton.Circle size={64} />
      <Skeleton.Circle size={80} />
    </XStack>
  ),
};

export const CustomSizes: Story = {
  render: () => (
    <YStack gap="$4">
      <YStack gap="$2">
        <Text fontWeight="600">Fixed width</Text>
        <Skeleton width={100} />
        <Skeleton width={200} />
        <Skeleton width={300} />
      </YStack>
      <YStack gap="$2">
        <Text fontWeight="600">Percentage width</Text>
        <Skeleton width="25%" />
        <Skeleton width="50%" />
        <Skeleton width="75%" />
        <Skeleton width="100%" />
      </YStack>
      <YStack gap="$2">
        <Text fontWeight="600">Custom height</Text>
        <Skeleton width="100%" height={24} />
        <Skeleton width="100%" height={48} />
        <Skeleton width="100%" height={96} />
      </YStack>
    </YStack>
  ),
};

export const NoAnimation: Story = {
  render: () => (
    <YStack gap="$4">
      <YStack gap="$2">
        <Text fontWeight="600">Animated (default)</Text>
        <Skeleton width={200} animate />
      </YStack>
      <YStack gap="$2">
        <Text fontWeight="600">Static (no animation)</Text>
        <Skeleton width={200} animate={false} />
      </YStack>
    </YStack>
  ),
};

export const CardSkeleton: Story = {
  render: () => (
    <Skeleton.Group>
      <Card tier="elevated" width={320}>
        <XStack gap="$3" alignItems="flex-start">
          <Skeleton.Circle size={48} />
          <YStack flex={1} gap="$2">
            <Skeleton.Text size="display" lines={1} lastLineWidth="60%" />
            <Skeleton width="40%" />
          </YStack>
        </XStack>
        <Skeleton.Text lines={3} />
        <XStack gap="$2">
          <Skeleton variant="rounded" width={80} height="$4" />
          <Skeleton variant="rounded" width={80} height="$4" />
        </XStack>
      </Card>
    </Skeleton.Group>
  ),
};

export const ListSkeleton: Story = {
  render: () => (
    <Skeleton.Group>
      <YStack gap="$3" width={400}>
        {Array.from({ length: 4 }).map((_, i) => (
          <XStack key={i} gap="$3" alignItems="center">
            <Skeleton.Circle size={40} />
            <YStack flex={1} gap="$1">
              <Skeleton width="70%" />
              <Skeleton width="40%" />
            </YStack>
          </XStack>
        ))}
      </YStack>
    </Skeleton.Group>
  ),
};

export const TableSkeleton: Story = {
  render: () => (
    <Skeleton.Group>
      <YStack gap="$2" width={500}>
        <XStack gap="$3" paddingBottom="$2" borderBottomWidth={1} borderColor="$color5">
          <Skeleton width={120} />
          <Skeleton width={100} />
          <Skeleton width={80} />
          <Skeleton width={60} />
        </XStack>
        {Array.from({ length: 5 }).map((_, i) => (
          <XStack key={i} gap="$3" paddingVertical="$2">
            <Skeleton width={120} />
            <Skeleton width={100} />
            <Skeleton width={80} />
            <Skeleton width={60} />
          </XStack>
        ))}
      </YStack>
    </Skeleton.Group>
  ),
};

export const FormSkeleton: Story = {
  render: () => (
    <Skeleton.Group>
      <YStack gap="$4" width={320}>
        <YStack gap="$2">
          <Skeleton width={60} />
          <Skeleton variant="rounded" width="100%" height="$4" />
        </YStack>
        <YStack gap="$2">
          <Skeleton width={80} />
          <Skeleton variant="rounded" width="100%" height="$4" />
        </YStack>
        <YStack gap="$2">
          <Skeleton width={100} />
          <Skeleton variant="rounded" width="100%" height="$8" />
        </YStack>
        <Skeleton variant="rounded" width={100} height="$4" />
      </YStack>
    </Skeleton.Group>
  ),
};

export const AllStates: Story = {
  render: () => (
    <Skeleton.Group>
      <YStack gap="$6">
        <YStack gap="$2">
          <Text fontWeight="600">Display</Text>
          <Skeleton.Text size="display" lines={1} lastLineWidth={220} />
        </YStack>

        <YStack gap="$2">
          <Text fontWeight="600">Variants</Text>
          <XStack gap="$4" alignItems="center">
            <Skeleton variant="text" width={100} />
            <Skeleton variant="circular" width={40} height={40} />
            <Skeleton variant="rectangular" width={100} height={40} />
            <Skeleton variant="rounded" width={100} height={40} />
          </XStack>
        </YStack>

        <YStack gap="$2">
          <Text fontWeight="600">Text lines</Text>
          <View maxWidth={300}>
            <Skeleton.Text lines={3} />
          </View>
        </YStack>

        <YStack gap="$2">
          <Text fontWeight="600">Circles (avatars)</Text>
          <XStack gap="$3">
            <Skeleton.Circle size={32} />
            <Skeleton.Circle size={48} />
            <Skeleton.Circle size={64} />
          </XStack>
        </YStack>

        <YStack gap="$2">
          <Text fontWeight="600">Card example</Text>
          <Card tier="elevated" width={280}>
            <XStack gap="$3" alignItems="center">
              <Skeleton.Circle size={40} />
              <YStack flex={1} gap="$1">
                <Skeleton.Text size="display" lines={1} lastLineWidth="80%" />
                <Skeleton width="50%" />
              </YStack>
            </XStack>
          </Card>
        </YStack>
      </YStack>
    </Skeleton.Group>
  ),
};
