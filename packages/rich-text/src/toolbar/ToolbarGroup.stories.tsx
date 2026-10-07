/**
 * Storybook stories for ToolbarGroup — the toolbar's segmenting wrapper: it
 * lays its buttons out in a row and, unless told otherwise, draws the vertical
 * rule that separates one cluster of controls from the next.
 *
 * Stories: Main, NoSeparator, Hidden, TwoGroups
 *
 * The group has no state of its own, so the controls are its whole surface:
 * `visible` decides whether anything renders at all, `showSeparator` decides
 * whether the trailing rule does.
 */
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { XStack } from 'tamagui';

import { RichEditorContext } from '../context';
import { ToolbarFrame } from '../styled';

import { BoldIcon, ItalicIcon, RedoIcon, StrikeIcon, UndoIcon } from './icons';
import { ToolbarButton } from './ToolbarButton';
import { ToolbarGroup } from './ToolbarGroup';

export interface ToolbarGroupStoryArgs {
  /** Renders nothing at all when false — how the toolbar drops a section */
  visible: boolean;
  /** Draws the trailing vertical rule that ends the cluster */
  showSeparator: boolean;
}

/** A history cluster: the pair the real toolbar opens with. */
function HistoryButtons() {
  return (
    <>
      <ToolbarButton
        onPress={() => {}}
        aria-label="Undo">
        <UndoIcon />
      </ToolbarButton>
      <ToolbarButton
        onPress={() => {}}
        aria-label="Redo">
        <RedoIcon />
      </ToolbarButton>
    </>
  );
}

/** A formatting cluster: the group that follows history in the real toolbar. */
function FormattingButtons() {
  return (
    <>
      <ToolbarButton
        active
        onPress={() => {}}
        aria-label="Bold">
        <BoldIcon>B</BoldIcon>
      </ToolbarButton>
      <ToolbarButton
        onPress={() => {}}
        aria-label="Italic">
        <ItalicIcon>I</ItalicIcon>
      </ToolbarButton>
      <ToolbarButton
        onPress={() => {}}
        aria-label="Strikethrough">
        <StrikeIcon>S</StrikeIcon>
      </ToolbarButton>
    </>
  );
}

const meta: Meta<ToolbarGroupStoryArgs> = {
  title: 'Forms/RichTextEditor/ToolbarGroup',
  component: ToolbarGroup as never,
  parameters: {
    layout: 'padded',
  },
  argTypes: {
    visible: { control: 'boolean' },
    showSeparator: { control: 'boolean' },
  },
  args: {
    visible: true,
    showSeparator: true,
  },
  decorators: [
    (Story) => (
      <RichEditorContext.Provider
        size="$true"
        compact={false}
        disabled={false}>
        <Story />
      </RichEditorContext.Provider>
    ),
  ],
  // The group only reads as a group inside the bar it segments, so every
  // story renders it in a real ToolbarFrame with a neighbour after it.
  render: (args) => (
    <ToolbarFrame maxWidth={420}>
      <XStack
        alignItems="center"
        gap="$1"
        paddingHorizontal="$2">
        <ToolbarGroup
          visible={args.visible}
          showSeparator={args.showSeparator}>
          <HistoryButtons />
        </ToolbarGroup>
        <ToolbarGroup showSeparator={false}>
          <FormattingButtons />
        </ToolbarGroup>
      </XStack>
    </ToolbarFrame>
  ),
};

export default meta;
type Story = StoryObj<ToolbarGroupStoryArgs>;

// ---------------------------------------------------------------------------
// Main (with controls) — a group with its trailing rule
// ---------------------------------------------------------------------------

export const Main: Story = {};

// ---------------------------------------------------------------------------
// NoSeparator — the last group in a bar ends without a rule
// ---------------------------------------------------------------------------

export const NoSeparator: Story = {
  name: 'No separator',
  args: {
    showSeparator: false,
  },
};

// ---------------------------------------------------------------------------
// Hidden — visible={false} removes the buttons AND the rule
// ---------------------------------------------------------------------------

export const Hidden: Story = {
  args: {
    visible: false,
  },
};

// ---------------------------------------------------------------------------
// TwoGroups — the shape the toolbar is actually built from
// ---------------------------------------------------------------------------

export const TwoGroups: Story = {
  name: 'Two groups',
  render: () => (
    <ToolbarFrame maxWidth={420}>
      <XStack
        alignItems="center"
        gap="$1"
        paddingHorizontal="$2">
        <ToolbarGroup>
          <HistoryButtons />
        </ToolbarGroup>
        <ToolbarGroup>
          <FormattingButtons />
        </ToolbarGroup>
        <ToolbarGroup showSeparator={false}>
          <ToolbarButton
            onPress={() => {}}
            aria-label="Blockquote">
            <BoldIcon>Q</BoldIcon>
          </ToolbarButton>
        </ToolbarGroup>
      </XStack>
    </ToolbarFrame>
  ),
};
