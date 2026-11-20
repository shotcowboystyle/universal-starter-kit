import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { Paragraph as TamaguiParagraph, YStack } from 'tamagui';

import { Blockquote } from '../components/Blockquote';
import { Heading } from '../components/Heading';
import { HorizontalRule } from '../components/HorizontalRule';
import { InlineCode } from '../components/InlineCode';
import { Strong, Emphasis } from '../components/InlineStyles';
import { Link } from '../components/Link';
import { MarkdownList, MarkdownListItem } from '../components/List';
import { Paragraph } from '../components/Paragraph';
import { HR as Hr } from '../Hr';
import { LI as Li } from '../Li';
import { UL as Ul } from '../Ul';

const meta: Meta = {
  title: 'Markdown/Blocks',
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          'Markdown block renderers: Heading, Paragraph, Blockquote, HorizontalRule/HR, MarkdownList/MarkdownListItem, UL/LI.',
      },
    },
  },
};

export default meta;
type Story = StoryObj;

export const HeadingScale: Story = {
  render: () => (
    <YStack
      maxWidth={700}
      padding="$4">
      <Heading level={1}>Heading level 1</Heading>
      <Heading level={2}>Heading level 2</Heading>
      <Heading level={3}>Heading level 3</Heading>
      <Heading level={4}>Heading level 4</Heading>
      <Heading level={5}>Heading level 5</Heading>
      <Heading level={6}>Heading level 6</Heading>
    </YStack>
  ),
};

export const HeadingEdge: Story = {
  args: { level: 2, children: 'Knob-driven heading' },
  argTypes: {
    level: { control: 'select', options: [1, 2, 3, 4, 5, 6] },
    children: { control: 'text' },
  },
  render: (args: any) => (
    <YStack
      maxWidth={700}
      padding="$4">
      <Heading level={args.level}>{args.children}</Heading>
      <Heading level={2}>{null}</Heading>
      <Heading level={2}>
        A very long duplicate heading that keeps going far beyond a single line to prove wrapping behavior holds for
        headings too
      </Heading>
      <Heading level={2}>
        A very long duplicate heading that keeps going far beyond a single line to prove wrapping behavior holds for
        headings too
      </Heading>
      <Heading level={3}>
        Inline children: <Strong>bold</Strong>, <Emphasis>italic</Emphasis>, <InlineCode>code()</InlineCode> and a{' '}
        <Link href="#top">link</Link>
      </Heading>
      <YStack style={{ direction: 'rtl' } as any}>
        <Heading level={2}>عنوان بالعربية RTL</Heading>
      </YStack>
    </YStack>
  ),
};

export const ParagraphStory: Story = {
  name: 'Paragraph',
  args: { children: 'A knob-driven paragraph body.' },
  argTypes: { children: { control: 'text' } },
  render: (args: any) => (
    <YStack
      maxWidth={700}
      padding="$4">
      <Paragraph>{args.children}</Paragraph>
      <Paragraph>{null}</Paragraph>
      <Paragraph>
        A long paragraph exercising wrapping and selection. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed
        do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud
        exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in
        voluptate velit esse cillum dolore eu fugiat nulla pariatur.
      </Paragraph>
      <Paragraph>
        Inline mix: <InlineCode>code</InlineCode>, <Link href="https://example.com">a link</Link>, and{' '}
        <Emphasis>emphasis</Emphasis> inside one paragraph.
      </Paragraph>
      <YStack style={{ direction: 'rtl' } as any}>
        <Paragraph>نص عربي طويل يلتف من اليمين إلى اليسار ويحافظ على اتجاه القراءة الصحيح في الفقرة.</Paragraph>
      </YStack>
    </YStack>
  ),
};

export const BlockquoteStory: Story = {
  name: 'Blockquote',
  render: () => (
    <YStack
      maxWidth={700}
      padding="$4">
      <Blockquote>
        <Paragraph>A simple quote paragraph.</Paragraph>
      </Blockquote>
      <Blockquote>
        <Paragraph>
          A long quote. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut
          labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.
        </Paragraph>
        <Blockquote>
          <Paragraph>A nested quote inside the first.</Paragraph>
        </Blockquote>
        <MarkdownList ordered={false}>
          <MarkdownListItem index={0}>
            <Paragraph>list inside quote</Paragraph>
          </MarkdownListItem>
        </MarkdownList>
        <Paragraph>
          with <InlineCode>inline code</InlineCode> too
        </Paragraph>
      </Blockquote>
      <Blockquote>{null}</Blockquote>
      <YStack style={{ direction: 'rtl' } as any}>
        <Blockquote>
          <Paragraph>اقتباس RTL — يجب أن يبقى الحد على جهة البداية المنطقية</Paragraph>
        </Blockquote>
      </YStack>
    </YStack>
  ),
};

