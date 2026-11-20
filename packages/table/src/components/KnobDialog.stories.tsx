/**
 * KnobDialog — Tamagui Dialog with table knobs on the content surface
 * (borderRadius, elevation, gap). FilterManager is the production consumer.
 * These boards show the wrapper itself, open and closed.
 */

import { Button } from '@repo/forms';
import type { Meta } from '@storybook/react-native-web-vite';
import { useState } from 'react';
import { Paragraph, XStack, YStack } from 'tamagui';

import {
  KnobDialog,
  KnobDialogClose,
  KnobDialogContent,
  KnobDialogDescription,
  KnobDialogTitle,
  KnobDialogTrigger,
} from './KnobDialog';

const meta: Meta = {
  title: 'Table/KnobDialog',
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component:
          'Internal table Dialog wrapper. Content inherits container radius, elevation ' +
          'and gap from useResolvedKnobs so FilterManager chrome matches the rest of the table.',
      },
    },
  },
};

export default meta;

const DialogHarness = ({ startOpen = true }: { startOpen?: boolean }) => {
  const [open, setOpen] = useState(startOpen);
  return (
    <YStack
      minHeight={400}
      padding="$4"
      alignItems="flex-start">
      <KnobDialog
        open={open}
        onOpenChange={setOpen}>
        <KnobDialogTrigger asChild>
          <Button>Open dialog</Button>
        </KnobDialogTrigger>
        <KnobDialogContent minWidth={400}>
          <KnobDialogTitle>Save view</KnobDialogTitle>
          <KnobDialogDescription>Name this filter set for later.</KnobDialogDescription>
          <Paragraph>Short dialog body.</Paragraph>
          <XStack justifyContent="flex-end">
            <KnobDialogClose asChild>
              <Button>Close</Button>
            </KnobDialogClose>
          </XStack>
        </KnobDialogContent>
      </KnobDialog>
    </YStack>
  );
};

export const Default = {
  name: 'Main',
  render: () => <DialogHarness />,
};

export const Closed = {
  render: () => <DialogHarness startOpen={false} />,
};
