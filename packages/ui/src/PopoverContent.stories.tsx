// Catalog Button (story honesty).
import { Button } from '@repo/forms';
import { OVERLAY_ANCHOR_GAP, useResolvedKnobs } from '@repo/theme';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useState } from 'react';
import { Paragraph, Popover, SizableText, YStack } from 'tamagui';

import { PopoverContent } from './surfaces';

function PopoverHarness({
  placement = 'bottom' as const,
  startOpen = true,
}: {
  placement?: 'bottom' | 'top' | 'right' | 'left';
  startOpen?: boolean;
}) {
  // PopoverContent's contract leaves the inset to the caller (flush menus
  // pass none); the demo caller pad rides the space knob.
  const { knobProps } = useResolvedKnobs();
  const [open, setOpen] = useState(startOpen);
  return (
    <YStack minHeight={320} alignItems="center" justifyContent="center">
      {/* OVERLAY_ANCHOR_GAP rule: popovers keep the shared anchored-overlay
          gap between trigger edge and content (offset lives on the root). */}
      <Popover open={open} onOpenChange={setOpen} placement={placement} offset={OVERLAY_ANCHOR_GAP}>
        <Popover.Trigger asChild>
          <Button>Toggle popover</Button>
        </Popover.Trigger>
        <PopoverContent maxWidth={300}>
          <YStack {...knobProps.gap} {...knobProps.panelPadding}>
            <SizableText fontWeight="400">Popover title</SizableText>
            <Paragraph>Elevated overlay surface driven by the elevatedSurface knob recipe.</Paragraph>
          </YStack>
        </PopoverContent>
      </Popover>
    </YStack>
  );
}

const meta: Meta<typeof PopoverContent> = {
  title: 'Components/PopoverContent',
  component: PopoverContent,
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          'Popover.Content wrapper applying the elevatedSurface knob recipe (background, border, radius, elevation).',
      },
    },
  },
};
export default meta;

type Story = StoryObj<typeof PopoverContent>;

export const Default: Story = {
  name: 'Main',
  render: () => <PopoverHarness />,
};

export const PlacementTop: Story = {
  render: () => <PopoverHarness placement="top" />,
};

export const Closed: Story = {
  render: () => <PopoverHarness startOpen={false} />,
};
