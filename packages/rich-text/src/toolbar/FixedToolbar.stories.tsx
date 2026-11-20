import { action } from '@repo/storybook';
/**
 * Storybook stories for FixedToolbar — the bar across the top of the editor,
 * the thing the whole toolbar/ folder assembles into.
 *
 * Stories: Main, Sections, MarkdownCapabilities, ErrorState, FullscreenToggle,
 * LiveEditor
 *
 * The toolbar owns no editor state: it renders `state` and calls commands
 * through `editorRef`. So every story but the last drives it from a plain
 * state object and reports the commands into the actions panel, which is the
 * only way to see the command wiring without a document to run it against.
 * LiveEditor is the exception — a real editor behind a standalone bar, which
 * is what the compound `RichEditor.Editor` export exists for.
 */
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useRef, useState } from 'react';
import { Paragraph, YStack } from 'tamagui';

import { RichEditorContext } from '../context';
import { RichEditor } from '../RichEditor';
import { EditorFrame } from '../styled';
import { defaultEditorState } from '../types';
import type { EditorCapabilities, EditorState, RichEditorRef, ToolbarSection } from '../types';

import { FixedToolbar } from './FixedToolbar';

export interface FixedToolbarStoryArgs {
  /** Bold is on in the current selection */
  isBold: boolean;
  /** Italic is on in the current selection */
  isItalic: boolean;
  /** There is history to undo (an empty history washes the Undo button) */
  canUndo: boolean;
  /** There is history to redo */
  canRedo: boolean;
  /** Which sections show; undefined shows every one */
  sections?: ToolbarSection[];
  /** markdown drops the controls GFM cannot express */
  capabilities: EditorCapabilities;
  /** Paints the bar's bottom rule red, matching the frame */
  hasError: boolean;
}

const stateFor = (args: FixedToolbarStoryArgs): EditorState => ({
  ...defaultEditorState,
  isBold: args.isBold,
  isItalic: args.isItalic,
  canUndo: args.canUndo,
  canRedo: args.canRedo,
});

/**
 * A toolbar with no editor under it. `editorRef` stays null, so commands are
 * reported to the actions panel instead of running — which is the point:
 * the bar's job is to name the command, not to perform it.
 */
const ToolbarSpecimen = (args: FixedToolbarStoryArgs) => {
  const editorRef = useRef<RichEditorRef>({
    executeCommand: (command, payload) => action('executeCommand')(command, payload),
    getState: () => stateFor(args),
    getHTML: () => '',
    getJSON: () => null,
    getMarkdown: () => '',
    setHTML: action('setHTML'),
    setJSON: action('setJSON'),
    setMarkdown: action('setMarkdown'),
    focus: action('focus'),
    blur: action('blur'),
  });
  return (
    <EditorFrame
      maxWidth={720}
      borderRadius="$3"
      hasError={args.hasError}>
      <FixedToolbar
        editorRef={editorRef}
        state={stateFor(args)}
        sections={args.sections}
        capabilities={args.capabilities}
        hasError={args.hasError}
      />
      <YStack
        minHeight={100}
        padding="$3">
        <Paragraph
          size="$3"
          color="$color11">
          The bar above drives this space. Commands land in the Actions panel.
        </Paragraph>
      </YStack>
    </EditorFrame>
  );
};

const meta: Meta<FixedToolbarStoryArgs> = {
  title: 'Forms/RichTextEditor/FixedToolbar',
  component: FixedToolbar as never,
  parameters: {
    layout: 'padded',
  },
  argTypes: {
    isBold: { control: 'boolean' },
    isItalic: { control: 'boolean' },
    canUndo: { control: 'boolean' },
    canRedo: { control: 'boolean' },
    capabilities: { control: 'radio', options: ['full', 'markdown'] },
    hasError: { control: 'boolean' },
    sections: { control: false },
  },
  args: {
    isBold: false,
    isItalic: false,
    canUndo: true,
    canRedo: false,
    capabilities: 'full',
    hasError: false,
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
  render: (args) => <ToolbarSpecimen {...args} />,
};

export default meta;
type Story = StoryObj<FixedToolbarStoryArgs>;

// ---------------------------------------------------------------------------
// Main (with controls) — every section, bold off, redo unavailable
// ---------------------------------------------------------------------------

export const Main: Story = {};

// ---------------------------------------------------------------------------
// Sections — the `sections` prop trims the bar to the listed groups
// ---------------------------------------------------------------------------

export const Sections: Story = {
  args: {
    sections: ['formatting', 'link'],
    isBold: true,
  },
};

// ---------------------------------------------------------------------------
// MarkdownCapabilities — GFM cannot express color or underline, so those
// controls are absent, not merely disabled
// ---------------------------------------------------------------------------

export const MarkdownCapabilities: Story = {
  name: 'Markdown capabilities',
  args: {
    capabilities: 'markdown',
  },
};

// ---------------------------------------------------------------------------
// ErrorState — the bar's bottom rule turns red with the frame
// ---------------------------------------------------------------------------

export const ErrorState: Story = {
  name: 'Error state',
  args: {
    hasError: true,
  },
};

// ---------------------------------------------------------------------------
// FullscreenToggle — onFullscreenToggle adds the expand control at the right
// end, outside the scrolling strip so it never scrolls away
// ---------------------------------------------------------------------------

export const FullscreenToggle: Story = {
  name: 'Fullscreen toggle',
  render: (args) => {
    const FullscreenSpecimen = () => {
      const [fullscreen, setFullscreen] = useState(false);
      const editorRef = useRef<RichEditorRef>(null);
      return (
        <EditorFrame
          maxWidth={720}
          borderRadius="$3">
          <FixedToolbar
            editorRef={editorRef}
            state={stateFor(args)}
            fullscreen={fullscreen}
            onFullscreenToggle={() => {
              action('onFullscreenToggle')(!fullscreen);
              setFullscreen(!fullscreen);
            }}
          />
          <YStack
            minHeight={100}
            padding="$3">
            <Paragraph
              size="$3"
              color="$color11">
              {fullscreen ? 'Fullscreen: on' : 'Fullscreen: off'}
            </Paragraph>
          </YStack>
        </EditorFrame>
      );
    };
    return <FullscreenSpecimen />;
  },
};

// ---------------------------------------------------------------------------
// LiveEditor — a standalone bar wired to a real editor through the compound
// `RichEditor.Editor` export; typing updates the marks
// ---------------------------------------------------------------------------

/** A bar and an editor wired through one ref, as an app would mount them. */
const LiveSpecimen = () => {
  const editorRef = useRef<RichEditorRef>(null);
  const [state, setState] = useState<EditorState>(defaultEditorState);
  return (
    <EditorFrame
      maxWidth={720}
      borderRadius="$3">
      <FixedToolbar
        editorRef={editorRef}
        state={state}
      />
      <RichEditor.Editor
        ref={editorRef}
        initialContent="<p>Select this text and press <strong>B</strong> in the bar above — the button marks itself from the editor's own state.</p>"
        onStateChange={setState}
        minHeight={160}
      />
    </EditorFrame>
  );
};

export const LiveEditor: Story = {
  name: 'Live editor',
  render: () => <LiveSpecimen />,
};
