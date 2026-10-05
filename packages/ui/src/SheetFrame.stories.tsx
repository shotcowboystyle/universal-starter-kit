// Catalog Button (story honesty).
import { Button } from '@repo/forms';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useEffect, useState } from 'react';
import { isWeb, Paragraph, SizableText, YStack } from 'tamagui';

import { SheetModal } from './SheetModal';
import { SheetFrame } from './surfaces';

function SheetHarness({ long = false, startOpen = true }: { long?: boolean; startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  // Tamagui Sheet has no key handling of its own (Dialog dismisses via
  // Dismissable; Sheet does not), so Escape must be wired here for the
  // dismissal intent to reach the sheet at all. Bubble phase: inner popups
  // that own Escape stopPropagation() and keep the sheet open.
  useEffect(() => {
    if (!isWeb || !open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) {
        return;
      }
      setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);
  return (
    <YStack minHeight={480}>
      <Button
        onPress={() => {
          setOpen(true);
        }}>
        Open sheet
      </Button>
      {/* SheetModal: tamagui Sheet modal on web; RN Modal on native (raw
          Sheet cannot (re)present from a trigger tap on device). */}
      <SheetModal
        open={open}
        onOpenChange={setOpen}
        scrollable={long}
        header={<SizableText fontWeight="600">Sheet title</SizableText>}>
        {long ? (
          <YStack gap="$2">
            {Array.from({ length: 40 }).map((_, i) => (
              <Paragraph key={i}>Sheet scroll line {i + 1}.</Paragraph>
            ))}
          </YStack>
        ) : (
          <Paragraph>Short sheet body content.</Paragraph>
        )}
      </SheetModal>
    </YStack>
  );
}

const meta: Meta<typeof SheetFrame> = {
  title: 'Components/SheetFrame',
  component: SheetFrame,
  parameters: {
    status: { type: 'beta' },
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Sheet.Frame overlay chrome: elevatedSurface (border + E-OVERLAY elevation, including at none), containerRadius, panelPadding, transition. Fill is $background — never an invented hex. The modal scrim is not a substitute for frame elevation.',
      },
    },
  },
};
export default meta;

type Story = StoryObj<typeof SheetFrame>;

export const Default: Story = {
  name: 'Main',
  render: () => <SheetHarness />,
};

export const LongScroll: Story = {
  render: () => <SheetHarness long />,
};

export const Closed: Story = {
  render: () => <SheetHarness startOpen={false} />,
};
