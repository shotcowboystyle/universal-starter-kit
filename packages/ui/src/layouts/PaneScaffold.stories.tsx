import { getGroupPosition, stackRadiusProps, useReadableTextOn, useResolvedKnobs } from '@repo/theme';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import type { ReactNode } from 'react';
import { Paragraph, Text, YStack } from 'tamagui';

import { componentColors } from '../componentColors';
import { Text as HouseText } from '../Text';

import { FeedLayout, ListDetailLayout, PaneScaffold, ReadingWidth, SupportingPaneLayout } from './PaneScaffold';

function SplitFrame({ children, height = 360 }: { children: ReactNode; height?: number }) {
  const { knobProps } = useResolvedKnobs();
  return (
    <YStack height={height} overflow="hidden" {...knobProps.borderRadius}>
      {children}
    </YStack>
  );
}

function PaneFill({ label, hint, muted }: { label: string; hint?: string; muted?: boolean }) {
  return (
    <YStack
      flex={1}
      height="100%"
      padding="$4"
      backgroundColor={muted ? componentColors.surface.background : '$background'}
      justifyContent="center"
      gap="$2">
      <Paragraph fontWeight="600">{label}</Paragraph>
      {hint ? <HouseText fontSize="$2">{hint}</HouseText> : null}
    </YStack>
  );
}

const LIST_ITEMS = ['Inbox', 'Drafts', 'Sent', 'Archive'];

function DemoList({ active = 0 }: { active?: number }) {
  const onAccent = useReadableTextOn('$accentBackground');
  return (
    <YStack flex={1} height="100%" backgroundColor={componentColors.surface.background}>
      {LIST_ITEMS.map((label, i) => {
        const position = getGroupPosition(i, LIST_ITEMS.length);
        const corners = stackRadiusProps(position, 0);
        const selected = i === active;
        return (
          <YStack
            key={label}
            {...corners}
            padding="$3"
            backgroundColor={selected ? '$accentBackground' : 'transparent'}>
            <Text
              fontWeight={selected ? '600' : '400'}
              color={selected && onAccent ? onAccent : componentColors.text.primary}>
              {label}
            </Text>
          </YStack>
        );
      })}
    </YStack>
  );
}

function FeedCards() {
  const { knobProps } = useResolvedKnobs();
  return (
    <FeedLayout>
      {['Card A', 'Card B', 'Card C'].map((label) => (
        <YStack
          key={label}
          minHeight={120}
          padding="$4"
          backgroundColor={componentColors.surface.background}
          justifyContent="center"
          {...knobProps.borderRadius}>
          <Paragraph fontWeight="600">{label}</Paragraph>
        </YStack>
      ))}
    </FeedLayout>
  );
}

const meta: Meta<typeof PaneScaffold> = {
  title: 'Components/PaneScaffold',
  component: PaneScaffold,
  parameters: {
    status: { type: 'beta' },
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Adaptive TWO-pane shell (DG-LAY-01/02) — `primary` and `secondary`, no more. Size classes: compact <640, medium ≥640, expanded ≥860 (FloatingPanel), large ≥1024, xl ≥1280. Two panes from expanded up unless `maxPanes` ejects. Side-by-side uses a hairline sash (Linear / VS Code / Polaris Frame); pass `paneGap` to eject to spaced columns. Below expanded the panes stack and the sash goes away, so nothing is hidden on a phone; `narrowLayout="swap"` (what `activePane` opts into) is the list-detail exception. Three regions come from nesting a scaffold inside a pane — see the Nested three-region story; the size class rides down, so the inner scaffold stacks with the outer. `orientation="vertical"` docks `secondary` under `primary` with the same sash turned on its side (↑/↓, Home/End, double-press resets) — see the Docked editor story.',
      },
    },
  },
  argTypes: {
    sizeClass: {
      control: 'select',
      options: ['compact', 'medium', 'expanded', 'large', 'xl'],
    },
    orientation: { control: 'radio', options: ['horizontal', 'vertical'] },
    activePane: { control: 'radio', options: ['primary', 'secondary'] },
    narrowLayout: { control: 'radio', options: ['stack', 'swap'] },
    maxPanes: { control: 'radio', options: [1, 2, undefined] },
    resizable: { control: 'boolean' },
  },
  args: {
    sizeClass: 'expanded',
  },
};
export default meta;

type Story = StoryObj<typeof PaneScaffold>;

export const TwoPane: Story = {
  name: 'Main',
  render: (args) => (
    <YStack height={400} padding="$4">
      <SplitFrame>
        <PaneScaffold
          {...args}
          primary=<PaneFill label="Primary" hint="Drag the seam · arrows resize" />
          secondary=<PaneFill label="Secondary" muted />
        />
      </SplitFrame>
    </YStack>
  ),
};

