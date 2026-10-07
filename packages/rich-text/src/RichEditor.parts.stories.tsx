import { action } from '@repo/storybook';
/**
 * Storybook stories for the bare RichEditor — the compound component under
 * the RichTextEditor form field.
 *
 * Stories: Main, NoStatusBar, NotResizable, MarkdownCapabilities, ReadOnly,
 * WithError, Compact
 *
 * Forms/RichTextEditor covers the FIELD: label, helper text, validation,
 * form binding. This covers what the field wraps — the frame, the toolbar,
 * the status bar and the resize handle — and the props that only exist at
 * this level (showStatusBar, resizable, capabilities, size, compact). Without
 * it the shell's own knobs are reachable from no story in the catalog.
 */
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';

import { RichEditor } from './RichEditor';
import type { RichEditorCombinedProps } from './RichEditor';

const sampleContent =
  '<h2>The editor shell</h2>' +
  '<p>This is <strong>RichEditor</strong> itself, without the form field around it.</p>' +
  '<ul><li>Toolbar across the top</li><li>Status bar along the bottom</li>' +
  '<li>Resize handle in the corner</li></ul>';

const meta: Meta<RichEditorCombinedProps> = {
  title: 'Forms/RichTextEditor/RichEditor',
  component: RichEditor,
  parameters: {
    layout: 'padded',
  },
  argTypes: {
    size: { control: 'select', options: ['$2', '$3', '$4', '$5'] },
    compact: { control: 'boolean' },
    showToolbar: { control: 'boolean' },
    showBubbleToolbar: { control: 'boolean' },
    showStatusBar: { control: 'boolean' },
    resizable: { control: 'boolean' },
    editable: { control: 'boolean' },
    hasError: { control: 'boolean' },
    capabilities: { control: 'radio', options: ['full', 'markdown'] },
    placeholder: { control: 'text' },
    minHeight: { control: 'number' },
    maxHeight: { control: 'number' },
    sections: { control: false },
    mentions: { control: false },
  },
  args: {
    initialContent: sampleContent,
    placeholder: 'Start typing...',
    minHeight: 200,
    showToolbar: true,
    showStatusBar: true,
    resizable: true,
    editable: true,
    compact: false,
    capabilities: 'full',
    onChange: (html: string) => action('onChange')(html.slice(0, 120)),
  },
};

export default meta;
type Story = StoryObj<RichEditorCombinedProps>;

// ---------------------------------------------------------------------------
// Main (with controls) — frame, toolbar, status bar and resize handle
// ---------------------------------------------------------------------------

export const Main: Story = {};

// ---------------------------------------------------------------------------
// NoStatusBar — the footer is optional, and with it goes the mode toggle
// ---------------------------------------------------------------------------

export const NoStatusBar: Story = {
  name: 'No status bar',
  args: {
    showStatusBar: false,
  },
};

// ---------------------------------------------------------------------------
// NotResizable — a fixed-height editor drops the drag handle
// ---------------------------------------------------------------------------

export const NotResizable: Story = {
  name: 'Not resizable',
  args: {
    resizable: false,
    minHeight: 180,
  },
};

// ---------------------------------------------------------------------------
// MarkdownCapabilities — content is parsed AS markdown and onChange emits
// markdown, and the toolbar drops what GFM cannot express
// ---------------------------------------------------------------------------

export const MarkdownCapabilities: Story = {
  name: 'Markdown capabilities',
  args: {
    capabilities: 'markdown',
    initialContent:
      '## Markdown capabilities\n\nEditing constrained to **GFM**: no underline, colour or alignment.\n\n- [ ] Task lists work\n- Bullet lists too\n\n> Blockquotes round-trip.',
  },
};

// ---------------------------------------------------------------------------
// ReadOnly — editable={false} disables the frame and hides the toolbar
// ---------------------------------------------------------------------------

export const ReadOnly: Story = {
  name: 'Read only',
  args: {
    editable: false,
  },
};

// ---------------------------------------------------------------------------
// WithError — the frame and the toolbar's bottom rule both turn red
// ---------------------------------------------------------------------------

export const WithError: Story = {
  name: 'With error',
  args: {
    hasError: true,
  },
};

// ---------------------------------------------------------------------------
// Compact — tighter sizing, driven from the shell's own knobs
// ---------------------------------------------------------------------------

export const Compact: Story = {
  args: {
    compact: true,
    size: '$2',
    minHeight: 160,
  },
};
