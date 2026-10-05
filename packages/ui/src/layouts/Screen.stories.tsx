// Catalog Button (story honesty).
import { Button, Input } from '@repo/forms';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useState } from 'react';
import { Paragraph, SizableText, YStack } from 'tamagui';

import { SheetModal } from '../SheetModal';

import { CONTENT_MAX_WIDTH, EmptyState, PageHeader, PageSection, Screen } from './Page';

const meta: Meta<typeof Screen> = {
  title: 'Components/Screen',
  component: Screen,
  parameters: {
    status: { type: 'beta' },
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Outer page shell: scroll container, max-width centering, knob panel padding + gapLg between page regions. Density is unpinned so the density knob restyles the page (LC-76).',
      },
    },
  },
  argTypes: {
    scroll: { control: 'boolean' },
    maxWidth: { control: 'number' },
    bleed: { control: 'boolean' },
    noPadding: { control: 'boolean' },
    compact: {
      control: 'boolean',
      description: 'Density override. Omitted follows the density knob (LC-76).',
    },
  },
  args: {
    scroll: true,
    maxWidth: CONTENT_MAX_WIDTH,
    bleed: false,
    noPadding: false,
  },
};
export default meta;

type Story = StoryObj<typeof Screen>;

export const Default: Story = {
  name: 'Main',
  render: (args) => (
    <Screen {...args}>
      <PageHeader title="Screen" subtitle="Outer page shell with knob padding" />
      <PageSection title="Region one">
        <Paragraph>First page region.</Paragraph>
      </PageSection>
      <PageSection title="Region two">
        <Paragraph>Second page region.</Paragraph>
      </PageSection>
    </Screen>
  ),
};

export const Empty: Story = {
  render: (args) => <Screen {...args} />,
};

export const LongContent: Story = {
  render: (args) => (
    <Screen {...args}>
      <PageHeader title="Long content" subtitle="Forces internal scrolling" />
      {Array.from({ length: 40 }).map((_, i) => (
        <Paragraph key={i}>
          Paragraph {i + 1} — enough repeated content to overflow the viewport and exercise the internal ScrollView
          instead of the document scrollbar.
        </Paragraph>
      ))}
    </Screen>
  ),
};

export const NoScroll: Story = {
  args: { scroll: false },
  render: (args) => (
    <Screen {...args}>
      <PageHeader title="No scroll" subtitle="scroll=false renders a plain YStack" />
      <Paragraph>Static content.</Paragraph>
    </Screen>
  ),
};

export const ShortContentCentering: Story = {
  render: (args) => (
    <Screen {...args}>
      <EmptyState
        title="Nothing here"
        description="EmptyState should center in the viewport when content is shorter than the screen."
        action={<Button>Create one</Button>}
      />
    </Screen>
  ),
};

export const NestedScreens: Story = {
  render: (args) => (
    <Screen {...args}>
      <PageHeader title="Outer screen" />
      <YStack borderWidth={1} borderColor="$color6" borderStyle="dashed">
        <Screen {...args} scroll={false}>
          <PageHeader title="Inner screen" divider={false} />
          <Paragraph>Nested screen content — check for double padding.</Paragraph>
        </Screen>
      </YStack>
    </Screen>
  ),
};

const PROJECTS = ['Alpha', 'Beta', 'Gamma', 'Delta'] as const;

function SheetOverKeyboardHarness(args: Story['args']) {
  const [open, setOpen] = useState(false);
  const [picks, setPicks] = useState<string[]>([]);
  const readout = `Picks: ${picks.length}${picks.length ? `, last ${picks[picks.length - 1]}` : ''}`;
  return (
    <Screen {...args}>
      <PageHeader
        title="Sheet over the keyboard"
        subtitle="The Screen scrolls at its defaults and the sheet opens over it"
      />
      <Paragraph testID="screen-plain-text">With a field focused, a tap on this text dismisses the keyboard.</Paragraph>
      <Input label="Screen field" placeholder="Focus to raise the keyboard" />
      <Button
        onPress={() => {
          setOpen(true);
        }}>
        Open sheet
      </Button>
      <Paragraph testID="screen-picks">{readout}</Paragraph>
      <SheetModal
        open={open}
        onOpenChange={setOpen}
        header={<SizableText fontWeight="600">Pick a project</SizableText>}>
        <YStack gap="$2">
          <Input label="Search" placeholder="Focus to raise the keyboard" />
          <Paragraph testID="sheet-picks">{readout}</Paragraph>
          {PROJECTS.map((name) => (
            <Button
              key={name}
              onPress={() => {
                setPicks((previous) => [...previous, name]);
              }}>
              {name}
            </Button>
          ))}
        </YStack>
      </SheetModal>
    </Screen>
  );
}

export const SheetOverKeyboard: Story = {
  name: 'Sheet over the keyboard',
  parameters: {
    nativeGallery: { scroll: false },
    docs: {
      description: {
        story:
          "MPO-457: the sheet is an RN Modal, so the Screen's ScrollView is a React ancestor of every row in it. Focus Search, then tap a project: the first tap picks it while the keyboard stays up.",
      },
    },
  },
  render: (args) => <SheetOverKeyboardHarness {...args} />,
};
