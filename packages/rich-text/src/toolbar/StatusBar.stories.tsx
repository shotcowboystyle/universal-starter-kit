import { action } from '@repo/storybook';
/**
 * Storybook stories for StatusBar — the editor footer: the rich-text /
 * markdown mode toggle on the left, word and character counts on the right.
 *
 * Stories: Main, SingularCounts, MarkdownMode, Empty, InFrame
 *
 * The footer is a pure function of `state` and `mode`, so the controls drive
 * the two counts and the active mode directly; pressing a mode label reports
 * through `onModeChange` (actions panel) and flips the local mode so the
 * marking swaps the way it does inside RichEditor.
 */
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useEffect, useState } from 'react';
import { Paragraph, View, YStack } from 'tamagui';

import { RichEditorContext } from '../context';
import { EditorFrame } from '../styled';
import { defaultEditorState } from '../types';
import type { EditorMode, EditorState } from '../types';

import { StatusBar } from './StatusBar';

export interface StatusBarStoryArgs {
  /** Word count shown on the right */
  wordCount: number;
  /** Character count shown on the right */
  characterCount: number;
  /** Which mode label is marked active */
  mode: EditorMode;
}

function stateFor(args: StatusBarStoryArgs): EditorState {
  return {
    ...defaultEditorState,
    wordCount: args.wordCount,
    characterCount: args.characterCount,
  };
}

/** Mode is local so the toggle is live; the `mode` control seeds and resets it. */
function StatusBarSpecimen(args: StatusBarStoryArgs) {
  const [mode, setMode] = useState<EditorMode>(args.mode);
  useEffect(() => {
    setMode(args.mode);
  }, [args.mode]);
  return (
    <StatusBar
      state={stateFor(args)}
      mode={mode}
      onModeChange={(next) => {
        action('onModeChange')(next);
        setMode(next);
      }}
    />
  );
}

const meta: Meta<StatusBarStoryArgs> = {
  title: 'Forms/RichTextEditor/StatusBar',
  component: StatusBar as never,
  parameters: {
    layout: 'padded',
  },
  argTypes: {
    wordCount: { control: { type: 'number', min: 0 } },
    characterCount: { control: { type: 'number', min: 0 } },
    mode: { control: 'radio', options: ['richtext', 'markdown'] },
  },
  args: {
    wordCount: 42,
    characterCount: 240,
    mode: 'richtext',
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
    <View
      maxWidth={520}
      borderWidth={1}
      borderColor="$color6"
      borderRadius="$3">
      <StatusBarSpecimen {...args} />
    </View>
  ),
};

export default meta;
type Story = StoryObj<StatusBarStoryArgs>;

// ---------------------------------------------------------------------------
// Main (with controls)
// ---------------------------------------------------------------------------

export const Main: Story = {};

// ---------------------------------------------------------------------------
// SingularCounts — the plural forms flip exactly at one
// ---------------------------------------------------------------------------

export const SingularCounts: Story = {
  args: {
    wordCount: 1,
    characterCount: 1,
  },
};

// ---------------------------------------------------------------------------
// MarkdownMode — the raw-source toggle is the marked one
// ---------------------------------------------------------------------------

export const MarkdownMode: Story = {
  args: {
    mode: 'markdown',
  },
};

// ---------------------------------------------------------------------------
// Empty — a fresh document pluralises at zero
// ---------------------------------------------------------------------------

export const Empty: Story = {
  args: {
    wordCount: 0,
    characterCount: 0,
  },
};

// ---------------------------------------------------------------------------
// InFrame — where it sits: the foot of an EditorFrame, under the content
// ---------------------------------------------------------------------------

export const InFrame: Story = {
  name: 'In frame',
  args: {
    wordCount: 12,
    characterCount: 71,
  },
  render: (args) => (
    <EditorFrame
      maxWidth={520}
      borderRadius="$3">
      <YStack
        minHeight={120}
        padding="$3">
        <Paragraph
          size="$3"
          color="$color11">
          Twelve words of body copy stand in for the editor content here.
        </Paragraph>
      </YStack>
      <StatusBarSpecimen {...args} />
    </EditorFrame>
  ),
};
