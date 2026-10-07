// Catalog Button (LC-56 story honesty): stories compose catalog controls, never raw tamagui ones.
import { Button } from '@repo/forms';
import { DataTable } from '@repo/table';
import type { DataTableColumn } from '@repo/table';
/**
 * Storybook stories for RichTextEditor
 *
 * Stories: Main, WithInitialContent, WithoutToolbar, BubbleToolbarOnly,
 * MinimalToolbar, ReadOnly, WithError, WithMaxHeight, Interactive,
 * FormIntegrated, Skeleton, InTable
 */
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useForm } from '@tanstack/react-form';
import { useRef, useState } from 'react';
import { Paragraph, Text, View, XStack, YStack } from 'tamagui';

import { RichEditor } from './RichEditor';
import { RichTextEditor } from './RichTextEditor';
import type { RichEditorRef } from './types';

const meta: Meta<typeof RichTextEditor> = {
  title: 'Forms/RichTextEditor',
  component: RichTextEditor,
  parameters: {
    layout: 'padded',
  },
  argTypes: {
    label: { control: 'text' },
    placeholder: { control: 'text' },
    helperText: { control: 'text' },
    error: { control: 'text' },
    required: { control: 'boolean' },
    disabled: { control: 'boolean' },
    readOnly: { control: 'boolean' },
    showToolbar: { control: 'boolean' },
    showBubbleToolbar: { control: 'boolean' },
    compact: { control: 'boolean' },
    skeleton: { control: 'boolean' },
    defaultFullscreen: { control: 'boolean' },
    fullscreen: { control: false },
    onFullscreenChange: { control: false },
    inlineEditing: { control: 'boolean' },
    size: { control: 'select', options: ['$2', '$3', '$4'] },
    minHeight: { control: 'number' },
    maxHeight: { control: 'number' },
    sections: { control: false },
    form: { control: false },
    validators: { control: false },
  },
  decorators: [
    (Story) => (
      <View
        padding="$4"
        maxWidth={800}>
        <Story />
      </View>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof RichTextEditor>;

// ---------------------------------------------------------------------------
// Main (with controls)
// ---------------------------------------------------------------------------

export const Main: Story = {
  args: {
    label: 'Content',
    placeholder: 'Start typing your content...',
    helperText: 'Rich text editor with full formatting support',
    minHeight: 200,
    showToolbar: true,
    showBubbleToolbar: false,
    compact: false,
    skeleton: false,
  },
};

// ---------------------------------------------------------------------------
// WithInitialContent
// ---------------------------------------------------------------------------

export const WithInitialContent: Story = {
  args: {
    label: 'Article Body',
    defaultValue: `
      <h1>Welcome to the Rich Editor</h1>
      <p>This is a <strong>rich text editor</strong> built with <em>Tiptap</em>.</p>
      <h2>Features</h2>
      <ul>
        <li>Bold, italic, underline, strikethrough</li>
        <li>Headings (H1-H6)</li>
        <li>Bullet and numbered lists</li>
        <li>Blockquotes and code blocks</li>
        <li>Links and images</li>
        <li>Text color and highlighting</li>
      </ul>
      <blockquote>
        <p>This is a blockquote with some important information.</p>
      </blockquote>
      <p>Here is some <code>inline code</code> for you.</p>
      <pre><code class="language-javascript">// Greets a user by name
function greet(name, times = 2) {
  const label = "Hello, " + name;
  console.log(label, times, true);
  return null;
}</code></pre>
      <pre><code class="language-diff">@@ -1 +1 @@
- const retries = 1;
+ const retries = 3;</code></pre>
    `,
    minHeight: 300,
  },
};

// ---------------------------------------------------------------------------
// WithoutToolbar
// ---------------------------------------------------------------------------

export const WithoutToolbar: Story = {
  args: {
    label: 'No Toolbar',
    showToolbar: false,
    defaultValue: '<p>Editor without toolbar - keyboard shortcuts still work</p>',
    minHeight: 150,
  },
};

// ---------------------------------------------------------------------------
// BubbleToolbarOnly
// ---------------------------------------------------------------------------

export const BubbleToolbarOnly: Story = {
  args: {
    label: 'Bubble Toolbar Only',
    showToolbar: false,
    showBubbleToolbar: true,
    defaultValue: '<p>Select some text to see the bubble toolbar appear with inline formatting options.</p>',
    minHeight: 150,
    helperText: 'Select text to see the bubble toolbar',
  },
};

// ---------------------------------------------------------------------------
// MinimalToolbar
// ---------------------------------------------------------------------------

export const MinimalToolbar: Story = {
  args: {
    label: 'Minimal Toolbar',
    sections: ['formatting', 'list'],
    defaultValue: '<p>Minimal toolbar with only formatting and list options</p>',
    minHeight: 150,
    helperText: 'Only text formatting and list controls are shown',
  },
};

// ---------------------------------------------------------------------------
// ReadOnly
// ---------------------------------------------------------------------------

export const ReadOnly: Story = {
  args: {
    label: 'Read-only Content',
    readOnly: true,
    defaultValue: `
      <h2>Read-only Content</h2>
      <p>This content cannot be edited. The toolbar is hidden.</p>
      <ul>
        <li>View-only mode for displaying formatted content</li>
        <li>No toolbar or editing capabilities</li>
      </ul>
    `,
    minHeight: 150,
  },
};

// ---------------------------------------------------------------------------
// WithError
// ---------------------------------------------------------------------------

export const WithError: Story = {
  args: {
    label: 'Content',
    error: 'This field is required',
    placeholder: 'This field has an error...',
    required: true,
    minHeight: 150,
  },
};

// ---------------------------------------------------------------------------
// WithMaxHeight
// ---------------------------------------------------------------------------

export const WithMaxHeight: Story = {
  args: {
    label: 'Scrollable Content',
    defaultValue: `
      <h1>Scrollable Content</h1>
      <p>This editor has a maximum height and will scroll when content exceeds it.</p>
      <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>
      <p>Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>
      <p>Ut enim ad minim veniam, quis nostrud exercitation ullamco.</p>
      <p>Duis aute irure dolor in reprehenderit in voluptate velit.</p>
      <p>Excepteur sint occaecat cupidatat non proident.</p>
      <p>Sunt in culpa qui officia deserunt mollit anim id est laborum.</p>
      <p>More content to demonstrate scrolling...</p>
      <p>And even more content...</p>
      <p>Keep scrolling...</p>
    `,
    minHeight: 150,
    maxHeight: 250,
  },
};

// ---------------------------------------------------------------------------
// Interactive
// ---------------------------------------------------------------------------

export const Interactive: Story = {
  render: () => {
    const editorRef = useRef<RichEditorRef>(null);
    const [html, setHtml] = useState('');
    const [charCount, setCharCount] = useState(0);

    const handleChange = (newHtml: string) => {
      setHtml(newHtml);
      const text = newHtml.replaceAll(/<[^>]*>/g, '');
      setCharCount(text.length);
    };

    return (
      <YStack gap="$4">
        <RichEditor
          ref={editorRef}
          placeholder="Type here to see live updates..."
          onChange={handleChange}
          minHeight={200}
          showBubbleToolbar
        />
        <XStack
          gap="$4"
          alignItems="center">
          <Text
            color="$color10"
            fontSize="$2">
            Characters: {charCount}
          </Text>
          <Button
            size="$3"
            onPress={() => {
              const content = editorRef.current?.getHTML();
              console.log('HTML Content:', content);
            }}>
            Log HTML
          </Button>
          <Button
            size="$3"
            onPress={() => {
              editorRef.current?.setHTML('<p>Content set programmatically!</p>');
            }}>
            Set Content
          </Button>
          <Button
            size="$3"
            onPress={() => editorRef.current?.focus()}>
            Focus
          </Button>
        </XStack>
        {html && (
          <YStack
            backgroundColor="$color3"
            padding="$3"
            borderRadius="$3"
            maxHeight={200}
            overflow="scroll">
            <Paragraph
              size="$1"
              fontFamily="$mono"
              whiteSpace="pre-wrap">
              {html}
            </Paragraph>
          </YStack>
        )}
      </YStack>
    );
  },
};

// ---------------------------------------------------------------------------
// FormIntegrated
// ---------------------------------------------------------------------------

export const FormIntegrated: Story = {
  render: () => {
    const FormExample = () => {
      const form = useForm({
        defaultValues: {
          title: '',
          content: '',
        },
        onSubmit: async ({ value }) => {
          console.log('Form submitted:', value);
          alert(JSON.stringify(value, null, 2));
        },
      });

      return (
        <YStack gap="$4">
          <RichTextEditor
            form={form as any}
            name="content"
            label="Article Content"
            helperText="Write your article content here"
            required
            placeholder="Start writing..."
            minHeight={250}
            showBubbleToolbar
          />
          <XStack gap="$2">
            <Button
              size="$3"
              onPress={async () => await form.handleSubmit()}>
              Submit
            </Button>
            <Button
              size="$3"
              theme="gray"
              onPress={() => {
                form.reset();
              }}>
              Reset
            </Button>
          </XStack>
        </YStack>
      );
    };

    return <FormExample />;
  },
};

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

export const Skeleton: Story = {
  args: {
    skeleton: true,
    label: 'Loading Content',
    minHeight: 200,
  },
};

// ---------------------------------------------------------------------------
// Fullscreen
// ---------------------------------------------------------------------------

export const Fullscreen: Story = {
  args: {
    label: 'Fullscreen',
    defaultFullscreen: false,
    defaultValue:
      "<p>Use the expand button at the toolbar's right end to fill the viewport. Press Escape (or the button again) to exit.</p>",
    minHeight: 200,
    helperText: 'Toggle fullscreen from the toolbar; Escape exits',
  },
};

// ---------------------------------------------------------------------------
// InlineEmbedded (native escape hatch; web renders the normal inline editor)
// ---------------------------------------------------------------------------

export const InlineEmbedded: Story = {
  args: {
    label: 'Inline (embedded)',
    inlineEditing: true,
    defaultValue: '<p>Native: edits inline without the fullscreen modal (escape hatch).</p>',
    minHeight: 160,
    helperText: 'inlineEditing keeps the old embedded editor on native',
  },
};

// ---------------------------------------------------------------------------
// WithMentions (@ suggestion popup wired to a demo directory)
// ---------------------------------------------------------------------------

const MENTION_DIRECTORY = [
  { id: 'ada', display: 'Ada Lovelace', description: 'Analyst' },
  { id: 'alan', display: 'Alan Turing', description: 'Computer science' },
  { id: 'grace', display: 'Grace Hopper', description: 'Compilers' },
  { id: 'linus', display: 'Linus Torvalds', description: 'Kernels' },
  { id: 'margaret', display: 'Margaret Hamilton', description: 'Flight software' },
];

export const WithMentions: Story = {
  args: {
    label: 'With Mentions',
    placeholder: 'Type @ to mention someone...',
    minHeight: 200,
    helperText: 'The @ popup shares the slash-menu chrome (LC-16)',
    mentions: {
      items: (query: string) =>
        MENTION_DIRECTORY.filter((item) => item.display.toLowerCase().includes(query.toLowerCase())),
    },
  },
};

// ---------------------------------------------------------------------------
// WithEmoji (`:` shortname autocomplete — lazy dataset)
// ---------------------------------------------------------------------------

export const WithEmoji: Story = {
  args: {
    label: 'Emoji Autocomplete',
    placeholder: 'Type : followed by a name, e.g. :tada',
    minHeight: 160,
    helperText:
      'The : popup shares the slash/mention chrome (LC-16); the dataset lazy-loads on first trigger and inserts plain unicode',
  },
};

// ---------------------------------------------------------------------------
// WithMermaid (fenced diagram code with live preview)
// ---------------------------------------------------------------------------

export const WithMermaid: Story = {
  args: {
    label: 'Mermaid Diagram',
    showBubbleToolbar: true,
    minHeight: 320,
    helperText:
      'The diagram engine lazy-loads on the first mermaid block; edits re-render debounced; invalid syntax shows the parse error',
    defaultValue:
      '<p>Flow below — edit the code to see the live preview update.</p>' +
      '<pre><code class="language-mermaid">graph TD\n  A[Draft] --> B{Review}\n  B -->|approve| C[Merge]\n  B -->|reject| A</code></pre>',
  },
};

// ---------------------------------------------------------------------------
// WithMath (inline $...$ + $$ block via lazy KaTeX, incl. error state)
// ---------------------------------------------------------------------------

export const WithMath: Story = {
  // KaTeX is fetched on the first math node, so the typeset formulae can land
  // after lost-pixel's 1s default settle and race the capture. Waited per story
  // rather than globally: the other 1477 shots should not pay for this one.
  parameters: { lostpixel: { waitBeforeScreenshot: 4000 } },
  args: {
    label: 'Math (KaTeX)',
    showBubbleToolbar: true,
    minHeight: 320,
    helperText:
      'KaTeX lazy-loads on the first math node; select an inline formula to edit it; bad TeX shows the parse error',
    defaultValue:
      '<p>Inline: <span data-type="inline-math" data-latex="E=mc^2">E=mc^2</span> flows with text.</p>' +
      '<pre><code class="language-math">\\sum_{i=0}^{n} i = \\frac{n(n+1)}{2}</code></pre>' +
      '<p>Error state: <span data-type="inline-math" data-latex="\\nope{">\\nope{</span> keeps the source visible.</p>',
  },
};

// ---------------------------------------------------------------------------
// WithDetails (collapsible <details> sections)
// ---------------------------------------------------------------------------

export const WithDetails: Story = {
  args: {
    label: 'Collapsible Section',
    minHeight: 240,
    helperText: 'GitLab-style <details>: toggle collapses content; markdown keeps it as raw HTML (lossless)',
    defaultValue:
      '<details open><summary>Deployment checklist</summary>' +
      '<div data-type="detailsContent"><ul><li><p>Run the migration</p></li>' +
      '<li><p>Flip the feature flag</p></li></ul></div></details>' +
      '<p>Content after the section.</p>',
  },
};

// ---------------------------------------------------------------------------
// MarkdownMode (capabilities="markdown" — GFM-expressible surface only)
// ---------------------------------------------------------------------------

export const MarkdownMode: Story = {
  render: () => {
    const [markdown, setMarkdown] = useState(
      '# Markdown mode\n\nWYSIWYG editing constrained to **GFM**: no highlight, underline, color, or alignment.\n\n- [ ] Task lists work\n- Bullet lists too\n\n> Blockquotes and `inline code` round-trip.',
    );

    return (
      <YStack gap="$4">
        <RichEditor
          capabilities="markdown"
          initialContent={markdown}
          onChange={(md) => {
            setMarkdown(md);
          }}
          minHeight={240}
          showBubbleToolbar
        />
        <YStack
          backgroundColor="$color3"
          padding="$3"
          borderRadius="$3"
          maxHeight={200}>
          <Text
            color="$color11"
            fontSize="$2">
            Serialized markdown (onChange):
          </Text>
          <Paragraph
            size="$1"
            fontFamily="$mono"
            whiteSpace="pre-wrap">
            {markdown}
          </Paragraph>
        </YStack>
      </YStack>
    );
  },
};

// ---------------------------------------------------------------------------
// WithUploadHooks (prop-driven image/file upload)
// ---------------------------------------------------------------------------

export const WithUploadHooks: Story = {
  args: {
    label: 'With Upload Hooks',
    placeholder: 'Paste or drop an image or file...',
    minHeight: 200,
    helperText: 'onImageUpload / onFileUpload resolve fake URLs after a short delay',
    onImageUpload: async (file: File) =>
      await new Promise<string>((resolve) =>
        setTimeout(() => {
          resolve(`https://example.com/uploads/${encodeURIComponent(file.name)}`);
        }, 150),
      ),
    onFileUpload: async (file: File) =>
      await new Promise<{ url: string; name?: string }>((resolve) =>
        setTimeout(() => {
          resolve({
            url: `https://example.com/files/${encodeURIComponent(file.name)}`,
            name: file.name,
          });
        }, 150),
      ),
  },
};

// ---------------------------------------------------------------------------
// InTable (colocated DataTable cell — SB-KS-02 sized parent, no pagination)
// ---------------------------------------------------------------------------

interface InTableRow {
  id: string;
  label: string;
  value: string;
}

export const InTable: Story = {
  name: 'In table',
  render: () => {
    const [data, setData] = useState<InTableRow[]>([
      { id: '1', label: 'Alpha', value: '<p>Hello <strong>world</strong></p>' },
      { id: '2', label: 'Beta', value: '' },
      {
        id: '3',
        label: 'Gamma',
        value: '<ul><li>Draft</li><li>Review</li><li>Ship</li></ul>',
      },
    ]);
    const columns: DataTableColumn<InTableRow>[] = [
      { accessorKey: 'label', header: 'Row' },
      {
        accessorKey: 'value',
        header: 'Rich text',
        field: 'richtexteditor',
      },
    ];
    return (
      <YStack
        width="100%"
        height={360}>
        <DataTable
          data={data}
          columns={columns}
          enablePagination={false}
          onDataChange={setData}
        />
      </YStack>
    );
  },
};
