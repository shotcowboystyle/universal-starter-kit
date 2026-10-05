// Catalog Button (story honesty). Close sits inside
// DialogContent so it inherits the compact nested-scale step; the
// dialog frame itself does not ring.
import { Button } from '@repo/forms';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useState } from 'react';
import { Paragraph, XStack, YStack } from 'tamagui';

import { Dialog } from './Dialog';
import { DialogContent, DialogOverlay } from './surfaces';

function DialogHarness({ long = false, startOpen = true }: { long?: boolean; startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  return (
    <YStack minHeight={400} alignItems="flex-start">
      <Dialog modal open={open} onOpenChange={setOpen}>
        <Dialog.Trigger asChild>
          <Button>Open dialog</Button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <DialogOverlay key="overlay" />
          <DialogContent key="content" maxWidth={480} maxHeight={520}>
            <Dialog.Title size="$7">Dialog title</Dialog.Title>
            <Dialog.Description>Knob-aware dialog content surface.</Dialog.Description>
            {long ? (
              <YStack gap="$2" maxHeight={280} overflow="scroll">
                {Array.from({ length: 30 }).map((_, i) => (
                  <Paragraph key={i}>Scrolling dialog body line {i + 1}.</Paragraph>
                ))}
              </YStack>
            ) : (
              <Paragraph>Short dialog body content.</Paragraph>
            )}
            <XStack justifyContent="flex-end">
              <Dialog.Close asChild>
                <Button>Close</Button>
              </Dialog.Close>
            </XStack>
          </DialogContent>
        </Dialog.Portal>
      </Dialog>
    </YStack>
  );
}

const meta: Meta<typeof DialogContent> = {
  title: 'Components/DialogContent',
  component: DialogContent,
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          'Dialog.Content wrapper applying elevatedSurface, containerRadius, panelPadding and gap knob recipes. Nested chrome steps one density level down; the frame itself paints no focus ring.',
      },
    },
  },
};
export default meta;

type Story = StoryObj<typeof DialogContent>;

export const Default: Story = {
  name: 'Main',
  render: () => <DialogHarness />,
};

export const LongContent: Story = {
  render: () => <DialogHarness long />,
};

export const Closed: Story = {
  render: () => <DialogHarness startOpen={false} />,
};
