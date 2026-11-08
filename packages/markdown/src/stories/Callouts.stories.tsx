import { Button } from '@repo/ui';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { Paragraph, YStack } from 'tamagui';

import { MDXAside, MDXNote } from '../Aside';
import { Notice } from '../Notice';

const meta: Meta = {
  title: 'Markdown/Callouts',
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component: 'MDX callouts: MDXAside (cutoff + Show more), MDXNote, Notice (semantic themes).',
      },
    },
  },
};

export default meta;
type Story = StoryObj;

export const AsideString: Story = {
  render: () => (
    <YStack
      maxWidth={700}
      padding="$4">
      <MDXAside>A short string aside renders without the cutoff frame.</MDXAside>
    </YStack>
  ),
};

export const AsideCutoff: Story = {
  render: () => (
    <YStack
      maxWidth={700}
      padding="$4">
      <MDXAside>
        <YStack>
          {Array.from({ length: 20 }, (_, i) => (
            <Paragraph key={i}>
              Aside body line {i + 1}: long enough content to exceed the 300px max height so the gradient cutoff and
              Show more button appear.
            </Paragraph>
          ))}
        </YStack>
      </MDXAside>
    </YStack>
  ),
};

export const AsideEdge: Story = {
  render: () => (
    <YStack
      maxWidth={700}
      padding="$4">
      <MDXAside>
        <Paragraph>Short element child (still gets cutoff frame per implementation).</Paragraph>
      </MDXAside>
      <MDXAside>{null}</MDXAside>
    </YStack>
  ),
};

export const NoteStory: Story = {
  name: 'MDXNote',
  args: { children: 'A knob-driven note body.' },
  argTypes: { children: { control: 'text' } },
  render: (args: any) => (
    <YStack
      maxWidth={700}
      padding="$4">
      <MDXNote>{args.children}</MDXNote>
      <MDXNote>
        <Paragraph>
          Nested content note with a long body. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod
          tempor incididunt ut labore et dolore magna aliqua.
        </Paragraph>
        <Button
          size="$2"
          alignSelf="flex-start">
          interactive child
        </Button>
      </MDXNote>
      <MDXNote>{null}</MDXNote>
      <YStack width={220}>
        <MDXNote>Narrow width note that must wrap cleanly.</MDXNote>
      </YStack>
    </YStack>
  ),
};

export const NoticeStory: Story = {
  name: 'Notice',
  args: { theme: 'yellow', title: 'Heads up', children: 'A knob-driven notice body.' },
  argTypes: {
    theme: { control: 'select', options: ['yellow', 'blue', 'green', 'red'] },
    title: { control: 'text' },
    children: { control: 'text' },
  },
  render: (args: any) => (
    <YStack
      maxWidth={700}
      padding="$4">
      <Notice
        theme={args.theme}
        title={args.title}>
        {args.children}
      </Notice>
    </YStack>
  ),
};

export const NoticeVariants: Story = {
  render: () => (
    <YStack
      maxWidth={700}
      padding="$4">
      <Notice
        theme="yellow"
        title="Warning">
        Yellow warning notice.
      </Notice>
      <Notice
        theme="blue"
        title="Info">
        Blue info notice.
      </Notice>
      <Notice
        theme="green"
        title="Success">
        Green success notice.
      </Notice>
      <Notice
        theme="red"
        title="Error">
        Red error notice.
      </Notice>
    </YStack>
  ),
};

export const NoticeEdge: Story = {
  render: () => (
    <YStack
      maxWidth={700}
      padding="$4">
      <Notice>{null}</Notice>
      <Notice theme="blue">
        A long notice body without a title. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod
        tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco
        laboris nisi ut aliquip ex ea commodo consequat.
      </Notice>
      <Notice
        theme="green"
        disableUnwrap>
        <YStack gap="$2">
          <Paragraph>Interactive children:</Paragraph>
          <Button
            size="$2"
            alignSelf="flex-start">
            press me
          </Button>
        </YStack>
      </Notice>
      <YStack style={{ direction: 'rtl' } as any}>
        <Notice
          theme="red"
          title="خطأ">
          إشعار خطأ بالعربية للتحقق من الاتجاه
        </Notice>
      </YStack>
      <Notice
        theme="yellow"
        title="Outer">
        <Notice
          theme="blue"
          title="Nested">
          nested notice
        </Notice>
      </Notice>
    </YStack>
  ),
};
