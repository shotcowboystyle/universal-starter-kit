import { action } from '@repo/storybook';
/**
 * Storybook stories for ToolbarButton and ToolbarDropdownButton — the two
 * pressables every toolbar cluster is built from.
 *
 * Stories: Main, Active, Unavailable, WithTooltip, DropdownButton, Row
 *
 * Two things are worth seeing here and nowhere else. The pressable is a 44x44
 * target (Axiom 12) while the visible chrome is a 30x30 box inside it, so the
 * strip stays dense without shrinking the hit area. And an unavailable control
 * is never bare-`disabled` (DG-ST-03): it keeps focus, reports `aria-disabled`,
 * dims, drops its hover surface, and loses its tooltip (DG-OVL-05).
 */
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { XStack } from 'tamagui';

import { RichEditorContext } from '../context';
import { ToolbarFrame } from '../styled';

import { BoldIcon, ItalicIcon, RedoIcon, StrikeIcon, UndoIcon } from './icons';
import { ToolbarButton, ToolbarDropdownButton } from './ToolbarButton';
import { ToolbarGroup } from './ToolbarGroup';

export interface ToolbarButtonStoryArgs {
  /** Format is on: the chrome box takes the active surface */
  active: boolean;
  /** Unavailable: aria-disabled, dimmed, no hover surface, no tooltip */
  disabled: boolean;
  /** Shortcut hint on hover; suppressed while unavailable */
  tooltip: string;
  /** Accessible name — required, since the glyph carries no text */
  'aria-label': string;
}

const meta: Meta<ToolbarButtonStoryArgs> = {
  title: 'Forms/RichTextEditor/ToolbarButton',
  component: ToolbarButton as never,
  parameters: {
    layout: 'padded',
  },
  argTypes: {
    active: { control: 'boolean' },
    disabled: { control: 'boolean' },
    tooltip: { control: 'text' },
    'aria-label': { control: 'text' },
  },
  args: {
    active: false,
    disabled: false,
    tooltip: 'Bold (⌘B)',
    'aria-label': 'Bold',
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
  render: (args) => (
    <ToolbarFrame
      width={80}
      justifyContent="center">
      <ToolbarButton
        active={args.active}
        disabled={args.disabled}
        tooltip={args.tooltip}
        aria-label={args['aria-label']}
        onPress={() => action('onPress')(args['aria-label'])}>
        <BoldIcon>B</BoldIcon>
      </ToolbarButton>
    </ToolbarFrame>
  ),
};

export default meta;
type Story = StoryObj<ToolbarButtonStoryArgs>;

// ---------------------------------------------------------------------------
// Main (with controls)
// ---------------------------------------------------------------------------

export const Main: Story = {};

// ---------------------------------------------------------------------------
// Active — the format is on, so the chrome box takes the active surface
// ---------------------------------------------------------------------------

export const Active: Story = {
  args: {
    active: true,
  },
};

// ---------------------------------------------------------------------------
// Unavailable — DG-ST-03: aria-disabled and washed, never bare `disabled`
// ---------------------------------------------------------------------------

export const Unavailable: Story = {
  args: {
    disabled: true,
    'aria-label': 'Undo',
    tooltip: 'Undo (⌘Z)',
  },
  render: (args) => (
    <ToolbarFrame
      width={80}
      justifyContent="center">
      <ToolbarButton
        disabled={args.disabled}
        tooltip={args.tooltip}
        aria-label={args['aria-label']}
        onPress={() => action('onPress')(args['aria-label'])}>
        <UndoIcon />
      </ToolbarButton>
    </ToolbarFrame>
  ),
};

// ---------------------------------------------------------------------------
// WithTooltip — the shortcut hint that returns with availability
// ---------------------------------------------------------------------------

export const WithTooltip: Story = {
  name: 'With tooltip',
  args: {
    tooltip: 'Strikethrough (⌘⇧X)',
    'aria-label': 'Strikethrough',
  },
  render: (args) => (
    <ToolbarFrame
      width={80}
      justifyContent="center">
      <ToolbarButton
        tooltip={args.tooltip}
        aria-label={args['aria-label']}
        onPress={() => action('onPress')(args['aria-label'])}>
        <StrikeIcon>S</StrikeIcon>
      </ToolbarButton>
    </ToolbarFrame>
  ),
};

// ---------------------------------------------------------------------------
// DropdownButton — the caret variant: fixed height, width follows its label
// ---------------------------------------------------------------------------

export const DropdownButton: Story = {
  name: 'Dropdown button',
  render: () => (
    <ToolbarFrame
      width={220}
      justifyContent="center">
      <XStack
        alignItems="center"
        gap="$1">
        <ToolbarDropdownButton
          aria-label="Heading"
          onPress={() => action('onPress')('Heading')}>
          H1
        </ToolbarDropdownButton>
        <ToolbarDropdownButton
          active
          aria-label="Lists"
          onPress={() => action('onPress')('Lists')}>
          Bullets
        </ToolbarDropdownButton>
        <ToolbarDropdownButton
          disabled
          aria-label="Table"
          onPress={() => action('onPress')('Table')}>
          Table
        </ToolbarDropdownButton>
      </XStack>
    </ToolbarFrame>
  ),
};

// ---------------------------------------------------------------------------
// Row — the four states side by side, in the bar they live in
// ---------------------------------------------------------------------------

export const Row: Story = {
  render: () => (
    <ToolbarFrame width={320}>
      <XStack
        alignItems="center"
        gap="$1"
        paddingHorizontal="$2">
        <ToolbarGroup>
          <ToolbarButton
            disabled
            onPress={() => action('onPress')('Undo')}
            aria-label="Undo"
            tooltip="Undo (⌘Z)">
            <UndoIcon />
          </ToolbarButton>
          <ToolbarButton
            onPress={() => action('onPress')('Redo')}
            aria-label="Redo">
            <RedoIcon />
          </ToolbarButton>
        </ToolbarGroup>
        <ToolbarGroup showSeparator={false}>
          <ToolbarButton
            active
            onPress={() => action('onPress')('Bold')}
            aria-label="Bold">
            <BoldIcon>B</BoldIcon>
          </ToolbarButton>
          <ToolbarButton
            onPress={() => action('onPress')('Italic')}
            aria-label="Italic">
            <ItalicIcon>I</ItalicIcon>
          </ToolbarButton>
        </ToolbarGroup>
      </XStack>
    </ToolbarFrame>
  ),
};
