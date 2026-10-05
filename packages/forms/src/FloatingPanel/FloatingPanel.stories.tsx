import { Preset } from '@repo/theme';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useState } from 'react';
import { H4, Paragraph, ScrollView, Separator, Text, View, XStack, YStack } from 'tamagui';

import { Button } from '../Button';
import { Select } from '../fields/Select';
import { formCommonColors } from '../shared/colorRamps';

import { FloatingPanel } from './index';

const meta: Meta<typeof FloatingPanel> = {
  title: 'Forms/FloatingPanel',
  component: FloatingPanel,
  parameters: {
    docs: {
      description: {
        component:
          'A floating panel that adapts: on native and sm screens, uses Sheet (slide-up); on larger web, uses a custom @floating-ui/react overlay with dropdown/dropup, scroll arrows, grow-on-scroll, and page scroll lock (same approach as Select/Combobox). Pass sheet={true} to force Sheet on desktop. Used by ColorPicker, DatePicker, TimePicker, and Duration.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof FloatingPanel>;

export const Basic: Story = {
  name: 'Main',
  render: () => {
    const [open, setOpen] = useState(false);
    return (
      <YStack padding="$4" gap="$4" maxWidth={400}>
        <Paragraph color={formCommonColors.muted}>Click the trigger to open the floating panel.</Paragraph>
        <FloatingPanel
          open={open}
          onOpenChange={setOpen}
          trigger={<Button>{open ? 'Panel is open' : 'Click to open panel'}</Button>}>
          <YStack gap="$3">
            <H4>Panel Content</H4>
            <Paragraph>
              Anchored to the trigger with a gap, never covering it. Escape or an outside click dismisses and returns
              focus.
            </Paragraph>
            <Separator />
            <Button
              onPress={() => {
                setOpen(false);
              }}>
              Close
            </Button>
          </YStack>
        </FloatingPanel>
      </YStack>
    );
  },
};

export const ScrollableContent: Story = {
  render: () => {
    const [open, setOpen] = useState(false);
    const items = Array.from({ length: 50 }, (_, i) => `Item ${i + 1}`);
    return (
      <YStack padding="$4" gap="$4" maxWidth={400}>
        <Paragraph color={formCommonColors.muted}>
          A scrollable floating panel with many items. Drag the handle to resize.
        </Paragraph>
        <FloatingPanel
          open={open}
          onOpenChange={setOpen}
          scrollable
          trigger={<Button>{open ? 'Scrollable panel open' : 'Click for scrollable panel'}</Button>}>
          <YStack>
            {items.map((item) => (
              <View
                key={item}
                paddingHorizontal="$3"
                paddingVertical="$2.5"
                hoverStyle={{ backgroundColor: '$backgroundHover' }}
                cursor="pointer"
                onPress={() => {
                  setOpen(false);
                }}>
                <Text>{item}</Text>
              </View>
            ))}
          </YStack>
        </FloatingPanel>
      </YStack>
    );
  },
};

export const Disabled: Story = {
  render: () => {
    const [open, setOpen] = useState(false);
    return (
      <YStack padding="$4" gap="$4" maxWidth={400}>
        <FloatingPanel open={open} onOpenChange={setOpen} disabled trigger={<Button disabled>Disabled trigger</Button>}>
          <YStack>
            <Paragraph>You should never see this.</Paragraph>
          </YStack>
        </FloatingPanel>
      </YStack>
    );
  },
};

export const FillSizing: Story = {
  render: () => {
    const [open, setOpen] = useState(false);
    const items = Array.from({ length: 30 }, (_, i) => `Option ${i + 1}`);
    return (
      <YStack padding="$4" gap="$4" maxWidth={400}>
        <Paragraph color={formCommonColors.muted}>
          sizing="fill" opens the panel at maximum available viewport size immediately, without requiring scroll to
          grow. Ideal for calendars, color pickers, and fixed-content panels.
        </Paragraph>
        <FloatingPanel
          open={open}
          onOpenChange={setOpen}
          scrollable
          sizing="fill"
          trigger={<Button>{open ? 'Fill panel open' : 'Click for fill-sized panel'}</Button>}>
          <YStack>
            {items.map((item) => (
              <View
                key={item}
                paddingHorizontal="$3"
                paddingVertical="$2.5"
                hoverStyle={{ backgroundColor: '$backgroundHover' }}
                cursor="pointer"
                onPress={() => {
                  setOpen(false);
                }}>
                <Text>{item}</Text>
              </View>
            ))}
          </YStack>
        </FloatingPanel>
      </YStack>
    );
  },
};

export const ForceSheet: Story = {
  render: () => {
    const [open, setOpen] = useState(false);
    return (
      <YStack padding="$4" gap="$4" maxWidth={400}>
        <Paragraph color={formCommonColors.muted}>
          sheet forces Sheet mode even on desktop (floating panel otherwise).
        </Paragraph>
        <FloatingPanel
          open={open}
          onOpenChange={setOpen}
          sheet
          trigger={<Button>{open ? 'Sheet open' : 'Click for Sheet (forced)'}</Button>}>
          <YStack gap="$3">
            <H4>Forced Sheet</H4>
            <Paragraph>This panel always uses Sheet, even on large screens.</Paragraph>
            <Button
              onPress={() => {
                setOpen(false);
              }}>
              Close
            </Button>
          </YStack>
        </FloatingPanel>
      </YStack>
    );
  },
};

const scrollClipOptions = ['Apple', 'Banana', 'Cherry', 'Date', 'Elderberry', 'Fig', 'Grape', 'Honeydew'].map(
  (label) => ({ label, value: label.toLowerCase() }),
);

function ScrollClipPair({ where }: { where: string }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<string | undefined>(undefined);
  return (
    <YStack gap="$3" data-testid={`scroll-clip-pair-${where}`}>
      <Select
        label={`Select (${where})`}
        placeholder="Pick a fruit"
        options={scrollClipOptions}
        value={value}
        onValueChange={(next) => {
          setValue(Array.isArray(next) ? next[0] : next);
        }}
      />
      <FloatingPanel open={open} onOpenChange={setOpen} trigger={<Button>{`FloatingPanel (${where})`}</Button>}>
        <YStack gap="$3" data-testid={`scroll-clip-panel-${where}`}>
          <H4>Panel {where}</H4>
          <Paragraph>
            This body is taller than the space left in the scroll view, so a clipped panel loses its lower half.
          </Paragraph>
          <Separator />
          <Button
            onPress={() => {
              setOpen(false);
            }}>
            Close
          </Button>
        </YStack>
      </FloatingPanel>
    </YStack>
  );
}

/**
 * react-native-web's ScrollView sets `transform: translateZ(0)`,
 * which makes it the containing block of a `position: fixed` panel. Both
 * controls sit at the bottom of a 260px ScrollView; opened, their panels
 * must render in full past the scroller's edge, flush on the trigger, with
 * the same theme and radius as the pair outside the scroller.
 */
export const InsideScrollView: Story = {
  render: () => (
    <Preset theme="blue" overrides={{ borderRadius: 'large' }}>
      <XStack padding="$4" gap="$6" alignItems="flex-start" flexWrap="wrap">
        <YStack width={320} gap="$2">
          <Paragraph color={formCommonColors.muted}>Inside a ScrollView</Paragraph>
          <ScrollView
            testID="scroll-clip-scroller"
            height={260}
            borderWidth={1}
            borderColor="$borderColor"
            borderRadius="$4">
            <YStack padding="$3" gap="$3">
              {Array.from({ length: 2 }, (_, i) => (
                <Paragraph key={i} color={formCommonColors.muted}>
                  Filler row {i + 1}
                </Paragraph>
              ))}
              <ScrollClipPair where="inside" />
            </YStack>
          </ScrollView>
        </YStack>
        <YStack width={320} gap="$2">
          <Paragraph color={formCommonColors.muted}>Outside, for comparison</Paragraph>
          <YStack padding="$3" gap="$3">
            <ScrollClipPair where="outside" />
          </YStack>
        </YStack>
      </XStack>
    </Preset>
  ),
};
