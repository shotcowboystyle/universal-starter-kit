// Catalog Button (story honesty): raw tamagui buttons pinned a
// non-house radius and ignored every knob, poisoning the knob probes.
import { Button } from '@repo/forms';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { YStack } from 'tamagui';

import { ScreenToolbar } from './Page';

const meta: Meta<typeof ScreenToolbar> = {
  title: 'Components/ScreenToolbar',
  component: ScreenToolbar,
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          'Minimal toolbar with leading/trailing slots for the back-plus-primary-action pattern on detail screens.',
      },
    },
  },
};
export default meta;

type Story = StoryObj<typeof ScreenToolbar>;

export const Default: Story = {
  name: 'Main',
  render: () => (
    <ScreenToolbar
      leading={<Button compact>Back</Button>}
      trailing={
        <>
          <Button compact>Cancel</Button>
          <Button compact>Save</Button>
        </>
      }
    />
  ),
};

export const Empty: Story = {
  render: () => <ScreenToolbar />,
};

export const LeadingOnly: Story = {
  render: () => <ScreenToolbar leading={<Button compact>Back</Button>} />,
};

export const DisabledAndLoading: Story = {
  render: () => (
    <ScreenToolbar
      leading={
        // A disabled control explains itself; inline placement keeps
        // the toolbar row's shared control height.
        <Button compact disabled disabledReason="No screen to go back to" disabledReasonPlacement="inline">
          Back
        </Button>
      }
      trailing={
        // The house loading state: `loading` renders the spinner and is a
        // derived (never bare) disable.
        <Button compact loading>
          Saving
        </Button>
      }
    />
  ),
};

export const ManyActionsNarrow: Story = {
  render: () => (
    <YStack maxWidth={320} borderWidth={1} borderColor="$color6" borderStyle="dashed">
      <ScreenToolbar
        leading={<Button compact>Back to the previous screen</Button>}
        trailing={
          <>
            <Button compact>Duplicate</Button>
            <Button compact>Archive</Button>
            <Button compact>Delete permanently</Button>
            <Button compact>Save changes</Button>
          </>
        }
      />
    </YStack>
  ),
};
