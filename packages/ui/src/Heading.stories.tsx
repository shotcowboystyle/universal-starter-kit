import { Preset } from '@repo/theme';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { YStack } from 'tamagui';

import { H1, H2, H3, Heading } from './Heading';
import { Text } from './Text';

const meta: Meta<typeof Heading> = {
  title: 'Components/Heading',
  component: Heading,
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          'House headings (MPO-20). Heading/H1/H2 spread knobProps.heading as props — headingFont and fontWeight restyle those on every platform — and H1 additionally rides knobProps.pageTitle, the D-11 page-title dial (moderate 32px default, display 64px hero opt-in). H3–H6 are subordinate: mono at weight 400, knobs do not restyle them. Flip the toolbar knobs to see.',
      },
    },
  },
  argTypes: {
    children: { control: 'text' },
  },
};
export default meta;

type Story = StoryObj<typeof Heading>;

export const Default: Story = {
  name: 'Main',
  args: {
    children: 'Heading follows the headingFont and fontWeight knobs',
  },
};

export const TitleLadder: Story = {
  render: () => (
    <YStack gap="$3" maxWidth={640}>
      <H1>H1 page title — rides the pageTitleScale dial</H1>
      <H2>H2 display heading — headingFont / fontWeight</H2>
      <H3>H3 subordinate — mono 400</H3>
      <Text>Body text for scale comparison.</Text>
    </YStack>
  ),
};

export const PageTitleScaleFlip: Story = {
  name: 'pageTitleScale flip (moderate vs display)',
  render: () => (
    <YStack gap="$4" maxWidth={760}>
      <Preset overrides={{ pageTitleScale: 'moderate' }}>
        <H1>moderate — the product default (32px class)</H1>
      </Preset>
      <Preset overrides={{ pageTitleScale: 'display' }}>
        <H1>display — the hero opt-in (64px class)</H1>
      </Preset>
    </YStack>
  ),
};

export const FontWeightFlip: Story = {
  name: 'fontWeight flip (regular vs bold)',
  render: () => (
    <YStack gap="$3" maxWidth={640}>
      <Preset overrides={{ fontWeight: 'regular' }}>
        <Heading>regular — 400</Heading>
      </Preset>
      <Preset overrides={{ fontWeight: 'bold' }}>
        <Heading>bold — 700</Heading>
      </Preset>
    </YStack>
  ),
};

export const SizedHeadings: Story = {
  name: 'Sized headings',
  render: () => (
    <YStack gap="$3" maxWidth={640}>
      <H2 size="$6">H2 at $6: weight follows fontWeight in every headingFont</H2>
      <Heading size="$4">Heading at $4</Heading>
      <H2 size="$6" fontWeight="700">
        H2 at $6 with an explicit 700
      </H2>
    </YStack>
  ),
};