export const CompactStacked: Story = {
  name: 'Compact (stacked)',
  args: { sizeClass: 'compact' },
  parameters: {
    docs: {
      description: {
        story: 'Below the two-pane budget the secondary sits under the primary and the sash is gone. Reflow, not hide.',
      },
    },
  },
  render: (args) => (
    <YStack height={400} padding="$4">
      <SplitFrame>
        <PaneScaffold {...args} primary=<PaneFill label="Primary" /> secondary=<PaneFill label="Secondary" muted /> />
      </SplitFrame>
    </YStack>
  ),
};

export const NestedThreeRegion: Story = {
  name: 'Nested three-region',
  args: { sizeClass: 'compact' },
  parameters: {
    docs: {
      description: {
        story:
          'Rail | (centre | inspector): the recipe for three regions. Switch `sizeClass` to `xl` for two seams side by side; on compact all three stack, none is dropped.',
      },
    },
  },
  render: (args) => (
    <YStack height={520} padding="$4">
      <SplitFrame height={480}>
        <PaneScaffold
          {...args}
          paneFlex={[1, 3]}
          primary=<PaneFill label="Rail" muted />
          secondary=<PaneScaffold
            paneFlex={[2, 1]}
            primary=<PaneFill label="Centre" hint="Main canvas" />
            secondary=<PaneFill label="Inspector" muted />
          />
        />
      </SplitFrame>
    </YStack>
  ),
};

export const DockedEditor: Story = {
  name: 'Docked editor (vertical)',
  args: { sizeClass: 'xl', orientation: 'vertical' },
  parameters: {
    docs: {
      description: {
        story:
          '`orientation="vertical"` runs the seam across the page: the body above, an editor docked below, resized by dragging the seam (↑/↓ from the keyboard, Home/End for the clamps, double-press resets). The body here is itself a horizontal scaffold, which is how a strip editor sits under a multi-pane page. A vertical scaffold splits the height its parent gives it, so the frame is bounded.',
      },
    },
  },
  render: (args) => (
    <YStack height={520} padding="$4">
      <SplitFrame height={480}>
        <PaneScaffold
          {...args}
          paneFlex={[3, 1]}
          primary=<PaneScaffold
            paneFlex={[2, 1]}
            primary=<PaneFill label="Page body" hint="Drag the seam below · ↑/↓ resize" />
            secondary=<PaneFill label="Inspector" muted />
          />
          secondary=<PaneFill label="Editor" hint="Docked under the page" muted />
        />
      </SplitFrame>
    </YStack>
  ),
};

export const CompactActiveSecondary: Story = {
  name: 'Compact (swap)',
  args: { sizeClass: 'compact', activePane: 'secondary' },
  render: (args) => (
    <YStack height={400} padding="$4">
      <SplitFrame>
        <PaneScaffold
          {...args}
          primary=<PaneFill label="List (hidden)" />
          secondary=<PaneFill label="Detail (shown)" muted />
        />
      </SplitFrame>
    </YStack>
  ),
};

export const ListDetail: StoryObj<typeof ListDetailLayout> = {
  render: () => (
    <YStack height={400} padding="$4">
      <SplitFrame>
        <ListDetailLayout
          sizeClass="expanded"
          list=<DemoList />
          detail=<PaneFill label="Inbox" hint="List is the narrower pane. Detail stays meaningful on its own." />
        />
      </SplitFrame>
    </YStack>
  ),
};

export const SupportingPane: StoryObj<typeof SupportingPaneLayout> = {
  render: () => (
    <YStack height={400} padding="$4">
      <SplitFrame>
        <SupportingPaneLayout
          sizeClass="large"
          supporting=<PaneFill label="Supporting (⅓)" muted hint="Properties · filters · meta" />>
          <PaneFill label="Primary (⅔)" hint="Main canvas" />
        </SupportingPaneLayout>
      </SplitFrame>
    </YStack>
  ),
};

export const Feed: StoryObj<typeof FeedLayout> = {
  render: () => (
    <YStack padding="$4">
      <FeedCards />
    </YStack>
  ),
};

export const ProseReadingWidth: StoryObj<typeof ReadingWidth> = {
  render: () => (
    <YStack padding="$4" gap="$3">
      <ReadingWidth>
        <Paragraph>
          ReadingWidth caps prose at ~70ch (DG-LAY-05). This paragraph should wrap near sixty-five to seventy-five
          characters per line rather than stretching edge-to-edge on a wide viewport. Full-bleed is the eject via
          measure=&quot;none&quot;.
        </Paragraph>
      </ReadingWidth>
      <ReadingWidth measure="none">
        <HouseText>Ejected measure (full width of parent).</HouseText>
      </ReadingWidth>
    </YStack>
  ),
};
