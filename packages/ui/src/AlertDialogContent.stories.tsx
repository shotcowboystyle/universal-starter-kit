import { Button } from '@repo/forms';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useState } from 'react';
import { XStack, YStack } from 'tamagui';

import { AlertDialog } from './Dialog';
import { AlertDialogContent, AlertDialogOverlay } from './surfaces';

function AlertDialogHarness({ startOpen = true }: { startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  return (
    <YStack minHeight={400} alignItems="flex-start">
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialog.Trigger asChild>
          <Button>Open confirm</Button>
        </AlertDialog.Trigger>
        <AlertDialog.Portal>
          <AlertDialogOverlay key="overlay" />
          <AlertDialogContent key="content" maxWidth={420} role="alertdialog">
            <AlertDialog.Title>Delete customer?</AlertDialog.Title>
            <AlertDialog.Description>This removes the customer record. This cannot be undone.</AlertDialog.Description>
            <XStack justifyContent="flex-end" gap="$2">
              <AlertDialog.Cancel asChild>
                <Button chromeless>Cancel</Button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <Button error>Delete</Button>
              </AlertDialog.Action>
            </XStack>
          </AlertDialogContent>
        </AlertDialog.Portal>
      </AlertDialog>
    </YStack>
  );
}

const meta: Meta<typeof AlertDialogContent> = {
  title: 'Components/AlertDialogContent',
  component: AlertDialogContent,
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          "House AlertDialog content surface (MPO-21 G6). `unstyled` drops Tamagui's " +
          'baked-in `elevate: true` chrome so `elevatedSurface` (overlay elevation ' +
          'token, MPO-49) is the only surface source. Pairs with AlertDialogOverlay. ' +
          'Destructive confirms use this surface (DG-OVL-02).',
      },
    },
  },
};
export default meta;

type Story = StoryObj<typeof AlertDialogContent>;

export const Default: Story = {
  name: 'Main',
  render: () => <AlertDialogHarness />,
};

export const Closed: Story = {
  render: () => <AlertDialogHarness startOpen={false} />,
};