export const Rules: Story = {
  render: () => (
    <YStack
      maxWidth={700}
      padding="$4">
      <TamaguiParagraph>HorizontalRule (markdown mapped):</TamaguiParagraph>
      <HorizontalRule />
      <TamaguiParagraph>HR (MDX alias):</TamaguiParagraph>
      <Hr />
      <TamaguiParagraph>Narrow container (160px):</TamaguiParagraph>
      <YStack
        width={160}
        borderWidth={1}
        borderColor="$color5">
        <HorizontalRule />
        <Hr />
      </YStack>
    </YStack>
  ),
};

export const Lists: Story = {
  render: () => (
    <YStack
      maxWidth={700}
      padding="$4">
      <TamaguiParagraph fontWeight="400">Unordered</TamaguiParagraph>
      <MarkdownList ordered={false}>
        <MarkdownListItem index={0}>
          <Paragraph>first item</Paragraph>
        </MarkdownListItem>
        <MarkdownListItem index={1}>
          <Paragraph>
            a multiline item long enough to wrap onto a second line so the marker alignment with the first line can be
            verified precisely
          </Paragraph>
        </MarkdownListItem>
        <MarkdownListItem index={2}>
          <Paragraph>nested below:</Paragraph>
          <MarkdownList ordered={false}>
            <MarkdownListItem index={0}>
              <Paragraph>nested child</Paragraph>
              <MarkdownList ordered={false}>
                <MarkdownListItem index={0}>
                  <Paragraph>deep nested child</Paragraph>
                </MarkdownListItem>
              </MarkdownList>
            </MarkdownListItem>
          </MarkdownList>
        </MarkdownListItem>
      </MarkdownList>
      <TamaguiParagraph fontWeight="400">Ordered (start ignored?)</TamaguiParagraph>
      <MarkdownList
        ordered
        start={5}>
        <MarkdownListItem
          ordered
          index={0}>
          <Paragraph>ordered one</Paragraph>
        </MarkdownListItem>
        <MarkdownListItem
          ordered
          index={1}>
          <Paragraph>ordered two</Paragraph>
        </MarkdownListItem>
      </MarkdownList>
      <TamaguiParagraph fontWeight="400">Tasks</TamaguiParagraph>
      <MarkdownList ordered={false}>
        <MarkdownListItem
          checked={true}
          index={0}>
          <Paragraph>checked task</Paragraph>
        </MarkdownListItem>
        <MarkdownListItem
          checked={false}
          index={1}>
          <Paragraph>unchecked task</Paragraph>
        </MarkdownListItem>
      </MarkdownList>
      <TamaguiParagraph fontWeight="400">Empty list</TamaguiParagraph>
      <MarkdownList ordered={false}>{null}</MarkdownList>
      <TamaguiParagraph fontWeight="400">RTL</TamaguiParagraph>
      <YStack style={{ direction: 'rtl' } as any}>
        <MarkdownList ordered={false}>
          <MarkdownListItem index={0}>
            <Paragraph>عنصر قائمة RTL</Paragraph>
          </MarkdownListItem>
        </MarkdownList>
      </YStack>
    </YStack>
  ),
};

export const UlLi: Story = {
  render: () => (
    <YStack
      maxWidth={700}
      padding="$4">
      <Ul>
        <Li>custom LI one</Li>
        <Li>
          a multiline custom LI long enough to wrap so we can confirm the list-item display keeps its disc marker
          aligned with the first line of text
        </Li>
        <Li />
        <Li>
          nested UL below:
          <Ul>
            <Li>nested LI</Li>
            <Ul>
              <Li>deep nested LI</Li>
            </Ul>
          </Ul>
        </Li>
      </Ul>
    </YStack>
  ),
};
