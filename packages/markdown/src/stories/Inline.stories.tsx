import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { Text, YStack } from 'tamagui';

import { Break } from '../components/Break';
import { InlineCode } from '../components/InlineCode';
import { Strong, Emphasis, Strikethrough } from '../components/InlineStyles';
import { Link } from '../components/Link';
// Inline runs inherit prose type from the mapped Paragraph (T-VALUE), so the
// stories host them in the markdown Paragraph, not the raw tamagui primitive.
import { Paragraph } from '../components/Paragraph';
import { ExternalIcon } from '../ExternalIcon';

const EMPTY_CODE = '';
const BIDI_CODE = "const שלום = 'עולם'";

const meta: Meta = {
  title: 'Markdown/Inline',
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component: 'Markdown inline renderers: Strong, Emphasis, Strikethrough, InlineCode, Link, ExternalIcon, Break.',
      },
    },
  },
};

export default meta;
type Story = StoryObj;

export const InlineBaseline: Story = {
  render: () => (
    <YStack
      maxWidth={700}
      padding="$4"
      gap="$2">
      <Paragraph>
        Plain text with <Strong>bold</Strong>, <Emphasis>italic</Emphasis>, and <Strikethrough>struck</Strikethrough>{' '}
        inline runs.
      </Paragraph>
      <Paragraph>
        Nested:{' '}
        <Strong>
          bold with <Emphasis>italic inside</Emphasis> and <Strikethrough>strike inside</Strikethrough>
        </Strong>
        .
      </Paragraph>
      <Paragraph>
        Mixed scripts: <Strong>मोटा 太字 عريض</Strong> and <Emphasis>तिरछा 斜体 مائل</Emphasis> and{' '}
        <Strikethrough>हटाया 删除 محذوف</Strikethrough>.
      </Paragraph>
      <Paragraph>
        Empty runs render nothing: [<Strong>{null}</Strong>
        ][
        <Emphasis>{null}</Emphasis>
        ][
        <Strikethrough>{null}</Strikethrough>]
      </Paragraph>
    </YStack>
  ),
};

export const StrikethroughLinked: Story = {
  render: () => (
    <YStack
      maxWidth={700}
      padding="$4">
      <Paragraph>
        A struck link:{' '}
        <Strikethrough>
          <Link href="https://example.com">deprecated docs page</Link>
        </Strikethrough>{' '}
        keeps both decorations.
      </Paragraph>
    </YStack>
  ),
};

export const InlineCodeStory: Story = {
  name: 'InlineCode',
  args: { children: 'const x = useResolvedKnobs()' },
  argTypes: { children: { control: 'text' } },
  render: (args: any) => (
    <YStack
      maxWidth={700}
      padding="$4"
      gap="$2">
      <Paragraph>
        Inline <InlineCode>{args.children}</InlineCode> in a sentence.
      </Paragraph>
      <Paragraph>
        Long code wraps:{' '}
        <InlineCode>
          veryLongIdentifierName.chained.property.access.that.keeps.going.and.going.until.it.must.wrap(argumentOne,
          argumentTwo)
        </InlineCode>{' '}
        without a baseline jump.
      </Paragraph>
      <Paragraph>
        Bidi code: <InlineCode>{BIDI_CODE}</InlineCode> and empty: <InlineCode>{EMPTY_CODE}</InlineCode>.
      </Paragraph>
    </YStack>
  ),
};

export const LinkVariants: Story = {
  args: { href: 'https://example.com', children: 'external link' },
  argTypes: {
    href: { control: 'text' },
    children: { control: 'text' },
  },
  render: (args: any) => (
    <YStack
      maxWidth={700}
      padding="$4"
      gap="$2">
      <Paragraph>
        Knob-driven: <Link href={args.href}>{args.children}</Link>
      </Paragraph>
      <Paragraph>
        Internal <Link href="/docs/intro">/docs/intro</Link> · hash <Link href="#section">#section</Link> · mailto{' '}
        <Link href="mailto:test@example.com">mail me</Link> · tel <Link href="tel:+15125551234">call</Link>
      </Paragraph>
      <Paragraph>
        Unsafe URL policy:{' '}
        {/* oxlint-disable-next-line eslint/no-script-url -- demonstrates the unsafe-URL policy; the Link must refuse it */}
        <Link href="javascript:alert(1)">javascript: link</Link>
      </Paragraph>
      <Paragraph>
        Empty label link: [<Link href="https://example.com">{null}</Link>] and long label:{' '}
        <Link href="https://example.com/very/long/path">
          a very long link label that should wrap across multiple lines while staying underlined and keeping its pointer
          affordance the whole way through the wrap
        </Link>
      </Paragraph>
    </YStack>
  ),
};

export const ExternalIconStory: Story = {
  name: 'ExternalIcon',
  render: () => (
    <YStack
      maxWidth={300}
      padding="$4"
      gap="$2">
      <Paragraph>
        Bare icon: <ExternalIcon />
      </Paragraph>
      <Paragraph>
        A wrapped external link label that runs long enough to break onto a second line{' '}
        <Text
          display="inline-flex"
          y={2}>
          <ExternalIcon />
        </Text>
      </Paragraph>
    </YStack>
  ),
};

export const BreakStory: Story = {
  name: 'Break',
  render: () => (
    <YStack
      maxWidth={700}
      padding="$4">
      <Paragraph>
        line one
        <Break />
        line two after a single break
        <Break />
        <Break />
        line three after consecutive breaks
        <Break />
      </Paragraph>
      <Paragraph>
        <Break />
        leading break above this line
      </Paragraph>
    </YStack>
  ),
};
