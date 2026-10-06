import { Paragraph, YStack } from 'tamagui';

import { Toolbar } from './Toolbar';

const noop = (): void => undefined;

export default {
  title: 'Components/Toolbar',
  component: Toolbar,
  parameters: { status: { type: 'stable' } },
};

export const Default = () => (
  <YStack gap="$4">
    <Paragraph
      size="$3"
      color="$color10">
      Independent actions with gap; destructive separated from neutral:
    </Paragraph>
    <Toolbar
      primaryActions={[
        { label: 'Save', onPress: noop, variant: 'primary' },
        { label: 'Publish', onPress: noop, variant: 'default' },
      ]}
      secondaryActions={[
        { label: 'Discard', onPress: noop, variant: 'outlined' },
        { label: 'Delete', onPress: noop, variant: 'destructive' },
      ]}
    />
  </YStack>
);

Default.storyName = 'Main';

export const Loading = () => (
  <YStack gap="$4">
    <Paragraph
      size="$3"
      color="$color10">
      Toolbar with loading state:
    </Paragraph>
    <Toolbar
      primaryActions={[{ label: 'Saving...', onPress: noop, variant: 'primary', loading: true }]}
      secondaryActions={[
        {
          label: 'Cancel',
          onPress: noop,
          variant: 'outlined',
          disabled: true,
          disabledReason: 'Locked while the save finishes',
        },
      ]}
    />
  </YStack>
);

export const FusedSegment = () => (
  <YStack gap="$4">
    <Paragraph
      size="$3"
      color="$color10">
      True segments stay fused via <code>fused</code>; independent actions keep gap:
    </Paragraph>
    <Toolbar
      primaryActions={[
        { label: 'Day', onPress: noop, fused: true },
        { label: 'Week', onPress: noop, fused: true },
        { label: 'Month', onPress: noop, fused: true },
        { label: 'Refresh', onPress: noop, variant: 'outlined' },
      ]}
      secondaryActions={[
        { label: 'Export', onPress: noop, variant: 'outlined' },
        { label: 'Delete', onPress: noop, variant: 'destructive' },
      ]}
    />
  </YStack>
);

FusedSegment.storyName = 'Fused Segment';

export const OverflowNarrow = () => (
  <YStack
    maxWidth={320}
    borderWidth={1}
    borderColor="$color6"
    borderStyle="dashed">
    <Toolbar
      primaryActions={[
        { label: 'Save', onPress: noop, variant: 'primary' },
        { label: 'Publish', onPress: noop },
        { label: 'Duplicate', onPress: noop, variant: 'outlined' },
        { label: 'Archive', onPress: noop, variant: 'outlined' },
      ]}
      secondaryActions={[
        { label: 'Discard', onPress: noop, variant: 'outlined' },
        { label: 'Delete', onPress: noop, variant: 'destructive' },
      ]}
    />
  </YStack>
);

OverflowNarrow.storyName = 'Overflow Narrow';
