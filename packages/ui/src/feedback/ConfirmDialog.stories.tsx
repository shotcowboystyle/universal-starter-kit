import { Button } from '@repo/forms';
import { action } from '@repo/storybook';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useEffect, useState } from 'react';
import { Paragraph, SizableText, XStack, YStack } from 'tamagui';

import { resetToasts } from '../Toast/store';

import { ConfirmDialog } from './ConfirmDialog';

import { notify, NotifyHost, resetFeedback } from './index';

const meta: Meta<typeof ConfirmDialog> = {
  title: 'Components/ConfirmDialog',
  component: ConfirmDialog,
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          "Blocking confirm/cancel alertdialog (DG-OVL-01/02, W7). Modal focus trap; Escape cancels; no light-dismiss. `destructive` paints a danger confirm. Wired from `notify({ severity:'error'|'warning', blocking:true })` via NotifyHost.",
      },
    },
  },
};
export default meta;

type Story = StoryObj<typeof ConfirmDialog>;

function ConfirmHarness({
  destructive = false,
  warning = false,
  startOpen = true,
  confirmLabel = 'Delete',
  title = 'Delete customer?',
  body = 'This removes the customer record. This cannot be undone.',
  confirmDisabled = false,
  confirmDisabledReason,
}: {
  destructive?: boolean;
  warning?: boolean;
  startOpen?: boolean;
  confirmLabel?: string;
  title?: string;
  body?: string;
  confirmDisabled?: boolean;
  confirmDisabledReason?: string;
}) {
  const [open, setOpen] = useState(startOpen);
  return (
    <YStack minHeight={360} gap="$3" padding="$4" alignItems="flex-start">
      <Button
        size="$3"
        onPress={() => {
          setOpen(true);
        }}>
        Open confirm
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={title}
        body={body}
        confirmLabel={confirmLabel}
        cancelLabel="Cancel"
        destructive={destructive}
        warning={warning}
        confirmDisabled={confirmDisabled}
        confirmDisabledReason={confirmDisabledReason}
        onConfirm={() => action('confirm')()}
        onCancel={() => action('cancel')()}
      />
    </YStack>
  );
}

export const Default: Story = {
  name: 'Main',
  render: () => (
    <ConfirmHarness
      destructive={false}
      confirmLabel="Continue"
      title="Leave this page?"
      body="Your unsaved edits will be discarded."
    />
  ),
};

export const Destructive: Story = {
  render: () => <ConfirmHarness destructive />,
};

export const Warning: Story = {
  render: () => (
    <ConfirmHarness
      warning
      confirmLabel="Leave anyway"
      title="Unsaved changes"
      body="Leave this page? Your edits will be lost."
    />
  ),
};

export const Gated: Story = {
  render: () => (
    <ConfirmHarness
      destructive
      confirmLabel="Delete"
      title="Delete project acme?"
      body="Type the project name to confirm. This cannot be undone."
      confirmDisabled
      confirmDisabledReason='Type "acme" to confirm.'
    />
  ),
};

function NotifyBlockingDemo() {
  useEffect(() => {
    resetToasts();
    resetFeedback();
    return () => {
      resetToasts();
      resetFeedback();
    };
  }, []);

  return (
    <NotifyHost>
      <YStack gap="$4" padding="$4" maxWidth={640}>
        <SizableText fontWeight="700" fontSize="$5">
          notify() → ConfirmDialog
        </SizableText>
        <Paragraph size="$3" color="$color11">
          Blocking error opens a destructive ConfirmDialog; blocking warning opens a caution ConfirmDialog. Escape or
          Cancel dismisses.
        </Paragraph>
        <XStack gap="$2" flexWrap="wrap">
          <Button
            size="$3"
            error
            onPress={() =>
              notify({
                severity: 'error',
                scope: 'page',
                blocking: true,
                title: 'Delete 12 rows?',
                body: 'Selected rows will be permanently removed.',
                action: {
                  label: 'Delete',
                  onPress: () => action('delete-confirm')(),
                },
              })
            }>
            error + blocking (destructive)
          </Button>
          <Button
            size="$3"
            warning
            onPress={() =>
              notify({
                severity: 'warning',
                scope: 'page',
                blocking: true,
                title: 'Unsaved changes',
                body: 'Leave this page? Your edits will be lost.',
                action: {
                  label: 'Leave anyway',
                  onPress: () => action('leave-confirm')(),
                },
              })
            }>
            warning + blocking
          </Button>
        </XStack>
      </YStack>
    </NotifyHost>
  );
}

/** Integration: notify(blocking) presents ConfirmDialog through NotifyHost. */
export const NotifyBlocking: Story = {
  name: 'notify() blocking',
  render: () => <NotifyBlockingDemo />,
};
