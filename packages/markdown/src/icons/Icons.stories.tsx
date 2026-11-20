/**
 * Markdown icons — the four hand-drawn SVGs the package ships and exports
 * from its barrel: the copy affordance on MDXCodeBlock (Clipboard → Check),
 * CheckCircle, and the heading anchor's Link.
 *
 * They are raw @tamagui/react-native-svg paths, not catalog icons, so they
 * cannot consume `$colorN` token strings in a stroke attribute. useIconColor
 * resolves the token to a concrete value first (SB-M-1206); pass a raw token
 * and it still paints, which is what the ThemeTokens story shows.
 */

import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { Paragraph, XStack, YStack } from 'tamagui';

import { CheckCircleIcon, CheckIcon, ClipboardIcon, LinkIcon } from './index';

const meta: Meta = {
  title: 'Markdown/Icons',
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          'ClipboardIcon, CheckIcon, CheckCircleIcon and LinkIcon. Size is a number in px (Clipboard/Check/CheckCircle default 16, Link defaults 12); color takes a concrete CSS color or a $theme token, which useIconColor resolves before it reaches the SVG stroke.',
      },
    },
  },
};

export default meta;
type Story = StoryObj;

const icons = [
  { name: 'ClipboardIcon', Icon: ClipboardIcon },
  { name: 'CheckIcon', Icon: CheckIcon },
  { name: 'CheckCircleIcon', Icon: CheckCircleIcon },
  { name: 'LinkIcon', Icon: LinkIcon },
] as const;

export const Main: Story = {
  args: { size: 24, color: '$color12' },
  argTypes: {
    size: { control: { type: 'range', min: 8, max: 64, step: 2 } },
    color: {
      control: 'select',
      options: ['$color12', '$color10', '$blue10', '$green10', '$red10', '#ff8800'],
    },
  },
  render: (args: any) => (
    <XStack
      gap="$6"
      padding="$4"
      alignItems="flex-start">
      {icons.map(({ name, Icon }) => (
        <YStack
          key={name}
          gap="$2"
          alignItems="center">
          <Icon
            size={args.size}
            color={args.color}
          />
          <Paragraph
            size="$1"
            color="$color10">
            {name}
          </Paragraph>
        </YStack>
      ))}
    </XStack>
  ),
};

/** The size ladder each icon is actually used at, plus the extremes. */
export const SizeLadder: Story = {
  render: () => (
    <YStack
      gap="$4"
      padding="$4">
      {icons.map(({ name, Icon }) => (
        <XStack
          key={name}
          gap="$4"
          alignItems="center">
          <Paragraph
            size="$2"
            width={140}>
            {name}
          </Paragraph>
          {[8, 12, 16, 24, 48].map((size) => (
            <Icon
              key={`${name}-${size}`}
              size={size}
            />
          ))}
        </XStack>
      ))}
    </YStack>
  ),
};

/**
 * SB-M-1206: a `$colorN` string cannot go straight into a stroke attribute.
 * Every icon here is given a raw token, so a regression in useIconColor shows
 * up as invisible strokes rather than a subtle mis-tint.
 */
export const ThemeTokens: Story = {
  render: () => (
    <YStack
      gap="$4"
      padding="$4">
      {['$color12', '$color10', '$blue10', '$green10', '$red10'].map((token) => (
        <XStack
          key={token}
          gap="$4"
          alignItems="center">
          <Paragraph
            size="$2"
            width={100}
            color="$color10">
            {token}
          </Paragraph>
          {icons.map(({ name, Icon }) => (
            <Icon
              key={`${token}-${name}`}
              size={24}
              color={token}
            />
          ))}
        </XStack>
      ))}
    </YStack>
  ),
};

/**
 * In situ: Clipboard and Check are the two faces of the copy button on
 * MDXCodeBlock, and Link is the anchor that appears beside a heading.
 */
export const InSitu: Story = {
  render: () => (
    <YStack
      gap="$4"
      padding="$4"
      maxWidth={520}>
      <XStack
        gap="$3"
        alignItems="center">
        <ClipboardIcon
          size={16}
          color="$color11"
        />
        <Paragraph size="$3">Copy — idle</Paragraph>
      </XStack>
      <XStack
        gap="$3"
        alignItems="center">
        <CheckIcon
          size={16}
          color="$green10"
        />
        <Paragraph size="$3">Copy — copied</Paragraph>
      </XStack>
      <XStack
        gap="$3"
        alignItems="center">
        <CheckCircleIcon
          size={16}
          color="$green10"
        />
        <Paragraph size="$3">A completed item</Paragraph>
      </XStack>
      <XStack
        gap="$2"
        alignItems="center">
        <Paragraph
          size="$6"
          fontWeight="700">
          A heading
        </Paragraph>
        <LinkIcon
          size={12}
          color="$color10"
        />
      </XStack>
    </YStack>
  ),
};

/** A custom strokeWidth is CheckIcon's only extra knob. */
export const CheckStrokeWidth: Story = {
  render: () => (
    <XStack
      gap="$5"
      padding="$4"
      alignItems="center">
      {[1, 1.5, 2.5, 4].map((strokeWidth) => (
        <YStack
          key={strokeWidth}
          gap="$2"
          alignItems="center">
          <CheckIcon
            size={32}
            strokeWidth={strokeWidth}
          />
          <Paragraph
            size="$1"
            color="$color10">
            {String(strokeWidth)}
          </Paragraph>
        </YStack>
      ))}
    </XStack>
  ),
};
