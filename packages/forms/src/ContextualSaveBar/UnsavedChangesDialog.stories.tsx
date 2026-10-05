import { action } from '@repo/storybook';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useState } from 'react';
import { Paragraph, YStack } from 'tamagui';

import { Button } from '../Button';

import { UnsavedChangesDialog } from './UnsavedChangesDialog';

const meta: Meta<typeof UnsavedChangesDialog> = {
  title: 'Forms/ContextualSaveBar/UnsavedChangesDialog',
  component: UnsavedChangesDialog,
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          'The route-leave confirm ContextualSaveBar raises (DG-OVL-02) when a navigation would throw away edits. It is an `alertdialog`, it cannot be dismissed by clicking the scrim, and the destructive choice is the one on the right — so nobody discards work by reflex. It lives in forms rather than components because ConfirmDialog would import the forms Button and cycle.',
      },
    },
  },
  argTypes: {
    open: { control: 'boolean' },
    fieldCount: { control: { type: 'number', min: 0, step: 1 } },
  },
  args: {
    open: true,
    fieldCount: 3,
  },
};

export default meta;
type Story = StoryObj<typeof UnsavedChangesDialog>;

export const Basic: Story = {
  render: (args) => (
    <UnsavedChangesDialog {...args} onKeepEditing={action('onKeepEditing')} onDiscard={action('onDiscard')} />
  ),
};

/**
 * The body pluralises: one field reads "1 field ... has edits", more than one
 * reads "N fields ... have edits". Getting this wrong is the tell that a count
 * was interpolated into a fixed string.
 */
export const SingleField: Story = {
  render: () => (
    <UnsavedChangesDialog open fieldCount={1} onKeepEditing={action('onKeepEditing')} onDiscard={action('onDiscard')} />
  ),
};

export const ManyFields: Story = {
  render: () => (
    <UnsavedChangesDialog
      open
      fieldCount={14}
      onKeepEditing={action('onKeepEditing')}
      onDiscard={action('onDiscard')}
    />
  ),
};

/** Closed is a real state: it renders no scrim and nothing takes focus. */
export const Closed: Story = {
  render: () => (
    <YStack gap="$3" maxWidth={420}>
      <Paragraph size="$3">Nothing should paint below this line.</Paragraph>
      <UnsavedChangesDialog
        open={false}
        fieldCount={3}
        onKeepEditing={action('onKeepEditing')}
        onDiscard={action('onDiscard')}
      />
    </YStack>
  ),
};

/**
 * The live loop. "Keep editing" is the safe path and is also what Escape and
 * `onOpenChange(false)` resolve to; "Discard changes" is the only way to lose
 * the edits, and it is the destructive-styled button.
 */
export const Interactive: Story = {
  render: () => {
    const Example = () => {
      const [open, setOpen] = useState(false);
      const [outcome, setOutcome] = useState<string>('nothing yet');
      return (
        <YStack gap="$4" maxWidth={420} alignItems="flex-start">
          <Button
            onPress={() => {
              setOpen(true);
            }}>
            Leave the page
          </Button>
          <Paragraph size="$3">last outcome: {outcome}</Paragraph>
          <UnsavedChangesDialog
            open={open}
            fieldCount={3}
            onKeepEditing={() => {
              setOpen(false);
              setOutcome('kept editing');
              action('onKeepEditing')();
            }}
            onDiscard={() => {
              setOpen(false);
              setOutcome('discarded');
              action('onDiscard')();
            }}
          />
        </YStack>
      );
    };
    return <Example />;
  },
};
